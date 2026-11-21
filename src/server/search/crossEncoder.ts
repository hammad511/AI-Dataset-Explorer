/**
 * Multi-Factor Cross-Encoder & Deep Relevance Evaluator
 *
 * Performs granular multi-dimensional cross-scoring for top candidate pools across:
 * 1. Anatomy Match (with conflicting anatomy veto)
 * 2. Modality Match (with physical modality compatibility)
 * 3. Task Match
 * 4. Dimensionality Match
 * 5. Target / Anchor-Subject Match (with synonym expansion)
 * 6. Domain Match (zero inflated defaults)
 * 7. Dataset / Model Suitability
 * 8. Evidence Quality
 * 9. Overall Composite Relevance
 */

import { UnifiedCandidate, StructuredQueryUnderstanding, ResearchQuerySchema, CrossEncoderEvaluation } from './types';
import { ANATOMY_ONTOLOGY, normalizeTask } from './ontology';
import { extractAnchorSubjectTerms } from './queryUnderstanding';
import { checkModalityCompatibility } from './modalityCompatibilityMatrix';

function clean(s?: any): string {
    if (Array.isArray(s)) return s.join(' ').toLowerCase().trim();
    if (typeof s === 'string') return s.toLowerCase().trim();
    return String(s ?? '').toLowerCase().trim();
}

/**
 * Deterministic Cross-Evaluation Engine
 * Computes exact normalized dimension scores based on domain knowledge and primary metadata.
 */
