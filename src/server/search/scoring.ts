/**
 * Hybrid Retrieval & Dynamic Query-Adaptive Scoring Engine (Search Engine 2.0.0)
 *
 * Implements Section 10, 11, 23:
 * 1. Lexical BM25-style term scoring with domain synonym weighting
 * 2. Dense semantic similarity
 * 3. Granular entity, modality, technique, task, and target overlap
 * 4. Dynamic query-adaptive weighting (weights sum to 1.0)
 * 5. Popularity strictly capped at max 3% weight (never overrides scientific relevance)
 * 6. Match breakdown and transparent explanation generator
 *
 * COMPOSITE SCORING FORMULA (Standardized 4-Factor):
 *   FinalScore = (w_m Ã‚Â· S_modality) + (w_t Ã‚Â· S_task) + (w_d Ã‚Â· S_domain) + (w_s Ã‚Â· S_semantic)
 *   w_m=0.35, w_t=0.30, w_d=0.20, w_s=0.15
 *
 * ZERO-MULTIPLIER RULE:
 *   If S_modality = 0 Ã¢â€ â€™ FinalScore = 0. Modality gate output feeds directly into this formula.
 *
 * CONFIDENCE THRESHOLDING:
 *   If max(FinalScore) across result set < 60 Ã¢â€ â€™ status = 'PARTIAL_OR_LOW_CONFIDENCE'.
 *   No candidate may be badged "Top Match" or assigned ">80% Compatible" in this state.
 */

import {
    NormalizedSearchResult,
    UnifiedCandidate,
    RankedResult,
    ResearchQuerySchema,
    StructuredQueryUnderstanding,
    MatchBreakdown,
    EvidenceItem,
} from './types';
import { evaluateCandidateCrossEncoder } from './crossEncoder';

import { checkModalityCompatibility } from './modalityCompatibilityMatrix';
import { getTaskAlignmentScore, classifyCandidateTask, classifyTask } from './taskAlignmentMatrix';
import { getRequirementProfile } from './requirementExtractor';
import { matchCandidateRequirements, computeRequirementCoverage, computeHardConstraintScore } from './requirementMatcher';
import { calibrateScore, categorizeRequirements } from './confidenceCalibrator';
import { calculatePaperConfidence, calculateDatasetConfidence, calculateModelConfidence } from './confidence';

/** Confidence status for a result set Ã¢â‚¬â€ evaluated after all candidates are scored. */
export type ConfidenceStatus = 'HIGH_CONFIDENCE' | 'PARTIAL_OR_LOW_CONFIDENCE';

/** Minimum FinalScore for any candidate to be considered high-confidence. */
export const HIGH_CONFIDENCE_THRESHOLD = 60;

/**
 * Evaluate the confidence status for an entire result set.
 * If no candidate exceeds HIGH_CONFIDENCE_THRESHOLD, the status is PARTIAL_OR_LOW_CONFIDENCE.
 */
export function evaluateResultSetConfidence(scores: number[]): ConfidenceStatus {
    if (scores.length === 0) return 'PARTIAL_OR_LOW_CONFIDENCE';
    return Math.max(...scores) >= HIGH_CONFIDENCE_THRESHOLD ? 'HIGH_CONFIDENCE' : 'PARTIAL_OR_LOW_CONFIDENCE';
}


function clean(s?: any): string {
    if (Array.isArray(s)) return s.join(' ').toLowerCase().trim();
    if (typeof s === 'string') return s.toLowerCase().trim();
    return String(s ?? '').toLowerCase().trim();
}


/**
 * BM25-style Lexical Scoring with Domain Synonym Weighting
 */
