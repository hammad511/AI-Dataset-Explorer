/**
 * Epistemic Confidence Scoring Engine
 *
 * Computes epistemic confidence scores (0-100) capturing metadata completeness,
 * evidence verification level, and constraint coverage—distinct from relevance.
 */

import { UnifiedCandidate, StructuredQueryUnderstanding, EvidenceLevel } from './types';

export function calculateConfidenceScore(
    candidate: UnifiedCandidate,
    evidenceLevel: EvidenceLevel,
    evidenceStrength: number,
    warningsCount: number
): number {
    let score = 30; // Base baseline

    // 1. Evidence Level Contribution (up to 40 pts)
    if (evidenceLevel === 'VERIFIED') score += 40;
    else if (evidenceLevel === 'SUPPORTED') score += 30;
    else if (evidenceLevel === 'PARTIAL') score += 15;
    else score += 5;

    // 2. Metadata Completeness Contribution (up to 20 pts)
    const hasDesc = (candidate.description?.length || 0) > 60;
    const hasLicense = Boolean(candidate.license && candidate.license !== 'unknown');
    const hasFormats = Boolean(candidate.formats && candidate.formats.length > 0);
    const hasTags = Boolean(candidate.tags && candidate.tags.length > 0);

    if (hasDesc) score += 6;
    if (hasLicense) score += 6;
    if (hasFormats) score += 4;
    if (hasTags) score += 4;

    // 3. Evidence Strength factor (up to 15 pts)
    score += Math.round((evidenceStrength / 100) * 15);

    // 4. Warning penalty (-5 pts per unverified constraint)
    score -= Math.min(25, warningsCount * 5);

    return Math.max(10, Math.min(100, score));
}

/**
 * Continuous, per-item epistemic confidence for scientific research papers.
 * Evaluates real publication venue prestige, citation impact (log scale),
 * publication recency, abstract depth, and task/domain alignment.
 * Never keyed to a static tier lookup table.
 */
export function calculatePaperConfidence(
    paper: UnifiedCandidate,
    semanticScore: number = 50,
    taskScore: number = 50,
    domainScore: number = 50
): number {
    let score = 30;

    // 1. Venue & Peer-Review Verification (up to 25 pts)
    const venue = (paper.venue || '').toLowerCase();
    const isTopTier = /nature|lancet|cell|jama|ieee\s*(?:tmi|tpami|jbhi)|neurips|iclr|cvpr|iccv|miccai|radiology/i.test(venue);
    const isPeerReviewed = isTopTier || /journal|trans|conference|proceedings|springer|elsevier|oxford|wiley|frontiers|plos/i.test(venue) || (paper.evidenceSources || []).includes('pubmed');
    const isPreprint = /arxiv|biorxiv|medrxiv/i.test(venue) || (paper.source === 'arxiv');

    if (isTopTier) score += 25;
    else if (isPeerReviewed) score += 18;
    else if (isPreprint) score += 8;
    else score += 10;

    // 2. Citation Count (continuous logarithmic scaling, up to 20 pts)
    const citations = paper.citationCount || 0;
    if (citations > 0) {
        score += Math.min(20, Math.round(5 * Math.log10(citations + 1)));
    }

    // 3. Recency & Timeliness (up to 10 pts)
    const currentYear = new Date().getFullYear();
    const year = paper.year || 2023;
    const age = Math.max(0, currentYear - year);
    if (age <= 2) score += 10;
    else if (age <= 5) score += 7;
    else if (age <= 10) score += 4;
    else score += 2;

    // 4. Abstract / Content completeness (up to 10 pts)
    const abstractLen = (paper.description || '').length;
    if (abstractLen > 500) score += 10;
    else if (abstractLen > 200) score += 6;
    else if (abstractLen > 50) score += 3;

    // 5. Scientific Domain & Task Relevance (up to 15 pts)
    const relevanceFraction = (Math.max(0, taskScore) + Math.max(0, domainScore) + Math.max(0, semanticScore)) / 300;
    score += Math.round(relevanceFraction * 15);

    return Math.max(15, Math.min(98, score));
}

/**
 * Continuous, per-item confidence calculation for datasets.
 */
export function calculateDatasetConfidence(
    dataset: UnifiedCandidate,
    verifiedCount: number,
    totalApplicableReqs: number
): number {
    let score = 25;
    const coverageRatio = totalApplicableReqs > 0 ? verifiedCount / totalApplicableReqs : 0.5;
    score += Math.round(coverageRatio * 35); // up to 35 pts from verified requirements

    // Downloads / citations factor (logarithmic, up to 15 pts)
    const downloads = dataset.downloads || 0;
    const citations = dataset.citationCount || 0;
    const metric = Math.max(downloads, citations * 10);
    if (metric > 0) {
        score += Math.min(15, Math.round(3.5 * Math.log10(metric + 1)));
    }

    // Metadata quality (up to 20 pts)
    if ((dataset.description || '').length > 100) score += 7;
    if (dataset.license && dataset.license !== 'unknown') score += 5;
    if (dataset.formats && dataset.formats.length > 0) score += 4;
    if (dataset.tags && dataset.tags.length > 0) score += 4;

    return Math.max(15, Math.min(98, score));
}

/**
 * Continuous, per-item confidence calculation for pretrained models.
 */
export function calculateModelConfidence(
    model: UnifiedCandidate,
    verifiedCount: number,
    totalApplicableReqs: number
): number {
    let score = 25;
    const coverageRatio = totalApplicableReqs > 0 ? verifiedCount / totalApplicableReqs : 0.5;
    score += Math.round(coverageRatio * 35);

    if (model.isPretrainedCheckpointVerified) score += 20;
    else if ((model as any).isArchitecturalBaseline) score += 5;

    const downloads = model.downloads || 0;
    const likes = model.likes || 0;
    const pop = Math.max(downloads, likes * 20);
    if (pop > 0) {
        score += Math.min(10, Math.round(2.5 * Math.log10(pop + 1)));
    }

    if (model.formats && model.formats.length > 0) score += 5;
    if ((model.description || '').length > 80) score += 5;

    return Math.max(15, Math.min(98, score));
}

export function classifyMatchCategory(
    anatomyScore: number,
    modalityScore: number,
    taskScore: number,
    techniqueScore: number
): 'EXACT_MATCH' | 'PARTIAL_MATCH' | 'RELATED_RESOURCE' {
    if (anatomyScore >= 85 && modalityScore >= 85 && taskScore >= 80 && techniqueScore >= 75) {
        return 'EXACT_MATCH';
    } else if (anatomyScore >= 70 && modalityScore >= 70 && (taskScore >= 60 || techniqueScore >= 60)) {
        return 'PARTIAL_MATCH';
    }
    return 'RELATED_RESOURCE';
}

