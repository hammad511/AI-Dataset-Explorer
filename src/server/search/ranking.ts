/**
 * Composite Ranking & Quality Tier Classification Engine
 *
 * Implements transparent multi-factor composite relevance scoring with strict popularity suppression,
 * Quality Tier categorization (Tier A, Tier B, Tier C, Tier D), and research graph linking.
 */

import {
    UnifiedCandidate,
    StructuredQueryUnderstanding,
    CrossEncoderEvaluation,
    MatchBreakdown,
    QualityTier,
    ResearchGraph,
} from './types';
import { evaluateCandidateCrossEncoder } from './crossEncoder';

import { calculateConfidenceScore } from './confidence';
import { extractExplicitModality } from './modalityParser';

export function calculateCompositeCandidateScore(
    candidate: UnifiedCandidate,
    understanding: StructuredQueryUnderstanding
): UnifiedCandidate {
    // Step 1: Multi-Factor Cross Evaluation
    const cross = evaluateCandidateCrossEncoder(candidate, understanding);

    // Step 2: Evidence Verification & Claim Extraction
    const candidateBlob = `${candidate.title || candidate.name || ''} ${candidate.description || ''} ${(candidate.tags || []).join(' ')}`.toLowerCase();
    const hasConfirmedSource = Boolean(candidate.url || candidate.source || (candidate.tags && candidate.tags.length > 0));
    const computedEvidenceLevel: NonNullable<UnifiedCandidate['evidenceLevel']> = (cross.domainMatch >= 0.7 && cross.targetMatch >= 0.5)
        ? 'VERIFIED'
        : 'PARTIAL';
    const verified = {
        evidenceStrength: Math.round(((cross.modalityMatch + cross.taskMatch + cross.domainMatch + cross.targetMatch) / 4) * 100),
        evidenceLevel: computedEvidenceLevel,
        confirmedClaims: hasConfirmedSource ? ['Verified repository metadata'] : [],
        warnings: cross.targetMatch === 0 ? ['Zero anchor subject overlap'] : [],
        evidenceSources: [candidate.source || 'Repository'],
        evidenceItems: []
    };

    // Step 3: Metadata & Accessibility
    const hasDesc = (candidate.description?.length || 0) > 60;
    const hasLicense = Boolean(candidate.license && candidate.license !== 'unknown');
    const hasFormats = Boolean(candidate.formats && candidate.formats.length > 0);
    const metadataCompleteness = ((hasDesc ? 35 : 10) + (hasLicense ? 35 : 10) + (hasFormats ? 30 : 10)) / 100;

    const isPublicOpen = !candidate.license?.toLowerCase().includes('restricted') && !candidate.license?.toLowerCase().includes('proprietary');
    const accessibilityScore = isPublicOpen ? 1.0 : 0.4;

    // Step 4: Popularity (Strictly Capped at 3% weight)
    const downloads = candidate.downloads || 0;
    const likes = candidate.likes || 0;
    const citations = candidate.citationCount || 0;
    const popularityScore = Math.min(1.0, (downloads > 10000 || likes > 500 || citations > 200 ? 1.0 : downloads > 1000 || likes > 50 || citations > 20 ? 0.6 : 0.2));

    // Step 5: Semantic similarity (from pre-scoring or computed)
    const semanticSimilarity = Math.min(1.0, (candidate.sourceScore || 60) / 100);

    // Step 6: Composite Formula (Relevance > Precision > Evidence > Semantic > Popularity)
    const rawComposite = (
        0.25 * cross.anatomyMatch +
        0.18 * cross.taskMatch +
        0.15 * cross.modalityMatch +
        0.10 * cross.targetMatch +
        0.08 * cross.dimensionMatch +
        0.08 * semanticSimilarity +
        0.06 * (verified.evidenceStrength / 100) +
        0.04 * metadataCompleteness +
        0.03 * accessibilityScore +
        0.03 * popularityScore
    );

    const hasAnatomyConstraint = Boolean(understanding.anatomy && understanding.anatomy.length > 0);
    const hasFatalMismatch =
        (hasAnatomyConstraint && cross.anatomyMatch === 0) ||
        cross.modalityMatch === 0 ||
        cross.targetMatch === 0;

    const finalMatchScore = hasFatalMismatch
        ? 0
        : Math.max(10, Math.min(100, Math.round(rawComposite * 100)));

    // Step 7: Epistemic Confidence Score
    const confidenceScore = calculateConfidenceScore(
        candidate,
        verified.evidenceLevel,
        verified.evidenceStrength,
        verified.warnings.length
    );

    // Step 8: Quality Tier Assignment
    // Tier A: Exact Match (Anatomy + Modality + Task + Dimension match)
    // Tier B: Strong Match (Anatomy + Modality + Task match)
    // Tier C: Partial Match (Relevant domain but one major constraint missing)
    // Tier D: Related Resources (Semantically related)
    let tier: QualityTier = 'Tier D';
    if (cross.anatomyMatch >= 0.90 && cross.modalityMatch >= 0.85 && cross.taskMatch >= 0.85 && cross.dimensionMatch >= 0.80) {
        tier = 'Tier A';
    } else if (cross.anatomyMatch >= 0.80 && cross.modalityMatch >= 0.75 && cross.taskMatch >= 0.75) {
        tier = 'Tier B';
    } else if (finalMatchScore >= 50 && (cross.anatomyMatch >= 0.60 || cross.modalityMatch >= 0.60)) {
        tier = 'Tier C';
    } else {
        tier = 'Tier D';
    }

    // Step 9: Match Breakdown
    const matchBreakdown: MatchBreakdown = {
        anatomy: Math.round(cross.anatomyMatch * 100),
        modality: Math.round(cross.modalityMatch * 100),
        task: Math.round(cross.taskMatch * 100),
        dimension: Math.round(cross.dimensionMatch * 100),
        target: Math.round(cross.targetMatch * 100),
        domain: Math.round(cross.domainMatch * 100),
        semantic: Math.round(semanticSimilarity * 100),
        evidence: Math.round(verified.evidenceStrength),
        metadata: Math.round(metadataCompleteness * 100),
        accessibility: Math.round(accessibilityScore * 100),
        popularity: Math.round(popularityScore * 100),
        overall: finalMatchScore,
        confirmedClaims: verified.confirmedClaims,
        warnings: verified.warnings,
    };

    const explicitModality = (candidate.modality && candidate.modality !== 'General' && candidate.modality !== 'unknown')
        ? candidate.modality
        : extractExplicitModality(candidate.title, candidate.description, candidate.tags, candidate.formats);

    return {
        ...candidate,
        modality: explicitModality,
        matchScore: finalMatchScore,
        confidenceScore: hasFatalMismatch ? 0 : confidenceScore,
        tier: hasFatalMismatch ? 'Tier D' : tier,
        rejected: hasFatalMismatch ? true : Boolean(candidate.rejected),
        rejectionReason: hasFatalMismatch
            ? (cross.modalityMatch === 0 ? 'Modality conflict' : (hasAnatomyConstraint && cross.anatomyMatch === 0 ? 'Anatomical conflict' : 'Zero anchor subject overlap'))
            : (candidate.rejectionReason || null),
        evidenceLevel: verified.evidenceLevel,
        evidenceSources: verified.evidenceSources,
        evidenceStrength: verified.evidenceStrength,
        matchBreakdown,
        evidence: verified.evidenceItems,
        warnings: verified.warnings,
        matchReason: cross.reason,
    };
}

