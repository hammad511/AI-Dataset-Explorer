import { ProblemProfile, UnifiedCandidate, RequirementMatch, RequirementSatisfaction } from './types';
import { checkModalityCompatibility } from './modalityCompatibilityMatrix';
import { ANATOMY_ONTOLOGY } from './ontology';
import { extractAnchorSubjectTerms } from './queryUnderstanding';

export interface VerificationResult {
    passed: boolean; // false if any HARD constraint failed
    verified: RequirementMatch[];
    unknown: RequirementMatch[];
    failed: RequirementMatch[];
}

function normalize(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Stage 6 Hard Constraint & Contradiction Verification Gate
 * Enforces:
 * 1. Universal Physical Modality Compatibility Gate
 * 2. Anatomical Conflict Veto (prevents Brain/Cardiac leakage into Abdominal queries and vice versa)
 * 3. Anchor-Subject Relevance Gate (prevents off-topic datasets/papers/models with zero subject overlap)
 * 4. Hardware VRAM, Longitudinal vs Cross-Sectional, 2D vs 3D, and Real vs Synthetic Contradictions
 */
export function verifyCandidate(
    candidate: UnifiedCandidate,
    profile: ProblemProfile
): VerificationResult {
    const verified: RequirementMatch[] = [];
    const unknown: RequirementMatch[] = [];
    const failed: RequirementMatch[] = [];

    const rawModality = Array.isArray(candidate.modality)
        ? candidate.modality
        : candidate.modality
        ? [candidate.modality]
        : [];
    const allCandModalities = [...rawModality, ...(candidate.modalities || [])].filter(Boolean);

    const candidateBlob = [
        candidate.title,
        candidate.name,
        candidate.description,
        ...(candidate.tags || []),
        candidate.domain,
        candidate.task,
        candidate.pipelineTag,
        candidate.architecture,
        ...allCandModalities,
        ...(candidate.formats || []),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    const titleAndTags = [
        candidate.title,
        candidate.name,
        ...(candidate.tags || []),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    const rawQuery = (profile.rawQuery || (profile as any).originalQuery || '').toLowerCase();

    // ── 1. UNIVERSAL MODALITY COMPATIBILITY GATE ─────────────────────────────
    const modCompat = checkModalityCompatibility(candidateBlob, rawQuery, allCandModalities);
    if (modCompat.compatibilityScore === 0) {
        failed.push({
            requirementId: 'req_modality_incompatibility',
            status: 'CONFLICT',
            evidence: `${modCompat.candidateModalityGroup} vs required ${modCompat.queryModalityGroup}`,
            confidence: 1.0,
            explanation:
                modCompat.rejectionReason ||
                `Fatal Modality Conflict: Candidate is ${modCompat.candidateModalityGroup} while query requires ${modCompat.queryModalityGroup}.`,
        });
    } else if (profile.modalities && profile.modalities.length > 0) {
        const requestedModality = profile.modalities[0].toLowerCase();
        const isGenericModality = /^(?:multimodal|general|unknown)/i.test(requestedModality);

        if (!isGenericModality) {
            let modStatus: RequirementSatisfaction = 'UNKNOWN';
            let evidence: string | null = null;

            const normReq = normalize(requestedModality);
            const hasExplicitMatch =
                allCandModalities.some(
                    (m) => normalize(m).includes(normReq) || normReq.includes(normalize(m))
                ) ||
                candidateBlob.includes(normReq) ||
                modCompat.queryModalityGroup === modCompat.candidateModalityGroup;

            if (hasExplicitMatch) {
                modStatus = 'SATISFIED';
                evidence = `Modality ${requestedModality} confirmed in metadata.`;
            } else if (allCandModalities.length > 0 && modCompat.candidateModalityGroup !== 'UNKNOWN') {
                // Check explicit medical sub-modality mismatch (e.g., query demands MRI, candidate is CT-only or X-ray-only)
                const wantsMRI = /\bmri\b|magnetic\s*resonance/i.test(rawQuery) && !/\bct\b/i.test(rawQuery);
                const wantsCT = /\bct\b|\bcta\b|computed\s*tomography/i.test(rawQuery) && !/\bmri\b/i.test(rawQuery);
                const wantsXray = /x[- ]?ray|\bcxr\b|radiograph/i.test(rawQuery);

                const candHasMRI = /\bmri\b|magnetic\s*resonance/i.test(candidateBlob);
                const candHasCT = /\bct\b|\bcta\b|computed\s*tomography/i.test(candidateBlob);
                const candHasXray = /x[- ]?ray|\bcxr\b|radiograph/i.test(candidateBlob);

                if (
                    (wantsMRI && !candHasMRI && (candHasCT || candHasXray)) ||
                    (wantsCT && !candHasCT && (candHasMRI || candHasXray)) ||
                    (wantsXray && !candHasXray && (candHasMRI || candHasCT))
                ) {
                    modStatus = 'NOT_SATISFIED';
                    evidence = `Candidate imaging modality conflicts with requested ${requestedModality}.`;
                }
            }

            const match: RequirementMatch = {
                requirementId: 'req_modality',
                status: modStatus,
                evidence,
                confidence: modStatus === 'UNKNOWN' ? 0 : 0.95,
                explanation: evidence || 'Modality metadata compatible or unspecified',
            };

            if (modStatus === 'NOT_SATISFIED') failed.push(match);
            else if (modStatus === 'SATISFIED') verified.push(match);
            else unknown.push(match);
        }
    }

    // ── 2. ANATOMICAL CONFLICT VETO ──────────────────────────────────────────
    for (const [, anatDef] of Object.entries(ANATOMY_ONTOLOGY)) {
        const queryMatchesAnat =
            anatDef.terms.some((t) => new RegExp(`\\b${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(rawQuery)) ||
            anatDef.organs.some((o) => new RegExp(`\\b${o.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(rawQuery));

        if (!queryMatchesAnat) continue;

        const candMatchesTargetAnat =
            anatDef.terms.some((t) => new RegExp(`\\b${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(candidateBlob)) ||
            anatDef.organs.some((o) => new RegExp(`\\b${o.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(candidateBlob));

        if (!candMatchesTargetAnat) {
            // Check if candidate explicitly belongs to a conflicting anatomy group
            for (const conflictKey of anatDef.conflictingGroups) {
                const conflictDef = ANATOMY_ONTOLOGY[conflictKey];
                if (!conflictDef) continue;
                const hasConflictInTitle =
                    conflictDef.terms.some((t) => new RegExp(`\\b${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(titleAndTags)) ||
                    conflictDef.organs.some((o) => new RegExp(`\\b${o.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(titleAndTags));

                if (hasConflictInTitle) {
                    failed.push({
                        requirementId: 'req_anatomy_conflict',
                        status: 'CONFLICT',
                        evidence: `Candidate targets ${conflictDef.canonical} instead of ${anatDef.canonical}`,
                        confidence: 1.0,
                        explanation: `Fatal Anatomical Conflict: Query requires ${anatDef.canonical}, but candidate targets ${conflictDef.canonical}.`,
                    });
                    break;
                }
            }
        } else {
            verified.push({
                requirementId: 'req_anatomy',
                status: 'SATISFIED',
                evidence: `Confirmed ${anatDef.canonical} anatomical terms`,
                confidence: 0.95,
                explanation: `Candidate matches target anatomy (${anatDef.canonical}).`,
            });
        }
        break;
    }

    // ── 3. ANCHOR-SUBJECT RELEVANCE GATE (Zero-Distraction Guarantee) ────────
    const { anchorTerms, expandedAnchorGroups } = extractAnchorSubjectTerms(rawQuery);
    if (expandedAnchorGroups.length > 0) {
        let matchedGroups = 0;
        const matchedLabels: string[] = [];

        for (let i = 0; i < expandedAnchorGroups.length; i++) {
            const group = expandedAnchorGroups[i];
            const hit = group.some((syn) => {
                const s = syn.toLowerCase();
                if (s.length <= 3) {
                    return new RegExp(`\\b${s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(candidateBlob);
                }
                return candidateBlob.includes(s);
            });
            if (hit) {
                matchedGroups++;
                matchedLabels.push(anchorTerms[i]);
            }
        }

        if (matchedGroups === 0) {
            // For models: allow general-purpose transfer-learning foundation models only if they match the task/modality
            const isFoundationBackbone =
                candidate.type === 'model' &&
                /\b(?:yolov8|yolov9|yolov10|detr|segformer|swin|unetr|unet|vit|convnext|resnet|efficientnet|densenet|roberta|deberta|biobert|pubmedbert|legal-bert|bge-m3|wav2vec|hubert|whisper|tabnet|xgboost)\b/i.test(
                    candidateBlob
                );

            if (!isFoundationBackbone) {
                failed.push({
                    requirementId: 'req_subject_relevance',
                    status: 'NOT_SATISFIED',
                    evidence: `0/${anchorTerms.length} subject anchors matched`,
                    confidence: 0.95,
                    explanation: `Off-topic candidate rejected: zero overlap with problem subject [${anchorTerms.join(', ')}].`,
                });
            }
        } else {
            verified.push({
                requirementId: 'req_subject_relevance',
                status: 'SATISFIED',
                evidence: `Matched subject anchors: ${matchedLabels.join(', ')}`,
                confidence: Math.min(1.0, matchedGroups / expandedAnchorGroups.length),
                explanation: `Candidate directly matches ${matchedGroups}/${expandedAnchorGroups.length} core problem subject concepts.`,
            });
        }
    }

    // ── 4. SOFT CONSTRAINT: Tasks ────────────────────────────────────────────
    const tasksList = Array.isArray(profile.tasks) ? profile.tasks : [];
    if (tasksList.length > 0) {
        for (const task of tasksList) {
            const nTask = normalize(task);
            if (!nTask || nTask === 'discovery') continue;

            const tStatus: RequirementSatisfaction =
                candidateBlob.includes(nTask) || candidateBlob.includes(task.toLowerCase())
                    ? 'SATISFIED'
                    : 'UNKNOWN';

            const match: RequirementMatch = {
                requirementId: `req_task_${nTask}`,
                status: tStatus,
                evidence: tStatus === 'SATISFIED' ? `Mentions task: ${task}` : null,
                confidence: tStatus === 'SATISFIED' ? 0.85 : 0,
                explanation: `Task check for ${task}`,
            };

            if (tStatus === 'SATISFIED') verified.push(match);
            else unknown.push(match);
        }
    }

    // ── 5. HARD CONSTRAINT: Hardware (VRAM Limit) ────────────────────────────
    if (candidate.type === 'model' && typeof profile.hardwareConstraints?.maxVramGb === 'number') {
        const maxVram = profile.hardwareConstraints.maxVramGb;
        let vramStatus: RequirementSatisfaction = 'UNKNOWN';
        let evidence = null;

        const paramMatch = candidateBlob.match(/\b(\d+(?:\.\d+)?)\s*(?:b|m)\b/i);
        if (paramMatch) {
            const val = parseFloat(paramMatch[1]);
            const isBillion = paramMatch[0].toLowerCase().includes('b');
            // 4-bit QLoRA / mixed-precision realistic training floor (~0.85 GB per billion + 1.5 GB overhead)
            const estimatedVram = isBillion ? val * 0.85 + 1.5 : val / 500;

            if (estimatedVram > maxVram * 1.15) {
                vramStatus = 'NOT_SATISFIED';
                evidence = `Estimated ${Math.round(estimatedVram)}GB VRAM required for ${paramMatch[0]} parameters exceeds limit of ${maxVram}GB.`;
            } else {
                vramStatus = 'SATISFIED';
                evidence = `Estimated ${Math.round(estimatedVram)}GB VRAM fits within ${maxVram}GB limit.`;
            }
        }

        const match: RequirementMatch = {
            requirementId: 'req_vram',
            status: vramStatus,
            evidence,
            confidence: vramStatus === 'UNKNOWN' ? 0 : 0.9,
            explanation: `VRAM constraint check against ${maxVram}GB`,
        };

        if (vramStatus === 'NOT_SATISFIED') failed.push(match);
        else if (vramStatus === 'SATISFIED') verified.push(match);
        else unknown.push(match);
    }

    // ── 6. HARD CONSTRAINT CONTRADICTION CHECKS ──────────────────────────────
    // 6a. Longitudinal vs. Cross-Sectional Contradiction
    const queryRequiresLongitudinal = /longitudinal|multi[- ]?timepoint|follow[- ]?up|progression over|serial\s*scan|repeat\s*scan/i.test(rawQuery);
    if (queryRequiresLongitudinal) {
        const isExplicitlyCrossSectional = /\bcross[- ]sectional\b|\bsingle[- ]timepoint\b|\bsingle[- ]visit\b|\bone[- ]time\s*snapshot\b/i.test(candidateBlob);
        if (isExplicitlyCrossSectional) {
            failed.push({
                requirementId: 'req_longitudinal_contradiction',
                status: 'NOT_SATISFIED',
                evidence: 'Candidate metadata explicitly admits cross-sectional structure',
                confidence: 1.0,
                explanation: 'Fatal Contradiction: Metadata explicitly describes cross-sectional / single-timepoint structure, directly contradicting the hard requirement for longitudinal multi-timepoint data.',
            });
        }
    }

    // 6b. Dimensionality Contradiction: 2D vs 3D
    const queryRequires3D = /\b(?:3d|3-d|volumetric|voxel|ct\b|mri\b|cbct|nifti|\.nii)\b/i.test(rawQuery);
    const queryRequires2D = /\b(?:2d|2-d|planar|fundus|retinal\s*photograph|rgb|dermoscop|skin\s*lesion)\b/i.test(rawQuery) && !queryRequires3D;

    if (queryRequires2D) {
        const isCandidate3D =
            /\b(?:3d\s*(?:mri|ct|volume|volumetric|segmentation|unetr)|swin[- ]unetr|sam[- ]med3d|voxel|nifti|\.nii(?:\.gz)?)\b/i.test(candidateBlob) &&
            !/\b2d\b/i.test(candidateBlob);
        if (isCandidate3D) {
            failed.push({
                requirementId: 'req_dimension_contradiction',
                status: 'NOT_SATISFIED',
                evidence: 'Candidate is 3D volumetric architecture/dataset',
                confidence: 1.0,
                explanation: 'Fatal Contradiction: Candidate is 3D volumetric, directly contradicting the hard requirement for 2D planar imaging.',
            });
        }
    } else if (queryRequires3D) {
        const isCandidate2DOnly =
            /\b(?:2d\s*rgb\s*only|2d\s*planar\s*photographs?|natural\s*images?\s*only|2d\s*tif|2d\s*slice)\b/i.test(candidateBlob) &&
            !/\b(?:3d|volumetric)\b/i.test(candidateBlob);
        if (isCandidate2DOnly) {
            failed.push({
                requirementId: 'req_dimension_contradiction',
                status: 'NOT_SATISFIED',
                evidence: 'Candidate is 2D planar only',
                confidence: 1.0,
                explanation: 'Fatal Contradiction: Candidate is 2D planar only, directly contradicting the hard requirement for 3D volumetric imaging.',
            });
        }
    }

    // 6c. Real Patient Data vs. Synthetic Contradiction
    const queryRequiresRealPatient = /\b(?:patient\s*clinical\s*data|real[- ]patient|clinical\s*cohort|\d+[\s,]*patients|confirmed\s*progression\s*labels?|electronic\s*health\s*records?|ehr\b)\b/i.test(rawQuery);
    if (queryRequiresRealPatient) {
        const isExplicitlySynthetic = /\b(?:synthetic\s*(?:patient|data|dataset|cohort|images?)|in[- ]silico\s*(?:generated|patient|data)|diffusion[- ]generated\s*patient|artificially\s*synthesized)\b/i.test(candidateBlob);
        if (isExplicitlySynthetic) {
            failed.push({
                requirementId: 'req_synthetic_contradiction',
                status: 'NOT_SATISFIED',
                evidence: 'Candidate is synthetic/in-silico data',
                confidence: 1.0,
                explanation: 'Fatal Contradiction: Candidate is synthetic / simulated data, directly contradicting the requirement for real patient clinical cohort data.',
            });
        }
    }

    const passed = failed.length === 0;
    return { passed, verified, unknown, failed };
}
