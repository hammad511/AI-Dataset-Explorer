/**
 * Research Paper Search Aggregator
 *
 * Orchestrates multi-query research profile construction, parallel querying across
 * Semantic Scholar, OpenAlex, arXiv, Crossref, and PubMed, deduplication, scoring,
 * relationship classification, and research synthesis generation.
 */

import type { NormalizedPaper, ResearchLandscape, ResearchSynthesis } from '@/types/papers';
import type { NormalizedDataset, NormalizedModel } from '@/types/pipeline';
import type { QueryUnderstanding } from '@/server/query-understanding/queryParser';
import { extractCoreSearchKeywords } from '@/server/assistant/keywordExtractor';
import { searchSemanticScholar } from './semanticScholar';
import { searchOpenAlex } from './openAlex';
import { searchArxiv } from './arxiv';
import { searchCrossref } from './crossref';
import { searchPubMed } from './pubmed';
import {
    normalizeSemanticScholar,
    normalizeOpenAlex,
    normalizeArxiv,
    normalizeCrossref,
    normalizePubMed,
    deduplicateAndMergePapers,
} from './paperNormalizer';
import { scorePaper, buildResearchLandscape } from './paperScorer';
import { paperQueryCache } from './paperCache';

export interface ResearchSearchInput {
    query: string;
    queryUnderstanding?: QueryUnderstanding;
    datasets?: Partial<NormalizedDataset>[];
    models?: Partial<NormalizedModel>[];
    bestDataset?: Partial<NormalizedDataset> | null;
    bestModel?: Partial<NormalizedModel> | null;
    limit?: number;
}

export interface ResearchSearchResult {
    papers: NormalizedPaper[];
    researchLandscape: ResearchLandscape;
    researchSynthesis: ResearchSynthesis;
    audit: Record<string, any>;
}

/**
 * Builds targeted scholarly search queries based on the project research profile.
 * Uses sub-string extraction to ensure concise 2-5 word queries are sent to academic APIs.
 */
function buildScholarlyQueries(input: ResearchSearchInput): string[] {
    const queries: string[] = [];
    const qu = input.queryUnderstanding;
    const rawQuery = input.query.trim();

    // 1. Extract concise core sub-string keywords
    const extracted = extractCoreSearchKeywords(rawQuery);
    if (extracted.primaryQuery) queries.push(extracted.primaryQuery);
    if (extracted.secondaryQuery && extracted.secondaryQuery !== extracted.primaryQuery) {
        queries.push(extracted.secondaryQuery);
    }
    if (extracted.tertiaryQuery && !queries.includes(extracted.tertiaryQuery)) {
        queries.push(extracted.tertiaryQuery);
    }

    // 2. Short raw user query (only if <= 5 words)
    if (rawQuery && rawQuery.split(/\s+/).length <= 5) {
        queries.push(rawQuery);
    }

    // 3. Exact dataset names & repository IDs
    if (input.bestDataset?.id) {
        queries.push(input.bestDataset.id);
        const shortName = input.bestDataset.id.split('/').pop();
        if (shortName && shortName !== input.bestDataset.id) {
            queries.push(shortName.replace(/_/g, ' '));
        }
    }
    if (input.bestDataset?.name && input.bestDataset.name !== input.bestDataset.id) {
        queries.push(input.bestDataset.name);
    }

    // 4. Platform & Robot specific queries (e.g. SO-101, LeRobot, Project-IRA)
    const specificEntity = qu?.specificEntityMentioned;
    const target = qu?.target.value;
    const task = qu?.task.value;
    const framework = qu?.framework.value;
    const domain = qu?.domain.value;
    const modality = qu?.modality.value;

    if (specificEntity) {
        queries.push(specificEntity);
        if (task) queries.push(`${specificEntity} ${task}`);
        if (domain) queries.push(`${specificEntity} ${domain}`);
    }

    if (target && target !== 'unknown') {
        queries.push(target);
        if (task && task !== 'unknown') queries.push(`${target} ${task}`);
        if (modality && modality !== 'unknown') queries.push(`${target} ${modality}`);
    }

    // 5. Model names (e.g. SmolVLA, Pi0.5, SegFormer)
    if (input.bestModel?.name || input.bestModel?.architecture) {
        const modelName = input.bestModel.name || input.bestModel.architecture;
        if (modelName) {
            queries.push(modelName);
            if (target && target !== 'unknown') queries.push(`${modelName} ${target}`);
            if (task && task !== 'unknown') queries.push(`${modelName} ${task}`);
        }
    }

    // 6. Task + Modality technical query
    if (task && task !== 'unknown' && modality && modality !== 'unknown') {
        queries.push(`${task} ${modality}`);
    }

    // Deduplicate and limit to concise queries (<= 6 words each)
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const q of queries) {
        const norm = q.toLowerCase().replace(/[^a-z0-9\s\-_]/g, ' ').replace(/\s+/g, ' ').trim();
        if (norm.length >= 3 && norm.split(/\s+/).length <= 6 && !seen.has(norm)) {
            seen.add(norm);
            cleaned.push(q.trim());
        }
    }

    return cleaned.slice(0, 6);
}