/**
 * Builds the complete multi-entity research graph linking:
 * Query -> Anatomy -> Task -> Modality -> Datasets -> Models -> Papers
 */
export function buildResearchGraph(
    query: string,
    understanding: StructuredQueryUnderstanding,
    topDatasets: UnifiedCandidate[],
    topModels: UnifiedCandidate[],
    topPapers: UnifiedCandidate[]
): ResearchGraph {
    const nodes: ResearchGraph['nodes'] = [];
    const edges: ResearchGraph['edges'] = [];

    // Query node
    nodes.push({ id: 'query_root', label: query, type: 'query' });

    // Anatomy node
    const primaryAnatomy = Array.isArray(understanding.anatomy?.primary)
        ? understanding.anatomy.primary[0]
        : (Array.isArray(understanding.anatomy) ? (understanding.anatomy[0] as any) : undefined);
    if (primaryAnatomy) {
        const anatId = `anat_${primaryAnatomy}`;
        nodes.push({ id: anatId, label: String(primaryAnatomy).toUpperCase(), type: 'anatomy' });
        edges.push({ source: 'query_root', target: anatId, relationship: 'TARGETS_ANATOMY' });
    }

    // Task node
    const taskId = `task_${understanding.task || 'discovery'}`;
    nodes.push({ id: taskId, label: (understanding.task || 'discovery').toUpperCase(), type: 'task' });
    edges.push({ source: 'query_root', target: taskId, relationship: 'EXECUTES_TASK' });

    // Modality node
    const primaryModality = understanding.modality?.[0];
    if (primaryModality) {
        const modId = `mod_${primaryModality}`;
        nodes.push({ id: modId, label: String(primaryModality).toUpperCase(), type: 'modality' });
        edges.push({ source: 'query_root', target: modId, relationship: 'USES_MODALITY' });
    }

    // Top Datasets
    for (const ds of topDatasets.slice(0, 3)) {
        const dsId = `ds_${ds.id}`;
        nodes.push({ id: dsId, label: ds.title || ds.name || ds.id, type: 'dataset', metadata: { score: ds.matchScore, source: ds.source } });
        edges.push({ source: taskId, target: dsId, relationship: 'BENCHMARKED_ON' });
    }

    // Top Models
    for (const mdl of topModels.slice(0, 3)) {
        const mdlId = `mdl_${mdl.id}`;
        nodes.push({ id: mdlId, label: mdl.name || mdl.id, type: 'model', metadata: { arch: mdl.architecture, score: mdl.matchScore } });
        if (topDatasets[0]) {
            edges.push({ source: mdlId, target: `ds_${topDatasets[0].id}`, relationship: 'PRETRAINED_ON' });
        }
    }

    // Top Papers
    for (const p of topPapers.slice(0, 3)) {
        const pId = `paper_${p.id}`;
        nodes.push({ id: pId, label: p.title, type: 'paper', metadata: { year: p.year, citations: p.citationCount } });
        if (topDatasets[0]) {
            edges.push({ source: pId, target: `ds_${topDatasets[0].id}`, relationship: 'EVALUATES_ON' });
        }
    }

    return { nodes, edges };
}
