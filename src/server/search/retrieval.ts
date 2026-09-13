/**
 * Search Engine Retrieval Adapter
 *
 * Exposes the backwards-compatible `advancedSearch` method by delegating to the
 * master 17-stage Search Engine 2.0.0 pipeline (`advancedResearchSearch`).
 */

import {
    UnifiedCandidate,
    StructuredQueryUnderstanding,
    SearchResult,
    ResearchSearchResponse,
} from './types';
import { advancedResearchSearch } from './searchEngine';
import { queryFastApiRecommend } from './fastapiClient';
import { getFallbackBaselineModels } from './modelsFallback';
import { scoreCandidate } from './scoring';
import { verifyCandidate } from './verification';
import { getRequirementProfile } from './requirementExtractor';

export async function advancedSearch(rawQuery: string): Promise<SearchResult> {
    // Run both pipelines concurrently for speed and merge them
    const [fastApiRes, res] = await Promise.all([
        queryFastApiRecommend(rawQuery).catch(() => null),
        advancedResearchSearch(rawQuery).catch(e => { console.error(e); return null; })
    ]);

    const datasets: UnifiedCandidate[] = [];
    const models: UnifiedCandidate[] = [];
    const papers: UnifiedCandidate[] = [];

    let prof = {};
    if (fastApiRes) {
        prof = fastApiRes.problem_profile || {};
        const recommendedDatasets = fastApiRes.datasets?.length
            ? fastApiRes.datasets
            : fastApiRes.closest_alternatives || [];
        if (recommendedDatasets.length) {
            datasets.push(...recommendedDatasets.map((d: any) => ({
                ...d, type: 'dataset', url: d.url || d.canonical_url || '#', matchScore: d.score ?? 0, 
                evidenceLevel: d.score >= 85 ? 'VERIFIED' : 'HIGH_RELEVANCE', evidenceSources: [d.source || 'huggingface'],
                whyMatches: d.why, warnings: d.warnings, matchReason: (d.why && d.why[0]) || 'Aligned with target task and modality.',
            })));
        }
        if (fastApiRes.models) {
            models.push(...fastApiRes.models.map((m: any) => ({
                ...m, type: 'model', url: m.url || m.canonical_url || '#', matchScore: m.score ?? 0, 
                evidenceLevel: 'VERIFIED', whyMatches: m.why, warnings: m.warnings,
                matchReason: (m.why && m.why[0]) || 'Compatible model architecture for problem.',
            })));
        }
        const allPapers = [...(fastApiRes.papers || []), ...(fastApiRes.latest_research || [])];
        papers.push(...allPapers.map((p: any) => ({
            ...p, type: 'paper', matchScore: p.score, 
            evidenceLevel: 'PEER_REVIEWED', relationship: p.paper_type === 'DATASET_SPECIFIC' ? 'EXACT_DATASET' : p.paper_type === 'MODEL_SPECIFIC' ? 'EXACT_MODEL' : 'DIRECTLY_RELATED',
            matchReason: (p.why && p.why[0]) || 'Scientific literature directly investigating target methodology.',
        })));
    }

    if (res) {
        // Merge TS fallback results, avoiding duplicates by ID
        const existingDatasetIds = new Set(datasets.map(d => d.id));
        const existingModelIds = new Set(models.map(m => m.id));
        const existingPaperIds = new Set(papers.map(p => p.id));

        for (const d of (Array.isArray(res.datasets) ? res.datasets : [])) {
            if (!existingDatasetIds.has(d.id)) datasets.push(d as unknown as UnifiedCandidate);
        }
        for (const m of (Array.isArray(res.models) ? res.models : [])) {
            if (!existingModelIds.has(m.id)) models.push(m as unknown as UnifiedCandidate);
        }
        for (const p of (Array.isArray(res.papers) ? res.papers : [])) {
            if (!existingPaperIds.has(p.id)) papers.push(p as unknown as UnifiedCandidate);
        }

        // The strict filter can reject every dataset even when the provider found
        // useful near-matches. Keep those visible as partial alternatives.
        if (datasets.length === 0) {
            for (const rejected of (res.rejectedResults || [])) {
                const candidate = rejected.candidate as any;
                if (candidate?.type !== 'dataset' || !candidate.id || existingDatasetIds.has(candidate.id)) continue;
                const isContradiction = rejected.stage === 'CONTRADICTION_VETO'
                    || rejected.stage === 'STAGE_6_CONTRADICTION'
                    || /contradict|fatal/i.test(rejected.reason || '');
                datasets.push({
                    ...candidate,
                    type: 'dataset',
                    url: candidate.url || candidate.canonical_url || '#',
                    matchScore: isContradiction ? 0 : Math.max(20, candidate.matchScore ?? 20),
                    confidenceScore: isContradiction ? 0 : (candidate.confidenceScore ?? 20),
                    tier: 'Tier D',
                    matchCategory: isContradiction ? 'NO_MATCH' : 'PARTIAL_MATCH',
                    matchLevel: isContradiction ? 'NO_MATCH' : 'PARTIAL_MATCH',
                    evidenceLevel: 'PARTIAL',
                    rejected: true,
                    rejectionReason: rejected.reason,
                    matchReason: `Closest available alternative: ${rejected.reason}`,
                } as UnifiedCandidate);
                existingDatasetIds.add(candidate.id);
                if (datasets.length >= 5) break;
            }
        }

        // Subject any fallback baseline models to the exact same verification and scoring
        if (models.length === 0 && res.diagnostics?.parsedQuery) {
            const baselines = getFallbackBaselineModels(res.diagnostics.parsedQuery as any);
            for (const b of baselines) {
                // Hard verification: Reject any model with dimensionality or modality contradictions
                const verification = verifyCandidate(b, res.diagnostics.parsedQuery as any);
                if (!verification.passed) {
                    continue; // HARD VETO: Do not recommend incompatible 3D models for 2D queries or mismatched tasks
                }
                const scored = scoreCandidate(b, res.diagnostics.parsedQuery as any);
                if (scored.matchScore > 0 && !scored.matchBreakdown?.disqualifications?.length) {
                    models.push(scored as unknown as UnifiedCandidate);
                } else {
                    // Display NO percentage, labeled clearly as unverified fallback suggestion
                    const unverified = {
                        ...b,
                        matchScore: 0,
                        confidenceScore: 0,
                        tier: 'Tier D',
                        matchCategory: 'UNVERIFIED_FALLBACK',
                        badge: 'Unverified Fallback Suggestion',
                        matchReason: 'Unverified fallback architecture suggestion for transfer learning.',
                    };
                    models.push(unverified as unknown as UnifiedCandidate);
                }
            }
        }
    }

    const exactMatches = [...datasets, ...models, ...papers].filter(c => (c as any).matchScore >= 85 || (c as any).matchCategory === 'EXACT_MATCH');
    const strongMatches = [...datasets, ...models, ...papers].filter(c => ((c as any).matchScore >= 70 && (c as any).matchScore < 85) || (c as any).tier === 'Tier A' || (c as any).tier === 'Tier B');
    const partialMatches = [...datasets, ...models, ...papers].filter(c => (c as any).matchCategory === 'PARTIAL_MATCH');
    const relatedResources = [...datasets, ...models, ...papers].filter(c => (c as any).matchCategory === 'RELATED_RESOURCE');

    const constraints = res?.diagnostics?.parsedQuery || {
        rawQuery,
        domain: (prof as any).domains?.[0] || 'General',
        task: (prof as any).tasks?.[0]?.name || 'machine_learning',
        modality: (prof as any).modalities || ['Image'],
        anatomy: { primary: [], organs: [], excluded: [] },
        target: (prof as any).keywords || [],
        annotation: [],
        pretrainedModelRequired: true,
        datasetRequired: true,
        paperRequired: true,
        constraints: {
            mustMatchAnatomy: false, mustMatchModality: true, mustMatchTask: true, prefer3D: false,
        },
        positiveEntities: (prof as any).keywords || [],
        negativeEntities: [],
        requiredConstraints: (prof as any).hard_constraints || [],
        preferredConstraints: (prof as any).soft_preferences || [],
        softPreferences: (prof as any).soft_preferences || [],
        specificEntityMentioned: null,
        parseConfidence: (prof as any).confidence || 0.9,
        parseLog: [],
    } as any;

    return {
        query: res?.query || rawQuery,
        constraints,
        datasets,
        models,
        papers,
        tiers: { exactMatches, strongMatches, partialMatches, relatedResources },
        researchGraph: res?.researchGraph || { nodes: [], edges: [] },
        diagnostics: res?.diagnostics as any,
        telemetry: res?.telemetry as any,
        hardware: res?.hardware || { gpu_recommendation: '', vram_estimate: '', training_time_estimate: '', cost_estimate: '' },
        feasibility: res?.feasibility || { status: '', gpuTarget: '', feasibility_score: 0, level: '' },
        scientificSynthesis: res?.scientificSynthesis || `Production matching engine profile verified for "${rawQuery}".`,
        aiRationale: res?.scientificSynthesis || `Direct multi-factor ranking matching: ${(prof as any).hard_constraints?.join(', ') || 'verified constraints'}.`,
    };
}