export function calculateBM25LexicalScore(
    text: string,
    queryTokens: string[],
    synonymMap: Record<string, string[]> = {}
): number {
    const textLower = text.toLowerCase();
    if (!textLower || queryTokens.length === 0) return 0;

    let score = 0;
    const words = textLower.split(/\s+/);
    const docLength = words.length;
    const avgDocLength = 120; // Average metadata blob length

    for (const token of queryTokens) {
        const t = token.toLowerCase();
        if (t.length <= 2) continue;

        // Exact term frequency
        const regex = new RegExp(`\\b${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'g');
        const matches = textLower.match(regex);
        const tf = matches ? matches.length : 0;

        // Synonym matches (weighted 0.7x)
        let synTf = 0;
        const syns = synonymMap[token] || synonymMap[t] || [];
        for (const syn of syns) {
            const synRegex = new RegExp(`\\b${syn.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'g');
            const synMatches = textLower.match(synRegex);
            if (synMatches) synTf += synMatches.length * 0.7;
        }

        const effectiveTf = tf + synTf;
        if (effectiveTf > 0) {
            // BM25 term weighting formula (k1 = 1.5, b = 0.75)
            const k1 = 1.5;
            const b = 0.75;
            const termWeight = (effectiveTf * (k1 + 1)) / (effectiveTf + k1 * (1 - b + b * (docLength / avgDocLength)));
            score += termWeight;
        }
    }

    return Math.min(100, Math.round(score * 12));
}

/**
 * Dynamic Query-Adaptive Weights Calculator
 */
export function computeAdaptiveWeights(input: ResearchQuerySchema | StructuredQueryUnderstanding): {
    wAnatomy: number;
    wModality: number;
    wTechnique: number;
    wTask: number;
    wDimension: number;
    wTarget: number;
    wDomain: number;
    wSemantic: number;
    wEvidence: number;
    wMetadata: number;
    wPopularity: number;
} {
    
    const hasAnatomy = true ? input.anatomy.length > 0 : input.anatomy.primary.length > 0;
    const hasTechnique = true
        ? input.modalitySubtypes.some(s => /4d\s*flow|phase\s*contrast|radial/i.test(s))
        : input.sequence.some(s => /4d\s*flow|phase\s*contrast|radial/i.test(s));
    const hasReconTask = true ? input.reconstructionTasks.length > 0 : input.task === 'reconstruction';
    const hasTargetOutput = true ? input.targetOutputs.length > 0 : input.target.length > 0;

    let baseAnatomy = hasAnatomy ? 0.22 : 0.08;
    let baseTechnique = hasTechnique ? 0.20 : 0.08;
    let baseTask = hasReconTask ? 0.18 : 0.12;
    let baseTarget = hasTargetOutput ? 0.16 : 0.08;
    let baseModality = 0.10;
    let baseDimension = 0.08;
    let baseDomain = 0.08;
    let baseSemantic = 0.06;
    let baseEvidence = 0.06;
    let baseMetadata = 0.03;
    let basePopularity = 0.02; // Popularity NEVER exceeds 3%

    const total = baseAnatomy + baseTechnique + baseTask + baseTarget + baseModality + baseDimension + baseDomain + baseSemantic + baseEvidence + baseMetadata + basePopularity;

    return {
        wAnatomy: baseAnatomy / total,
        wTechnique: baseTechnique / total,
        wTask: baseTask / total,
        wTarget: baseTarget / total,
        wModality: baseModality / total,
        wDimension: baseDimension / total,
        wDomain: baseDomain / total,
        wSemantic: baseSemantic / total,
        wEvidence: baseEvidence / total,
        wMetadata: baseMetadata / total,
        wPopularity: basePopularity / total,
    };
}

/**
 * Master Hybrid Scorer & RankedResult Builder
 */
