/**
 * Confidence Calibrator
 *
 * Composes the final calibrated match score from:
 *  1. existingCrossEncoderScore  (preserved retrieval signal, 0-100)
 *  2. requirementCoverage        (new dominant term, 0-100)
 *  3. technicalCompatibility     (VRAM / architecture fit, 0-100)
 *  4. evidenceConfidence         (existing evidence quality, 0-100)
 *
 * Then applies hard-cap rules when critical requirements are violated.
 * The result must NOT label any resource DIRECT_MATCH if hard requirements fail.
 *
 * Score semantics: This is a MATCH SCORE, not a probability of correctness.
 */

import { UnifiedCandidate } from "./types";
import {
    RequirementProfile,
    RequirementMatch,
    CalibratedScore,
    MatchLevel,
} from "./types";
import { computeRequirementCoverage, computeHardConstraintScore } from "./requirementMatcher";

// ── Configurable caps ─────────────────────────────────────────────────────────
const CAPS = {
    DOMAIN_CONFLICT:            0,   // explicit domain/requirement CONFLICT in title or metadata (hard veto)
    CRITICAL_HARD_VIOLATIONS_2: 0,   // 2+ critical hard requirements missing/conflict
    CRITICAL_HARD_VIOLATION_1:  0,   // 1 critical hard requirement missing/conflict
    MULTIPLE_SOFT_VIOLATIONS:   50,  // 3+ soft requirements missing (but no hard violations)
    TASK_MISMATCH:              0,   // hard task mismatch
    NO_HARD_CAP:               100, // no violations
} as const;

// ── Weights for the composite formula ────────────────────────────────────────
const WEIGHTS = {
    crossEncoder:          0.35,
    requirementCoverage:   0.50,
    technicalCompat:       0.10,
    evidenceConfidence:    0.05,
} as const;

/**
 * Estimate technical compatibility score for a candidate.
 * Primarily evaluates models on VRAM, dimensionality, and task alignment.
 */