export function evaluateCandidateCrossEncoder(
    candidate: UnifiedCandidate,
    understanding: StructuredQueryUnderstanding | ResearchQuerySchema
): CrossEncoderEvaluation {
    const prof = understanding as any;
    const rawQuery = String(prof.rawQuery || prof.originalQuery || '');

    const primaryAnatomy: string[] = Array.isArray(prof.anatomy)
        ? prof.anatomy
        : Array.isArray(prof.anatomy?.primary)
        ? prof.anatomy.primary
        : [];
    const organsAnatomy: string[] = Array.isArray(prof.anatomy)
        ? prof.anatomy
        : Array.isArray(prof.anatomy?.organs)
        ? prof.anatomy.organs
        : [];

    const rawDomain = String(prof.primaryDomain || prof.domain || '');
    const subDomains: string[] = Array.isArray(prof.subDomain) ? prof.subDomain : [];
    const isMedicalImaging =
        /medical|biomedical|cardiac|cardiology|neuro|pulmonary|abdomen|abdominal|oncology|pathology|ophthalm|dermatol|radiology/i.test(
            rawDomain
        );

    const modalities: string[] = prof.modalities || prof.modality || [];
    const reqModality = clean(modalities[0]);
    const sequences: string[] = prof.modalitySubtypes || prof.sequence || [];
    const task =
        prof.reconstructionTasks?.[0] ||
        prof.predictionTasks?.[0] ||
        prof.estimationTasks?.[0] ||
        prof.task ||
        'discovery';

    const rawDim = Array.isArray(prof.dimensionality)
        ? prof.dimensionality[0] || 'any'
        : String(prof.dimensionality || 'any');
    const is3D = rawDim.includes('3D') || rawDim.includes('4D');
    const is2D = rawDim.includes('2D');

    const title = clean(candidate.title || candidate.name);
    const desc = clean(candidate.description);
    const tags = (candidate.tags || []).map(clean).join(' ');
    const formats = (candidate.formats || []).map(clean).join(' ');
    const titleAndTags = `${title} ${tags}`;
    const candidateBlob = `${title} ${tags} ${desc} ${formats} ${clean(candidate.modality)} ${clean(candidate.task)} ${clean(candidate.pipelineTag)} ${clean(candidate.architecture)}`;

    // ── 1. Anatomy Match (0.0 - 1.0) with Conflicting Anatomy Veto ───────────
    let anatomyMatch = 0.5;
    if (primaryAnatomy.length > 0) {
        // Resolve matching ANATOMY_ONTOLOGY definition
        let matchedAnatDef = null;
        for (const [, def] of Object.entries(ANATOMY_ONTOLOGY)) {
            const qLower = rawQuery.toLowerCase();
            if (
                def.terms.some((t) => new RegExp(`\\b${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(qLower)) ||
                def.organs.some((o) => new RegExp(`\\b${o.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(qLower))
            ) {
                matchedAnatDef = def;
                break;
            }
        }

        const queryPrimary = primaryAnatomy
            .map(clean)
            .filter((p) => p && !/^[a-z]+_[a-z]+$/i.test(p));
        const queryOrgans = [
            ...organsAnatomy.map(clean),
            ...(matchedAnatDef ? matchedAnatDef.organs.map(clean) : []),
            ...(matchedAnatDef ? matchedAnatDef.synonyms.map(clean) : []),
        ].filter(Boolean);

        const hasExactPrimary = [...queryPrimary, ...queryOrgans].some((p) => {
            if (!p || p.length < 2) return false;
            const r = new RegExp(`\\b${p.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
            return r.test(title) || r.test(tags);
        });

        const hasDescPrimary = [...queryPrimary, ...queryOrgans].some(
            (p) => p && p.length >= 3 && candidateBlob.includes(p)
        );
        const matchedOrgans = queryOrgans.filter((o) => o && candidateBlob.includes(o));

        // Check if candidate explicitly targets a conflicting anatomy
        let hasConflictingAnatomy = false;
        if (matchedAnatDef && !hasExactPrimary && !hasDescPrimary) {
            for (const conflictKey of matchedAnatDef.conflictingGroups) {
                const cDef = ANATOMY_ONTOLOGY[conflictKey];
                if (!cDef) continue;
                if (
                    cDef.terms.some((t) => new RegExp(`\\b${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(titleAndTags)) ||
                    cDef.organs.some((o) => new RegExp(`\\b${o.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(titleAndTags))
                ) {
                    hasConflictingAnatomy = true;
                    break;
                }
            }
        }

        if (hasConflictingAnatomy) {
            anatomyMatch = 0.0;
        } else if (hasExactPrimary && matchedOrgans.length >= 2) {
            anatomyMatch = 1.0;
        } else if (hasExactPrimary || matchedOrgans.length >= 2) {
            anatomyMatch = 0.95;
        } else if (hasDescPrimary || matchedOrgans.length === 1) {
            anatomyMatch = 0.80;
        } else if (isMedicalImaging && /medical|patient|scan|clinical/i.test(candidateBlob)) {
            anatomyMatch = 0.20;
        } else {
            anatomyMatch = 0.0;
        }
    }

    // ── 2. Modality Match (0.0 - 1.0) ────────────────────────────────────────
    let modalityMatch = 0.5;
    const modGate = checkModalityCompatibility(candidateBlob, rawQuery, candidate.modality);
    if (modGate.compatibilityScore === 0) {
        modalityMatch = 0.0;
    } else if (reqModality && reqModality !== 'multimodal_or_general' && reqModality !== 'multimodal / general') {
        const candModality = clean(candidate.modality || (candidate.modalities || []).join(' '));
        const isDceQuery = sequences.some((s) => /dce|contrast/i.test(s));
        const reqModTokens = reqModality.split(/[\s/]+/).filter((t) => t.length >= 2);

        if (isDceQuery && /dce|dynamic\s*contrast|contrast.?enhanced/i.test(candidateBlob)) {
            modalityMatch = 1.0;
        } else if (isDceQuery && /mri|magnetic\s*resonance/i.test(candidateBlob)) {
            modalityMatch = 0.85;
        } else if (
            candModality.includes(reqModality) ||
            title.includes(reqModality) ||
            reqModTokens.some((t) => candModality.includes(t) || title.includes(t))
        ) {
            modalityMatch = 1.0;
        } else if (
            candidateBlob.includes(reqModality) ||
            reqModTokens.some((t) => candidateBlob.includes(t)) ||
            (modGate.queryModalityGroup !== 'UNKNOWN' &&
                modGate.queryModalityGroup === modGate.candidateModalityGroup)
        ) {
            modalityMatch = 0.88;
        } else if (candidate.modalities && candidate.modalities.some((m) => clean(m).includes(reqModality))) {
            modalityMatch = 0.82;
        } else if (/mri|ct|x.?ray|image|scan/i.test(candidateBlob) && /mri|ct|x.?ray/i.test(reqModality)) {
            modalityMatch = 0.20;
        } else {
            modalityMatch = 0.0;
        }
    }

    // ── 3. Task Match (0.0 - 1.0) ────────────────────────────────────────────
    let taskMatch = 0.5;
    const reqTask = clean(task);
    if (reqTask && reqTask !== 'discovery') {
        const candTask = clean(candidate.task || candidate.pipelineTag || '');
        const normReq = normalizeTask(reqTask);
        const normCand = normalizeTask(candTask);

        if (normReq.canonical === normCand.canonical && normReq.canonical !== 'DISCOVERY') {
            taskMatch = 1.0;
        } else if (candidateBlob.includes(reqTask)) {
            taskMatch = 0.92;
        } else if (normReq.parentTask && normCand.canonical === normReq.parentTask.toUpperCase()) {
            taskMatch = 0.78;
        } else if (normReq.canonical === 'SEGMENTATION' && /mask|contour|voxel|pixel|segmentation|unetr|unet/i.test(candidateBlob)) {
            taskMatch = 0.88;
        } else if (normReq.canonical === 'SEGMENTATION' && /detection|bounding\s*box|localization/i.test(candidateBlob)) {
            taskMatch = 0.45;
        } else if (/ner\b|named\s*entity/i.test(reqTask) && /ner\b|named\s*entity|token[- ]classification|entity\s*extraction|bc5cdr/i.test(candidateBlob)) {
            taskMatch = 0.95;
        } else if (/rag\b|retrieval/i.test(reqTask) && /rag\b|retrieval|embedding|question[- ]answering|bge/i.test(candidateBlob)) {
            taskMatch = 0.92;
        } else {
            taskMatch = 0.12;
        }
    }

    // ── 4. Dimensionality Match (0.0 - 1.0) ──────────────────────────────────
    let dimensionMatch = 0.75;
    if (is3D) {
        const has3DFormat =
            formats.includes('nii') ||
            formats.includes('mha') ||
            formats.includes('nrrd') ||
            /\.nii|\.mha|\.nrrd|3d volume|volumetric|voxel|ct volume|mri volume/i.test(candidateBlob);
        const is2DSlices = /2d slice|slice-level|2d tif|png slices|tif slices/i.test(candidateBlob);

        if (has3DFormat) {
            dimensionMatch = 1.0;
        } else if (/3d\b/i.test(title)) {
            dimensionMatch = 0.95;
        } else if (/3d\b/i.test(candidateBlob)) {
            dimensionMatch = 0.82;
        } else if (is2DSlices) {
            dimensionMatch = 0.25;
        } else {
            dimensionMatch = 0.45;
        }
    } else if (is2D) {
        dimensionMatch = /2d|slice|image|photo|text|tabular|audio/i.test(candidateBlob) ? 1.0 : 0.6;
    }

    // ── 5. Target / Anchor-Subject Match (0.0 - 1.0) ─────────────────────────
    const { anchorTerms, expandedAnchorGroups } = extractAnchorSubjectTerms(rawQuery);
    let targetMatch = 0.0;
    let matchedAnchorCount = 0;
    let matchedInTitleCount = 0;

    if (expandedAnchorGroups.length > 0) {
        for (const group of expandedAnchorGroups) {
            const inTitle = group.some((syn) => {
                const s = syn.toLowerCase();
                if (s.length <= 3) {
                    return new RegExp(`\\b${s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(titleAndTags);
                }
                return titleAndTags.includes(s);
            });
            const inBlob =
                inTitle ||
                group.some((syn) => {
                    const s = syn.toLowerCase();
                    if (s.length <= 3) {
                        return new RegExp(`\\b${s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(candidateBlob);
                    }
                    return candidateBlob.includes(s);
                });

            if (inTitle) matchedInTitleCount++;
            if (inBlob) matchedAnchorCount++;
        }

        const groupCoverage = matchedAnchorCount / expandedAnchorGroups.length;
        const titleCoverage = matchedInTitleCount / expandedAnchorGroups.length;

        if (matchedAnchorCount > 0) {
            targetMatch = Math.min(1.0, groupCoverage * 0.72 + titleCoverage * 0.28 + (matchedInTitleCount > 0 ? 0.1 : 0));
        } else if (
            candidate.type === 'model' &&
            taskMatch >= 0.75 &&
            modalityMatch >= 0.75 &&
            /\b(?:yolov8|yolov9|yolov10|detr|segformer|swin|unetr|unet|vit|convnext|resnet|efficientnet|densenet|roberta|deberta|biobert|pubmedbert|legal-bert|bge-m3|wav2vec|hubert|whisper|tabnet|xgboost)\b/i.test(
                candidateBlob
            )
        ) {
            targetMatch = 0.35; // General-purpose transfer-learning backbone
        } else {
            targetMatch = 0.0;
        }
    } else {
        targetMatch = 0.5;
    }

    // ── 6. Domain Match (0.0 - 1.0) — No Inflated Default ────────────────────
    let domainMatch = 0.2;
    const domainKeywords = [
        ...rawDomain.toLowerCase().split(/[\s/&,-]+/),
        ...subDomains.join(' ').toLowerCase().split(/[\s/&,-]+/),
        ...anchorTerms,
    ].filter((w) => w.length > 2 && !/^(?:general|machine|learning|computer|vision|natural|language|processing|biomedical|data|model)$/i.test(w));

    const uniqueDomainWords = Array.from(new Set(domainKeywords));
    if (uniqueDomainWords.length > 0) {
        const hitWords = uniqueDomainWords.filter((w) => candidateBlob.includes(w));
        const hitRatio = hitWords.length / uniqueDomainWords.length;
        if (matchedAnchorCount > 0) {
            domainMatch = Math.min(1.0, Math.max(0.55, hitRatio * 0.6 + targetMatch * 0.4));
        } else if (hitWords.length > 0) {
            domainMatch = Math.min(0.65, hitRatio * 0.65);
        } else {
            domainMatch = 0.1;
        }
    } else {
        domainMatch = targetMatch;
    }

    // Enforce domain-specific gates
    if (isMedicalImaging && !/medical|radiology|clinical|hospital|scan|mri|ct\b|cta\b|x.?ray|cxr|lesion|tumor|organ|abdomen|brain|cardiac|heart|lung|chest|retina|fundus|dermoscop|nuclei|histolog|pathology/i.test(candidateBlob)) {
        domainMatch = Math.min(domainMatch, 0.15);
    }

    // ── 7. Dataset / Model Suitability (0.0 - 1.0) ───────────────────────────
    let suitability = 0.75;
    if (candidate.type === 'dataset') {
        const hasLicense = Boolean(candidate.license && candidate.license !== 'unknown');
        const hasDescription = (candidate.description?.length || 0) > 40;
        const hasFormats = (candidate.formats?.length || 0) > 0;
        suitability = (hasLicense ? 0.35 : 0.15) + (hasDescription ? 0.35 : 0.15) + (hasFormats ? 0.30 : 0.15);
    } else if (candidate.type === 'model') {
        const isPretrained = /pretrained|weights|checkpoint|transformer|unet|backbone|bert|yolo|vit|resnet/i.test(candidateBlob);
        const hasArch = Boolean(candidate.architecture && candidate.architecture !== 'Unknown');
        suitability = (isPretrained ? 0.5 : 0.2) + (hasArch ? 0.5 : 0.2);
    } else if (candidate.type === 'paper') {
        const hasDoi = Boolean(candidate.doi);
        const hasAbstract = (candidate.description?.length || 0) > 80;
        suitability = (hasDoi ? 0.5 : 0.2) + (hasAbstract ? 0.5 : 0.2);
    }

    // ── 8. Evidence Quality (0.0 - 1.0) ──────────────────────────────────────
    const evidenceQuality = Math.min(
        1.0,
        (candidate.evidence?.length || 0) * 0.25 +
            ((candidate.description?.length || 0) > 100 ? 0.35 : 0.15) +
            (candidate.license ? 0.20 : 0.05) +
            (candidate.tags && candidate.tags.length > 2 ? 0.20 : 0.05)
    );

    // ── 9. Overall Relevance ─────────────────────────────────────────────────
    const relevance =
        primaryAnatomy.length > 0
            ? anatomyMatch * 0.26 +
              targetMatch * 0.22 +
              taskMatch * 0.18 +
              modalityMatch * 0.18 +
              dimensionMatch * 0.06 +
              domainMatch * 0.05 +
              evidenceQuality * 0.03 +
              suitability * 0.02
            : targetMatch * 0.34 +
              taskMatch * 0.22 +
              modalityMatch * 0.20 +
              domainMatch * 0.12 +
              dimensionMatch * 0.05 +
              evidenceQuality * 0.04 +
              suitability * 0.03;

    // Build rationale
    const confirmed: string[] = [];
    if (anatomyMatch >= 0.85 && primaryAnatomy[0]) confirmed.push(`Anatomy: ${primaryAnatomy[0]}`);
    if (targetMatch >= 0.7 && anchorTerms.length > 0) confirmed.push(`Subject: ${anchorTerms.slice(0, 3).join(' ')}`);
    if (modalityMatch >= 0.85 && modalities[0]) confirmed.push(`Modality: ${modalities[0]}`);
    if (taskMatch >= 0.8 && task !== 'discovery') confirmed.push(`Task: ${task}`);
    if (dimensionMatch >= 0.9 && is3D) confirmed.push('3D Volume');

    const reason =
        confirmed.length > 0
            ? `Verified alignment on ${confirmed.join(', ')}.`
            : 'Partial semantic alignment with query requirements.';

    return {
        relevance: Math.max(0, Math.min(1.0, relevance)),
        anatomyMatch,
        modalityMatch,
        taskMatch,
        dimensionMatch,
        targetMatch,
        domainMatch,
        suitability,
        evidenceQuality,
        reason,
    };
}