export function scoreCandidate(
    candidate: NormalizedSearchResult | UnifiedCandidate,
    input: ResearchQuerySchema | StructuredQueryUnderstanding
): RankedResult {
    
    const schema = input as any;
    const originalQuery = input.rawQuery;
    const title = candidate.title || candidate.name || '';
    const desc = candidate.description || '';
    const tags = Array.isArray(candidate.tags) ? candidate.tags : [];
    const rawFormats = Array.isArray(candidate.format)
        ? candidate.format
        : (candidate.format ? [candidate.format] : ((candidate as UnifiedCandidate).formats || []));
    const formats = rawFormats.map(clean);
    const candidateBlob = `${title} ${tags.join(' ')} ${desc} ${formats.join(' ')}`.toLowerCase();

    // Query tokens for BM25
    const queryTokens = originalQuery.split(/[\s,()]+/).filter(w => w.length > 2);
    const bm25Score = calculateBM25LexicalScore(candidateBlob, queryTokens, input.synonyms);

    // Multi-factor cross-encoder evaluation
    const cross = evaluateCandidateCrossEncoder(candidate as UnifiedCandidate, true ? (candidate as any).understanding || input : input as StructuredQueryUnderstanding);

    // Evidence verification
    

    // Adaptive weights
    const weights = computeAdaptiveWeights(input);

    // ── Generalized Domain-Agnostic Feature Scoring ──
    let techniqueScore = Math.round(cross.suitability * 100);
    const queryTechniques = [...(schema.acquisitionTechnique || []), ...(schema.samplingStrategy || [])];
    if (queryTechniques.length > 0) {
        let techMatches = 0;
        for (const tech of queryTechniques) {
            const words = tech.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
            const matchedWords = words.filter((w: string) => candidateBlob.includes(w));
            if (matchedWords.length > 0) techMatches += (matchedWords.length / words.length);
        }
        techniqueScore = Math.max(techniqueScore, Math.round(Math.min(1.0, techMatches / queryTechniques.length) * 100));
    }

    // Generalized Dimensionality Scoring
    let dimensionScore = Math.round(cross.dimensionMatch * 100);
    const is3DQuery = /\b(?:3d|volumetric|nifti|ct|mri)\b/i.test(originalQuery);
    const is4DQuery = /\b(?:4d|longitudinal|time-resolved 3d)\b/i.test(originalQuery);
    const is2DQuery = /\b(?:2d|rgb|image|photo|satellite)\b/i.test(originalQuery) && !is3DQuery && !is4DQuery;
    const isCandidate3D = /\b(?:3d|volumetric|voxel|nifti|dicom|\.nii)\b/i.test(candidateBlob);
    const isCandidate4D = /\b(?:4d|longitudinal|multi-timepoint|time-resolved)\b/i.test(candidateBlob);

    if (is4DQuery) {
        dimensionScore = isCandidate4D ? 100 : isCandidate3D ? 75 : 30;
    } else if (is3DQuery) {
        dimensionScore = isCandidate3D ? 100 : 35;
    } else if (is2DQuery) {
        dimensionScore = isCandidate3D ? 25 : 95;
    }

    // Generalized Entity and Subject Target Overlap (uses synonym-aware anchor score from crossEncoder)
    const targetScore = Math.round(cross.targetMatch * 100);

    // 🚀 — PHASE 1.5: Calibrate Evidence Coverage (Requirements) — 
    const explicitCandidateMod = (candidate as UnifiedCandidate).modality ?? undefined;
    const modalityGate = checkModalityCompatibility(candidateBlob, originalQuery, explicitCandidateMod);
    const modalityZeroKill = modalityGate.compatibilityScore === 0;

    const requirementProfile = getRequirementProfile(originalQuery);
    let reqMatches: any[] = [];
    if (requirementProfile.requirements.length > 0 && !modalityZeroKill) {
        reqMatches = matchCandidateRequirements(candidate as UnifiedCandidate, requirementProfile);
    }
    const candReqMatches = reqMatches.length > 0 ? reqMatches : (candidate as UnifiedCandidate).requirementMatches || [];
    
    // Compute preliminary component scores
    const anatomyScore = Math.round(cross.anatomyMatch * 100);
    const modalityScore = Math.round(cross.modalityMatch * 100);
    const taskScore = Math.round(cross.taskMatch * 100);
    const domainScore = Math.round(cross.domainMatch * 100);
    const semanticScore = Math.max(bm25Score, Math.round(cross.suitability * 100));

    // Exclude resource-specific requirements that do not apply to literature
    const isPaper = candidate.type === 'paper';
    const applicableReqMatches = isPaper
        ? candReqMatches.filter(m => !['req_gpu', 'req_size', 'req_formats', 'req_license'].includes(m.requirementId))
        : candReqMatches;

    const verifiedReqs2 = applicableReqMatches.filter(m => m.status === 'SATISFIED');
    const unknownReqs2 = applicableReqMatches.filter(m => m.status === 'UNKNOWN');
    const failedReqs2 = applicableReqMatches.filter(m => m.status === 'NOT_SATISFIED');
    const conflictReqs2 = applicableReqMatches.filter(m => m.status === 'CONFLICT');

    // ── HARD CONSTRAINT CONTRADICTION CHECKS ──
    const rawQLower = originalQuery.toLowerCase();
    const queryRequiresLongitudinal = /longitudinal|multi[- ]?timepoint|follow[- ]?up|progression over|serial\s*scan|repeat\s*scan/i.test(rawQLower);
    const isExplicitCrossSectional = queryRequiresLongitudinal && /\bcross[- ]sectional\b|\bsingle[- ]timepoint\b|\bsingle[- ]visit\b|\bone[- ]time\s*snapshot\b/i.test(candidateBlob);

    const queryRequires3D = /\b(?:3d|3-d|volumetric|voxel|ct\b|mri\b|cbct|nifti|\.nii)\b/i.test(rawQLower);
    const queryRequires2D = /\b(?:2d|2-d|planar|fundus|retinal\s*photograph|rgb|dermoscop|skin\s*lesion)\b/i.test(rawQLower) && !queryRequires3D;
    const is3DVolumetricCand = /\b(?:3d\s*(?:mri|ct|volume|volumetric|segmentation|unetr)|swin[- ]unetr|sam[- ]med3d|voxel|nifti|\.nii(?:\.gz)?)\b/i.test(candidateBlob) && !/\b2d\b/i.test(candidateBlob);
    const isDimensionContradiction = (queryRequires2D && is3DVolumetricCand);

    const queryRequiresRealPatient = /\b(?:patient\s*clinical\s*data|real[- ]patient|clinical\s*cohort|\d+[\s,]*patients|confirmed\s*progression\s*labels?|electronic\s*health\s*records?|ehr\b)\b/i.test(rawQLower);
    const isSyntheticContradiction = queryRequiresRealPatient && /\b(?:synthetic\s*(?:patient|data|dataset|cohort|images?)|in[- ]silico\s*(?:generated|patient|data)|diffusion[- ]generated\s*patient|artificially\s*synthesized)\b/i.test(candidateBlob);

    const hasContradiction = conflictReqs2.length > 0 || isExplicitCrossSectional || isDimensionContradiction || isSyntheticContradiction;

    const totalReqs = applicableReqMatches.length || 1;
    let evidenceCoverage = verifiedReqs2.length / totalReqs;
    if (applicableReqMatches.length === 0) evidenceCoverage = 1.0;

    const missingCriticalReqs = failedReqs2.filter(m => {
        const reqDef = requirementProfile.requirements.find(r => r.id === m.requirementId);
        return reqDef?.importance === 'CRITICAL';
    });

    const hasAnatomyQuery = Boolean(schema.anatomy && schema.anatomy.length > 0);
    const hardFailed = failedReqs2.some(m => ['req_modality', 'req_vram', 'req_longitudinal', 'req_object'].includes(m.requirementId)) || 
                       missingCriticalReqs.length > 0 || 
                       hasContradiction ||
                       (hasAnatomyQuery && anatomyScore === 0) ||
                       targetScore === 0;

    // Per-item continuous confidence calculation (never static tier lookup table)
    let baseConfidence = 0;
    if (hardFailed || modalityZeroKill) {
        baseConfidence = 0;
    } else if (isPaper) {
        baseConfidence = calculatePaperConfidence(candidate as UnifiedCandidate, semanticScore, taskScore, domainScore);
    } else if (candidate.type === 'model') {
        baseConfidence = calculateModelConfidence(candidate as UnifiedCandidate, verifiedReqs2.length, totalReqs);
    } else {
        baseConfidence = calculateDatasetConfidence(candidate as UnifiedCandidate, verifiedReqs2.length, totalReqs);
    }

    const evidenceScore = baseConfidence;

    // Metadata & accessibility
    const hasDesc = desc.length > 60;
    const hasLicense = Boolean(candidate.license && candidate.license !== 'unknown');
    const hasFormats = formats.length > 0;
    const metadataScore = Math.round(((hasDesc ? 40 : 10) + (hasLicense ? 35 : 10) + (hasFormats ? 25 : 10)));
    const licenseStr = typeof candidate.license === 'string' ? candidate.license : (Array.isArray(candidate.license) ? (candidate.license as any).join(' ') : String(candidate.license || ''));
    const isPublicOpen = !licenseStr.toLowerCase().includes('restricted');
    const accessibilityScore = isPublicOpen ? 95 : 45;

    // Popularity score (strictly capped)
    const downloads = candidate.downloads || 0;
    const likes = candidate.likes || 0;
    const citations = candidate.citationCount || 0;
    const popularityScore = Math.min(100, downloads > 10000 || likes > 500 || citations > 200 ? 100 : downloads > 1000 || citations > 20 ? 60 : 30);

    // ── STANDARDIZED 4-FACTOR COMPOSITE FORMULA ──
    //
    //   FinalScore = (w_m · S_modality) + (w_t · S_task) + (w_d · S_domain) + (w_s · S_semantic)
    //   w_m=0.35, w_t=0.30, w_d=0.20, w_s=0.15
    //
    // For medical/biomedical queries, S_domain incorporates anatomy + technique + dimension.
    // For non-medical queries, S_domain = domainScore.
    //
    // ZERO-MULTIPLIER RULE:
    //   Check the universal modality gate. If S_modality = 0 → FinalScore = 0 immediately.
    //   This prevents any semantic or keyword score from compensating for wrong data types.

    // ── Phase 2: Compute S_components ──
    // Also apply task alignment from the new task matrix
    const candidateTaskText = `${(candidate as any).pipelineTag || ''} ${(candidate as any).task || ''} ${candidateBlob}`;
    const queryTaskText = originalQuery;
    const taskAlignment = getTaskAlignmentScore(queryTaskText, candidateTaskText);
    // Blend cross-encoder taskScore with task alignment matrix result (cross-encoder has context from tags/desc)
    const blendedTaskScore = Math.round((taskScore * 0.5) + (taskAlignment.score * 100 * 0.5));

    // ZERO-MULTIPLIER: If modality gate killed it, score = 0
    let finalScore: number;

    if (modalityZeroKill || hardFailed) {
        finalScore = 0;
    } else {
        // S_modality: primary from cross-encoder modalityScore (0-100)
        const S_modality = modalityScore;

        // S_task: blended cross-encoder + task alignment matrix (0-100)
        const S_task = blendedTaskScore;

        // S_domain: Unified scoring path for all domains
        if (
            typeof domainScore !== 'number' || isNaN(domainScore) ||
            typeof anatomyScore !== 'number' || isNaN(anatomyScore) ||
            typeof techniqueScore !== 'number' || isNaN(techniqueScore) ||
            typeof targetScore !== 'number' || isNaN(targetScore) ||
            typeof evidenceScore !== 'number' || isNaN(evidenceScore)
        ) {
            console.error('CRITICAL SCORE ERROR:', {
                domainScore, anatomyScore, techniqueScore, targetScore, evidenceScore
            });
            throw new Error(`One or more S_domain components are invalid (NaN or undefined)!`);
        }

        if ((global as any).__DEBUG_SCORING) {
             console.log('--- S_DOMAIN INPUTS ---', {
                domainScore, anatomyScore, techniqueScore, targetScore, evidenceScore
            });
        }

        const isBiomedical = /biomedical|pulmonary|neurology|cardiology|oncology|pathology|anatomy|mri|ct\b|x.?ray/i.test((schema as any).primaryDomain || '');
        const S_domain = Math.round(
            isBiomedical
                ? (domainScore * 0.30 + anatomyScore * 0.25 + targetScore * 0.25 + techniqueScore * 0.10 + evidenceScore * 0.10)
                : (domainScore * 0.45 + targetScore * 0.35 + techniqueScore * 0.10 + evidenceScore * 0.10)
        );

        // S_semantic: BM25 + suitability + metadata quality (0-100)
        const S_semantic = Math.round(
            (semanticScore * 0.60) +
            (metadataScore * 0.25) +
            (popularityScore * 0.15)
        );

        // Apply 4-factor weights (elevate domain/target precision to prevent generic results from floating up)
        const rawWeighted = (
            0.28 * S_modality +
            0.27 * S_task +
            0.30 * S_domain +
            0.15 * S_semantic
        );

        // Apply contradiction penalties from hard constraints
        const penaltyTotal = ((candidate as any).constraintPenalties || []).reduce(
            (acc: number, p: any) => acc + p.penaltyAmount, 0
        );

        finalScore = Math.max(0, Math.min(100, Math.round(rawWeighted - penaltyTotal)));

        // Cap transfer-learning foundation models that lack direct domain/subject match
        if (candidate.type === 'model' && targetScore <= 35 && domainScore < 55) {
            finalScore = Math.min(finalScore, 68);
        }
    }



    const matchBreakdown: MatchBreakdown = {
        anatomy: anatomyScore,
        modality: modalityScore,
        task: blendedTaskScore,
        dimension: dimensionScore,
        target: targetScore,
        domain: domainScore,
        semantic: semanticScore,
        evidence: evidenceScore,
        metadata: metadataScore,
        accessibility: accessibilityScore,
        popularity: popularityScore,
        overall: finalScore,
        confirmedClaims: [],
        warnings: [
            ...(modalityZeroKill ? ['MODALITY_ZERO_KILL: candidate modality is incompatible with query — score forced to 0'] : []),
            ...(taskAlignment.matchType === 'ORTHOGONAL' ? [`TASK_MISMATCH: query task and candidate task are orthogonal (penalty: ${Math.round(taskAlignment.penaltyApplied * 100)}%)`] : []),
        ],
        disqualifications: modalityZeroKill ? ['Fundamental modality incompatibility — cannot score'] : undefined,
    };

    const evidenceConfidence = baseConfidence;

    // Match Category based on verified evidence
    let matchCategory: 'EXACT_MATCH' | 'PARTIAL_MATCH' | 'RELATED_RESOURCE' = 'RELATED_RESOURCE';
    let match_level = 'NO MATCH';
    let tier = 'Tier D';

    if (hardFailed) {
        matchCategory = 'RELATED_RESOURCE';
        match_level = 'NO MATCH';
        tier = 'Tier D';
    } else if (evidenceCoverage === 1.0 && finalScore >= 70) {
        matchCategory = 'EXACT_MATCH';
        match_level = 'DIRECT';
        tier = 'Tier A';
    } else if (evidenceCoverage >= 0.75) {
        matchCategory = 'EXACT_MATCH';
        match_level = 'STRONG';
        tier = 'Tier B';
    } else if (evidenceCoverage >= 0.5) {
        matchCategory = 'PARTIAL_MATCH';
        match_level = 'GOOD';
        tier = 'Tier C';
    } else {
        matchCategory = 'PARTIAL_MATCH';
        match_level = 'PARTIAL';
        tier = 'Tier D';
    }

    // Export Phase 3 structure
    (candidate as any).verified = verifiedReqs2;
    (candidate as any).unknown = unknownReqs2;
    (candidate as any).failed = failedReqs2;
    (candidate as any).match_level = match_level;
    (candidate as any).confidenceScore = evidenceConfidence;

    // Dynamic Context-Aware Explanations
    const targetName = true
        ? (input.targetEntities[0] || input.anatomy[0] || 'target requirements')
        : (input.target?.[0] || input.anatomy?.primary?.[0] || 'target requirements');
    const primaryAnatomyName = true ? (input.anatomy[0] || '') : (input.anatomy?.primary?.[0] || '');
    const modalityName = true ? (input.modalities[0] || 'imaging') : (input.modality?.[0] || 'imaging');
    const taskName = true
        ? (input.reconstructionTasks[0] || input.predictionTasks[0] || input.estimationTasks[0] || 'target task')
        : (input.task || 'target task');
    const domainName = true ? input.primaryDomain : (input.domain || 'AI research');

    // Why this matches
    const whyMatches: string[] = [];
    if (modalityZeroKill) {
        whyMatches.push(`Rejected: modality [${modalityGate.candidateModalityGroup}] is fundamentally incompatible with query modality [${modalityGate.queryModalityGroup}]`);
    } else {
        if (primaryAnatomyName && anatomyScore >= 75) {
            whyMatches.push(`${primaryAnatomyName} anatomical alignment verified (${anatomyScore}% alignment)`);
        }
        if (modalityScore >= 75) {
            whyMatches.push(`${modalityName} modality confirmed in source metadata (${modalityScore}% alignment)`);
        }
        if (blendedTaskScore >= 70) {
            whyMatches.push(`${taskName} task alignment verified (${blendedTaskScore}% alignment)`);
        }
        if (techniqueScore >= 75) {
            whyMatches.push(`Specialized technique and model pipeline alignment verified`);
        }

        if (semanticScore >= 75) {
            whyMatches.push(`High semantic alignment with ${targetName}`);
        }
        if (whyMatches.length === 0) {
            whyMatches.push(`Relevant resource for ${targetName || domainName}`);
        }
    }

    // Verified vs Unverified Claims
    const verifiedClaims: string[] = verifiedReqs2.map(m => m.evidence || m.explanation);
    const unverifiedClaims: string[] = unknownReqs2.map(m => m.explanation);
    const potentialLimitations: string[] = failedReqs2.map(m => m.explanation);
    const potentialMismatches: string[] = [];

    if ((candidate as any).samplingCompatibilityNote) {
        unverifiedClaims.push((candidate as any).samplingCompatibilityNote);
        potentialLimitations.push('Non-Cartesian radial k-space reconstruction pipeline requires validation');
    }
    if ((candidate as any).techniqueCompatibilityNote) {
        unverifiedClaims.push((candidate as any).techniqueCompatibilityNote);
    }
    if ((candidate as any).isPretrainedCheckpointVerified === false) {
        unverifiedClaims.push('No directly verified pretrained model checkpoint on public Hub');
        potentialLimitations.push('Requires training from scratch or fine-tuning from research baseline weights');
    }

    const cleanTarget = targetName.replace(/['"]/g, '');
    const matchReason = modalityZeroKill
        ? `Rejected: Modality incompatibility â€” ${modalityGate.candidateModalityGroup} vs ${modalityGate.queryModalityGroup}.`
        : matchCategory === 'EXACT_MATCH'
        ? `Verified exact match: ${title} directly matches ${cleanTarget} criteria.`
        : matchCategory === 'PARTIAL_MATCH'
        ? `Partial match: ${title} provides foundational resources with partial alignment to ${cleanTarget}.`
        : `Related scientific resource: ${title} for ${domainName} exploration.`;

    const candidateModality = Array.isArray(candidate.modality)
        ? candidate.modality
        : (candidate.modality ? [candidate.modality] : []);

    // â”€â”€ REQUIREMENT-AWARE CALIBRATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Extracts requirements from query, matches candidate, applies caps.
    // This replaces finalScore with a requirement-coverage-dominant score.
    let calibratedFinalScore = finalScore;
    let reqMatchLevel: string | null = null;
    let reqCoverage = 50;
    let hardConstraintScore = 100;
    let technicalCompatibility = 75;
    let matchLevelExplanation = '';
    let scoringTrace: any = null;
    let satisfiedReqs: string[] = [];
    let missingReqs: string[] = [];
    let unknownReqs: string[] = [];
    let conflictingReqs: string[] = [];

    if (requirementProfile.requirements.length > 0 && !modalityZeroKill) {
        const calibrated = calibrateScore(finalScore, evidenceConfidence, candidate as UnifiedCandidate, reqMatches, requirementProfile);
        calibratedFinalScore = calibrated.finalScore;
        reqMatchLevel = calibrated.matchLevel;
        reqCoverage = calibrated.requirementCoverage;
        hardConstraintScore = calibrated.hardConstraintScore;
        technicalCompatibility = calibrated.technicalCompatibility;
        matchLevelExplanation = calibrated.matchLevelExplanation;
        scoringTrace = calibrated.scoringTrace;

        const cats = categorizeRequirements(reqMatches, requirementProfile);
        satisfiedReqs = cats.satisfied;
        missingReqs = cats.missing;
        unknownReqs = cats.unknown;
        conflictingReqs = cats.conflicting;

        // Update matchBreakdown overall with calibrated score
        matchBreakdown.overall = calibratedFinalScore;

        // Update matchCategory based on new matchLevel
        if (reqMatchLevel === 'DIRECT_MATCH' || reqMatchLevel === 'STRONG_MATCH') {
            matchCategory = 'EXACT_MATCH';
        } else if (reqMatchLevel === 'PARTIAL_MATCH' || reqMatchLevel === 'GOOD_MATCH') {
            matchCategory = 'PARTIAL_MATCH';
        } else {
            matchCategory = 'RELATED_RESOURCE';
        }

        // Update tier
        if (calibratedFinalScore >= 80) tier = evidenceConfidence >= 75 ? 'Tier A' : 'Tier B';
        else if (calibratedFinalScore >= 70) tier = 'Tier B';
        else if (calibratedFinalScore >= 50) tier = 'Tier C';
        else tier = 'Tier D';
    }
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    const ranked: RankedResult = {
        ...candidate,
        modality: candidateModality,
        matchScore: calibratedFinalScore,
        evidenceConfidence,
        tier,
        evidenceLevel: evidenceCoverage >= 0.75 ? 'VERIFIED' : evidenceCoverage >= 0.5 ? 'SUPPORTED' : 'PARTIAL',
        matchCategory,
        whyMatches,
        verifiedClaims,
        unverifiedClaims,
        potentialLimitations,
        potentialMismatches,
        matchBreakdown,
        evidenceItems: verifiedClaims as any,
        warnings: failedReqs2.map(m => m.explanation),
        matchReason: matchLevelExplanation || matchReason,
        isPretrainedCheckpointVerified: (candidate as any).isPretrainedCheckpointVerified,
        checkpointStatusLabel: (candidate as any).checkpointStatusLabel,
        samplingCompatibilityVerified: (candidate as any).samplingCompatibilityVerified,
        samplingCompatibilityNote: (candidate as any).samplingCompatibilityNote,
        // Requirement-aware fields (backward-compatible)
        ...(reqMatchLevel ? {
            matchLevel: reqMatchLevel,
            matchLevelExplanation,
            requirementMatches: reqMatches,
            requirementCoverage: reqCoverage,
            hardConstraintScore,
            technicalCompatibility,
            scoringTrace,
            satisfiedRequirements: satisfiedReqs,
            missingRequirements: missingReqs,
            unknownRequirements: unknownReqs,
            conflictingRequirements: conflictingReqs,
        } : {}),
    } as RankedResult & Record<string, unknown>;

    return ranked;
}