/**
 * Generates an evidence-grounded Research Synthesis distinguishing FACTS FROM SOURCE vs AI INTERPRETATION.
 */
function generateResearchSynthesis(
    papers: NormalizedPaper[],
    input: ResearchSearchInput,
    landscape: ResearchLandscape
): ResearchSynthesis {
    const factsFromSource: Array<{ source: string; fact: string }> = [];
    const aiInterpretation: string[] = [];

    const topPapers = papers.slice(0, 5);

    // Extract facts from top retrieved papers
    for (const paper of topPapers) {
        const yearStr = paper.year ? ` (${paper.year})` : '';
        const venueStr = paper.venue && !paper.venue.includes('Academic') ? ` in ${paper.venue}` : '';
        const citationStr = paper.citationCount ? ` [${paper.citationCount.toLocaleString()} citations]` : '';

        factsFromSource.push({
            source: `${paper.authors[0] || 'Authors'} et al.${yearStr}${venueStr}`,
            fact: `"${paper.title}" — ${paper.tldr || paper.abstract.slice(0, 160)}...${citationStr}`,
        });
    }

    // Context facts
    if (input.bestDataset?.id) {
        factsFromSource.push({
            source: `Dataset Hub (${input.bestDataset.source || 'Hub'})`,
            fact: `Selected dataset identifier: "${input.bestDataset.id}" (${input.bestDataset.task || 'ML Task'}).`,
        });
    }

    // AI Interpretations
    const domain = input.queryUnderstanding?.domain.value || 'Machine Learning';
    const task = input.queryUnderstanding?.task.value || 'AI';
    const target = input.queryUnderstanding?.target.value;

    aiInterpretation.push(
        `Research Landscape is classified as "${landscape.researchMaturity}" with ${landscape.totalPapers} relevant scientific papers discovered across open academic repositories.`
    );

    if (landscape.exactDatasetPapers > 0) {
        aiInterpretation.push(
            `Found ${landscape.exactDatasetPapers} peer-reviewed publication(s) directly using or benchmarking the target dataset.`
        );
    }

    if (target && target !== 'unknown') {
        aiInterpretation.push(
            `Literature on ${target} demonstrates growing adoption of modern deep learning architectures and standardized evaluation protocols.`
        );
    } else {
        aiInterpretation.push(
            `Recent publications in ${domain} focus heavily on ${task} improvements, self-supervised pretraining, and multimodal alignment.`
        );
    }

    if (landscape.latestPaperYear && landscape.latestPaperYear >= 2025) {
        aiInterpretation.push(
            `Recent state-of-the-art breakthroughs (${landscape.latestPaperYear}) provide viable baseline architectures for rapid transfer learning.`
        );
    }

    const summary = [
        `Analysis of ${landscape.totalPapers} scientific papers reveals an active ${landscape.researchMaturity.toLowerCase()} research trajectory in ${domain}.`,
        topPapers.length > 0
            ? `Key literature highlights ${topPapers[0].title} by ${topPapers[0].authors[0] || 'researchers'}${topPapers[0].year ? ` (${topPapers[0].year})` : ''}, addressing ${task}.`
            : `Scholarly literature provides foundational methodologies for your project.`,
        input.bestDataset ? `The dataset ${input.bestDataset.name || input.bestDataset.id} aligns directly with current experimental benchmarks.` : '',
    ].filter(Boolean).join(' ');

    return {
        summary,
        factsFromSource,
        aiInterpretation,
    };
}

/**
 * Main Paper Search Aggregator
 */