function estimateTechnicalCompatibility(
    candidate: UnifiedCandidate,
    matches: RequirementMatch[],
    profile: RequirementProfile
): number {
    const gpuMatch = matches.find((m) => m.requirementId === "req_gpu");
    const modalityMatch = matches.find((m) => m.requirementId === "req_modality");
    const taskMatch = matches.find((m) => m.requirementId === "req_task");

    let score = 75; // default neutral

    // GPU compatibility
    if (candidate.type === "model" && gpuMatch) {
        if (gpuMatch.status === "SATISFIED") score += 15;
        else if (gpuMatch.status === "PARTIAL") score += 0;
        else if (gpuMatch.status === "NOT_SATISFIED") score -= 35;
        else score += 0; // UNKNOWN — no penalty
    }

    // Modality compatibility
    if (modalityMatch) {
        if (modalityMatch.status === "SATISFIED") score += 10;
        else if (modalityMatch.status === "PARTIAL") score += 5;
        else if (modalityMatch.status === "NOT_SATISFIED") score -= 20;
    }

    // Task compatibility
    if (taskMatch) {
        if (taskMatch.status === "SATISFIED") score += 5;
        else if (taskMatch.status === "PARTIAL") score += 0;
        else if (taskMatch.status === "NOT_SATISFIED") score -= 10;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Count critical hard requirement violations.
 */
function countCriticalViolations(
    matches: RequirementMatch[],
    profile: RequirementProfile
): { critical: number; any: number; hasConflict: boolean } {
    let critical = 0;
    let any = 0;
    let hasConflict = false;

    for (const m of matches) {
        if (!profile.hardRequirementIds.includes(m.requirementId)) continue;
        const req = profile.requirements.find((r) => r.id === m.requirementId);
        const isCritical = req?.importance === "CRITICAL";
        const isBad = m.status === "NOT_SATISFIED" || m.status === "CONFLICT";

        if (isBad) {
            any++;
            if (isCritical) critical++;
            if (m.status === "CONFLICT") hasConflict = true;
        }
    }
    return { critical, any, hasConflict };
}

/**
 * Determine which score cap applies.
 * Returns the lowest applicable cap and its reason.
 */
function computeCap(
    violations: ReturnType<typeof countCriticalViolations>
): { cap: number | null; reason: string | null } {
    if (violations.hasConflict) {
        return { cap: 0, reason: "Hard Requirement CONFLICT: metadata explicitly contradicts query hard requirement" };
    }
    if (violations.critical >= 2) {
        return { cap: CAPS.CRITICAL_HARD_VIOLATIONS_2, reason: `${violations.critical} critical hard requirements NOT_SATISFIED` };
    }
    if (violations.critical === 1) {
        return { cap: CAPS.CRITICAL_HARD_VIOLATION_1, reason: "1 critical hard requirement NOT_SATISFIED`" };
    }
    if (violations.any >= 3) {
        return { cap: CAPS.MULTIPLE_SOFT_VIOLATIONS, reason: `${violations.any} hard requirements missing (non-critical)` };
    }
    return { cap: null, reason: null };
}

/**
 * Assign a MatchLevel based on the calibrated score and violations.
 */
function assignMatchLevel(
    score: number,
    violations: ReturnType<typeof countCriticalViolations>,
    requirementCoverage: number,
    hardConstraintScore: number
): MatchLevel {
    // NO_MATCH: hard constraint conflict or score zero/too low
    if (violations.hasConflict || score <= 0) return "NO_MATCH";
    if (score < 20) return "NO_MATCH";

    // WEAK_MATCH: broad semantic relation only
    if (score < 38) return "WEAK_MATCH";

    // PARTIAL_MATCH: useful component but incomplete
    if (violations.critical > 0 || score < 62 || requirementCoverage < 45) return "PARTIAL_MATCH";

    // STRONG_MATCH: most requirements met, minor gaps
    if (score >= 62 && score < 80 && hardConstraintScore >= 70 && requirementCoverage >= 55) return "STRONG_MATCH";

    // DIRECT_MATCH: all critical requirements satisfied + high coverage + no violations
    if (score >= 80 && violations.critical === 0 && violations.any === 0 && requirementCoverage >= 75 && hardConstraintScore >= 80) {
        return "DIRECT_MATCH";
    }

    // Default fallback
    if (score >= 65) return "STRONG_MATCH";
    return "PARTIAL_MATCH";
}

/**
 * Build a human-readable one-line explanation of the match level.
 */
function buildExplanation(
    matchLevel: MatchLevel,
    matches: RequirementMatch[],
    profile: RequirementProfile,
    candidate: UnifiedCandidate
): string {
    const title = (candidate.title || candidate.name || "").slice(0, 50);

    const missing = matches.filter((m) => m.status === "NOT_SATISFIED" && profile.hardRequirementIds.includes(m.requirementId));
    const conflicts = matches.filter((m) => m.status === "CONFLICT");
    const satisfied = matches.filter((m) => m.status === "SATISFIED");

    if (matchLevel === 'DIRECT_MATCH') {
        const satNames = satisfied.slice(0, 3).map((m) => m.requirementId.replace("req_", ""));
        return `All critical requirements satisfied: ${satNames.join(", ")}`;
    }

    if (matchLevel === 'NO_MATCH') {
        if (conflicts.length > 0) {
            const req = profile.requirements.find((r) => r.id === conflicts[0].requirementId);
            return `Domain conflict: ${conflicts[0].explanation}`;
        }
        return "Fundamental domain/modality mismatch";
    }

    const parts: string[] = [];
    if (conflicts.length > 0) {
        const req = profile.requirements.find((r) => r.id === conflicts[0].requirementId);
        parts.push(`[CONFLICT] ${req?.description?.slice(0, 40) ?? conflicts[0].explanation}`);
    }
    for (const m of missing.slice(0, 2)) {
        const req = profile.requirements.find((r) => r.id === m.requirementId);
        parts.push(`[MISSING] ${req?.description?.slice(0, 35) ?? m.requirementId.replace("req_", "")}`);
    }
    for (const m of satisfied.slice(0, 1)) {
        const req = profile.requirements.find((r) => r.id === m.requirementId);
        if (req) parts.push(`[OK] ${req.category.toLowerCase()}`);
    }

    if (matchLevel === 'PARTIAL_MATCH') return `Partial match: ${parts.join("  ")}`;
    if (matchLevel === 'STRONG_MATCH') return `Strong match -- minor gaps: ${parts.join("  ")}`;
    return `Weak match: ${parts.join("  ")}`;
}

/**
 * Main calibration function.
 * Call this AFTER the existing cross-encoder scoring to get the calibrated result.
 */
export function calibrateScore(
    crossEncoderScore: number,          // existing finalScore (0–100)
    evidenceScore: number,              // existing evidenceConfidence (0–100)
    candidate: UnifiedCandidate,
    matches: RequirementMatch[],
    profile: RequirementProfile
): CalibratedScore {
    // Early return if no requirements detected (simple query)
    if (profile.requirements.length === 0) {
        return {
            finalScore: crossEncoderScore,
            matchLevel: crossEncoderScore >= 80 ? "DIRECT_MATCH" : crossEncoderScore >= 65 ? "STRONG_MATCH" : crossEncoderScore >= 40 ? "PARTIAL_MATCH" : "WEAK_MATCH",
            requirementCoverage: 50,
            hardConstraintScore: 100,
            technicalCompatibility: 75,
            matchLevelExplanation: "Simple query — no structured requirements detected",
            cappedBy: null,
            scoringTrace: {
                crossEncoderContribution: crossEncoderScore,
                requirementContribution: 0,
                technicalContribution: 0,
                evidenceContribution: 0,
                rawBeforeCap: crossEncoderScore,
                appliedCap: null,
                capReason: null,
            },
        };
    }

    const requirementCoverage = computeRequirementCoverage(matches, profile);
    const hardConstraintScore = computeHardConstraintScore(matches, profile);
    const technicalCompatibility = estimateTechnicalCompatibility(candidate, matches, profile);
    const violations = countCriticalViolations(matches, profile);

    // Composite formula
    const crossContrib = WEIGHTS.crossEncoder * crossEncoderScore;
    const reqContrib = WEIGHTS.requirementCoverage * requirementCoverage;
    const techContrib = WEIGHTS.technicalCompat * technicalCompatibility;
    const evidContrib = WEIGHTS.evidenceConfidence * evidenceScore;
    const rawBeforeCap = crossContrib + reqContrib + techContrib + evidContrib;

    // Apply caps
    const { cap, reason: capReason } = computeCap(violations);
    const finalScore = cap !== null ? Math.min(Math.round(rawBeforeCap), cap) : Math.round(rawBeforeCap);

    const matchLevel = assignMatchLevel(finalScore, violations, requirementCoverage, hardConstraintScore);
    const matchLevelExplanation = buildExplanation(matchLevel, matches, profile, candidate);

    return {
        finalScore: Math.max(0, Math.min(100, finalScore)),
        matchLevel,
        requirementCoverage,
        hardConstraintScore,
        technicalCompatibility,
        matchLevelExplanation,
        cappedBy: capReason,
        scoringTrace: {
            crossEncoderContribution: Math.round(crossContrib),
            requirementContribution: Math.round(reqContrib),
            technicalContribution: Math.round(techContrib),
            evidenceContribution: Math.round(evidContrib),
            rawBeforeCap: Math.round(rawBeforeCap),
            appliedCap: cap,
            capReason,
        },
    };
}

/**
 * Categorize requirements into satisfied / missing / unknown / conflicting lists.
 * Used by the frontend for display.
 */
export function categorizeRequirements(
    matches: RequirementMatch[],
    profile: RequirementProfile
): {
    satisfied: string[];
    missing: string[];
    unknown: string[];
    conflicting: string[];
} {
    const satisfied: string[] = [];
    const missing: string[] = [];
    const unknown: string[] = [];
    const conflicting: string[] = [];

    for (const m of matches) {
        const req = profile.requirements.find((r) => r.id === m.requirementId);
        const label = req?.description ?? m.requirementId.replace("req_", "");
        if (m.status === "SATISFIED" || m.status === "PARTIAL") satisfied.push(label);
        else if (m.status === "NOT_SATISFIED") missing.push(label);
        else if (m.status === "CONFLICT") conflicting.push(label);
        else unknown.push(label);
    }

    return { satisfied, missing, unknown, conflicting };
}