export async function searchResearchPapers(input: ResearchSearchInput): Promise<ResearchSearchResult> {
    const TRACE = process.env.DEBUG_API_TRACE === 'true';
    const cleanQuery = input.query.trim();

    // Check query cache
    const cacheKey = `aggregator:${cleanQuery.toLowerCase()}:${input.bestDataset?.id || 'nods'}:${input.bestModel?.name || 'nomdl'}`;
    const cached = paperQueryCache.get(cacheKey);
    if (cached) {
        if (TRACE) console.log('[RESEARCH] Returning cached papers for:', cleanQuery);
        const landscape = buildResearchLandscape(cached);
        const synthesis = generateResearchSynthesis(cached, input, landscape);
        return {
            papers: cached,
            researchLandscape: landscape,
            researchSynthesis: synthesis,
            audit: { cached: true, totalPapers: cached.length },
        };
    }

    const scholarlyQueries = buildScholarlyQueries(input);
    if (TRACE) console.log('[RESEARCH] Generated scholarly queries:', scholarlyQueries);

    const audit: Record<string, any> = {
        semanticScholar: { called: false, success: false, count: 0 },
        openAlex: { called: false, success: false, count: 0 },
        arxiv: { called: false, success: false, count: 0 },
        crossref: { called: false, success: false, count: 0 },
        pubmed: { called: false, success: false, count: 0 },
    };

    // Determine if PubMed is relevant (biomedical/medical imaging/clinical/EEG/seizure queries)
    const domainText = `${input.query} ${input.queryUnderstanding?.domain.value || ''} ${input.queryUnderstanding?.subdomain.value || ''}`.toLowerCase();
    const isBiomedical = /(medical|clinical|coronary|cardiac|mri|ct|x-ray|chest|tumor|lesion|cancer|retinal|histopath|biomedical|healthcare|patient|seizure|epilep|eeg|ieeg|ecog|ecg|ekg|arrhythmia|neurolog|neurosci)/i.test(domainText);

    // Primary search query for external providers
    const primaryQuery = scholarlyQueries[0] || cleanQuery;
    const secondaryQuery = scholarlyQueries[1] || primaryQuery;

    const traceS2: Record<string, unknown> = {};
    const traceAlex: Record<string, unknown> = {};
    const traceArxiv: Record<string, unknown> = {};
    const traceCross: Record<string, unknown> = {};
    const tracePub: Record<string, unknown> = {};

    // Execute multi-source calls in parallel
    const [s2Res, alexRes, arxivRes, crossrefRes, pubmedRes] = await Promise.allSettled([
        searchSemanticScholar(primaryQuery, 8, traceS2),
        searchOpenAlex(primaryQuery, 8, traceAlex),
        searchArxiv(secondaryQuery, 8, traceArxiv),
        searchCrossref(primaryQuery, 6, traceCross),
        isBiomedical ? searchPubMed(primaryQuery, 6, tracePub) : Promise.resolve([]),
    ]);

    // Normalize results
    const rawPapers: NormalizedPaper[] = [];

    if (s2Res.status === 'fulfilled' && Array.isArray(s2Res.value)) {
        audit.semanticScholar = { called: true, success: true, count: s2Res.value.length };
        for (const raw of s2Res.value) {
            rawPapers.push(normalizeSemanticScholar(raw));
        }
    } else {
        audit.semanticScholar = { called: true, success: false, error: s2Res.status === 'rejected' ? s2Res.reason?.message : 'Failed' };
    }

    if (alexRes.status === 'fulfilled' && Array.isArray(alexRes.value)) {
        audit.openAlex = { called: true, success: true, count: alexRes.value.length };
        for (const raw of alexRes.value) {
            rawPapers.push(normalizeOpenAlex(raw));
        }
    } else {
        audit.openAlex = { called: true, success: false, error: alexRes.status === 'rejected' ? alexRes.reason?.message : 'Failed' };
    }

    if (arxivRes.status === 'fulfilled' && Array.isArray(arxivRes.value)) {
        const arxivTrace = (traceArxiv.arxiv as Record<string, any>) || {};
        audit.arxiv = {
            called: true,
            success: arxivTrace.success !== false,
            count: arxivRes.value.length,
            ...(arxivTrace.httpStatus ? { httpStatus: arxivTrace.httpStatus } : {}),
            ...(arxivTrace.reason ? { reason: arxivTrace.reason } : {}),
        };
        for (const raw of arxivRes.value) {
            try {
                rawPapers.push(normalizeArxiv(raw));
            } catch (normErr: any) {
                console.warn('[ARXIV] Normalization skipped malformed item:', normErr?.message || normErr);
            }
        }
    } else {
        audit.arxiv = { called: true, success: false, count: 0, error: arxivRes.status === 'rejected' ? arxivRes.reason?.message : 'Failed' };
    }

    if (crossrefRes.status === 'fulfilled' && Array.isArray(crossrefRes.value)) {
        const crossTrace = (traceCross.crossref as Record<string, any>) || {};
        audit.crossref = {
            called: true,
            success: crossTrace.success !== false,
            count: crossrefRes.value.length,
            ...(crossTrace.httpStatus ? { httpStatus: crossTrace.httpStatus } : {}),
            ...(crossTrace.reason ? { reason: crossTrace.reason } : {}),
        };
        for (const raw of crossrefRes.value) {
            try {
                rawPapers.push(normalizeCrossref(raw));
            } catch (normErr: any) {
                console.warn('[CROSSREF] Normalization skipped malformed item:', normErr?.message || normErr);
            }
        }
    } else {
        audit.crossref = { called: true, success: false, count: 0, error: crossrefRes.status === 'rejected' ? crossrefRes.reason?.message : 'Failed' };
    }

    if (isBiomedical) {
        if (pubmedRes.status === 'fulfilled' && Array.isArray(pubmedRes.value)) {
            const pubTrace = (tracePub.pubmed as Record<string, any>) || {};
            audit.pubmed = {
                called: true,
                success: pubTrace.success !== false,
                count: pubmedRes.value.length,
                ...(pubTrace.httpStatus ? { httpStatus: pubTrace.httpStatus } : {}),
                ...(pubTrace.reason ? { reason: pubTrace.reason } : {}),
            };
            for (const raw of pubmedRes.value) {
                try {
                    rawPapers.push(normalizePubMed(raw));
                } catch (normErr: any) {
                    console.warn('[PUBMED] Normalization skipped malformed item:', normErr?.message || normErr);
                }
            }
        } else {
            audit.pubmed = {
                called: true,
                success: false,
                count: 0,
                error: pubmedRes.status === 'rejected' ? pubmedRes.reason?.message : 'Failed',
            };
        }
    }

    // Deduplicate & Merge
    const deduplicated = deduplicateAndMergePapers(rawPapers);

    // Classification & Scoring context
    const classificationContext = {
        queryUnderstanding: input.queryUnderstanding,
        dataset: input.bestDataset,
        model: input.bestModel,
        allDatasets: input.datasets,
        allModels: input.models,
        rawQuery: input.query,
    };

    // Score all papers
    const scoredPapers = deduplicated.map((p) => scorePaper(p, classificationContext));

    // Sort papers: EXACT_DATASET first -> EXACT_MODEL -> DIRECTLY_RELATED -> High Relevance Score -> Recency -> Citations
    const sortedPapers = scoredPapers.sort((a, b) => {
        const relPriority: Record<string, number> = {
            EXACT_DATASET: 4,
            EXACT_MODEL: 3,
            DIRECTLY_RELATED: 2,
            RELATED_RESEARCH: 1,
        };
        const prioA = relPriority[a.relationship] || 0;
        const prioB = relPriority[b.relationship] || 0;

        if (prioA !== prioB) return prioB - prioA;
        if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
        const yearA = a.year || 0;
        const yearB = b.year || 0;
        if (yearB !== yearA) return yearB - yearA;
        return (b.citationCount || 0) - (a.citationCount || 0);
    });

    const finalPapers = sortedPapers.slice(0, input.limit || 16);

    // Cache the sorted papers
    paperQueryCache.set(cacheKey, finalPapers);

    // Build Landscape & Synthesis
    const researchLandscape = buildResearchLandscape(finalPapers);
    const researchSynthesis = generateResearchSynthesis(finalPapers, input, researchLandscape);

    if (TRACE) {
        console.log(`[RESEARCH] Discovered ${rawPapers.length} raw -> ${deduplicated.length} unique -> ${finalPapers.length} returned`);
        console.log('[RESEARCH] Landscape:', JSON.stringify(researchLandscape));
    }

    return {
        papers: finalPapers,
        researchLandscape,
        researchSynthesis,
        audit,
    };
}
