/**
 * Kaggle Dataset Search — Query-Understanding-Driven
 *
 * Uses structured QueryUnderstanding to build targeted search queries
 * and fetches real datasets from the Kaggle API with verbose server logging.
 */

import type { NormalizedDataset } from '@/types/pipeline';
import type { QueryUnderstanding } from '@/server/query-understanding/queryParser';
import type { ExpandedQueries } from '@/server/query-understanding/queryExpander';
import { searchResultCache, searchKey } from '../cache/metadataCache';
import {
    getKaggleAuthHeaders,
    isKaggleConfigured,
    fetchKaggleWithRetry,
    normalizeKaggleDatasetItem,
    KAGGLE_DATASETS_LIST_ENDPOINT,
} from '@/server/providers/kaggle';

interface FetchDiagnostics {
    networkFailures: number;
}

async function kaggleFetch(
    url: string,
    headers: Record<string, string>,
    timeoutMs: number,
    diagnostics?: FetchDiagnostics
): Promise<Response | null> {
    return fetchKaggleWithRetry(url, headers, {
        timeoutMs,
        maxRetries: 2,
        onNetworkFailure: () => {
            if (diagnostics) diagnostics.networkFailures += 1;
        },
    });
}

// ── Modality inference from Kaggle tags/title ─────────────────────────────────

function inferKaggleModality(title: string, desc: string, tags: string[]): string {
    const blob = [title, desc, ...tags].join(' ').toLowerCase();
    if (/cryo[- ]?e[mt]|cryo[- ]?electron|electron\s*tomograph|subtomogram|macromolecule\s*structural/i.test(blob)) return 'Cryo-EM/ET';
    if (/fluorescen|confocal|immunofluorescen|gfp\b/i.test(blob)) return 'Fluorescence';
    if (/genom|transcriptom|rna[- ]?seq|single[- ]?cell/i.test(blob)) return 'Genomics/Tabular';
    if (/\bmri\b|magnetic.?resonance|t1[- ]weighted|t2[- ]weighted|t1w?|t2w?|flair|dce[- ]mri/i.test(blob)) return 'MRI';
    if (/\bct\b|computed.?tomograph|\bcta\b|cardiac.?ct|hrct|cbct/i.test(blob)) return 'CT';
    if (/x.?ray|radiograph|\bcxr\b/i.test(blob)) return 'X-ray';
    if (/ultrasound|echocardio|sonograph/i.test(blob)) return 'Ultrasound';
    if (/histopatholog|patholog|whole.?slide|\bwsi\b|biopsy/i.test(blob)) return 'Histopathology';
    if (/dermoscop/i.test(blob)) return 'Dermoscopy';
    if (/fundus|retinal/i.test(blob)) return 'Fundus Photography';
    if (/angiograph/i.test(blob)) return 'Angiography';
    if (/\bvideo\b|\bmp4\b|\bavi\b/i.test(blob)) return 'Video';
    if (/\baudio\b|\bwav\b|\bmp3\b|speech|acoustic/i.test(blob)) return 'Audio';
    if (/\btabular\b|\bcsv\b|\bspreadsheet\b/i.test(blob)) return 'Tabular';
    // Survey / health indicator datasets = tabular unless imaging keywords present
    if (/health.?indicator|survey|questionnaire|clinical.?trial|patient.?record|ehr/i.test(blob)) return 'Tabular';
    if (/\bimage\b|\bphoto\b|\bpng\b|\bjpeg\b/i.test(blob)) return 'Image';
    if (/\btext\b|\bnlp\b|\bdocument\b/i.test(blob)) return 'Text';
    return 'General';
}

function inferKaggleTask(title: string, desc: string, tags: string[]): string {
    const blob = [title, desc, ...tags].join(' ').toLowerCase();
    if (/segment(?:ation)?/i.test(blob)) return 'segmentation';
    if (/object\s*detect/i.test(blob)) return 'object detection';
    if (/classif(?:y|ication)/i.test(blob)) return 'classification';
    if (/detect(?:ion)?/i.test(blob)) return 'detection';
    if (/predict/i.test(blob)) return 'prediction';
    if (/regression/i.test(blob)) return 'regression';
    if (/forecast/i.test(blob)) return 'forecasting';
    if (/recogni/i.test(blob)) return 'recognition';
    return 'unknown';
}

// ── Main search function ──────────────────────────────────────────────────────

export async function searchKaggleDatasets(
    qu: QueryUnderstanding,
    expanded: ExpandedQueries,
    trace?: Record<string, unknown>
): Promise<Partial<NormalizedDataset>[]> {
    const TIMEOUT = parseInt(process.env.EXTERNAL_API_TIMEOUT_MS || '15000', 10);

    if (!isKaggleConfigured()) {
        if (trace) { trace.called = false; trace.success = false; trace.reason = 'Kaggle credentials (KAGGLE_API_TOKEN or KAGGLE_USERNAME + KAGGLE_KEY) not configured'; }
        console.warn('[Kaggle API] Warning: Kaggle credentials not configured.');
        return [];
    }

    const headers = getKaggleAuthHeaders();
    if (trace) { trace.called = true; trace.success = false; }

    const queries = expanded.kaggleDatasetQueries;
    console.log(`[Kaggle API] Starting dataset search with queries:`, queries);

    const t0 = performance.now();
    const rawResults: any[] = [];
    let httpStatus: number | null = null;
    const diagnostics: FetchDiagnostics = { networkFailures: 0 };

    for (const q of queries) {
        const cleanQuery = (q || '').trim();
        if (cleanQuery.length < 3) continue;

        const cacheKey = searchKey('kaggle', cleanQuery);
        const cached = searchResultCache.get(cacheKey);
        if (cached !== null) {
            rawResults.push(...(cached as any[]));
            continue;
        }

        const url = `${KAGGLE_DATASETS_LIST_ENDPOINT}?search=${encodeURIComponent(cleanQuery)}&sortBy=relevance&pageSize=20`;
        console.log(`[Kaggle API] Querying: "${cleanQuery}"`);
        const res = await kaggleFetch(url, headers, TIMEOUT, diagnostics);
        if (!res) continue;

        httpStatus = res.status;
        console.log(`[Kaggle API] Status: ${res.status}`);

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[Kaggle API] HTTP ${res.status} Error for query "${cleanQuery}":`, errText.slice(0, 300));
            continue;
        }
        try {
            const data = await res.json();
            const items: any[] = Array.isArray(data) ? data : [];
            searchResultCache.set(cacheKey, items);
            rawResults.push(...items);
            console.log(`[Kaggle API] Found ${items.length} datasets for query "${cleanQuery}"`);
        } catch (e: any) {
            console.error(`[Kaggle API] Parse error for query "${cleanQuery}":`, e?.message || e);
        }
    }

    // Deduplicate by ref
    const uniqueMap = new Map<string, any>();
    for (const item of rawResults) {
        if (item?.ref && !uniqueMap.has(item.ref)) uniqueMap.set(item.ref, item);
    }
    const uniqueRaw = Array.from(uniqueMap.values());

    // Relevance pre-filter with relaxed domain keywords for niche modalities
    const allKeywords = [...qu.explicitKeywords, ...qu.inferredKeywords];
    if (qu.rawQuery.toLowerCase().includes('cryo') || qu.rawQuery.toLowerCase().includes('tomography')) {
        allKeywords.push('cryo', 'cryo-et', 'cryo-em', 'electron', 'tomography', 'macromolecule', 'subtomogram', 'structural');
    }

    const filtered = uniqueRaw.filter(item => {
        if (allKeywords.length === 0) return true;
        const blob = [
            item.title, item.subtitle, item.description,
            ...(Array.isArray(item.tags) ? item.tags.map((t: any) => typeof t === 'string' ? t : t?.name ?? '') : [])
        ].join(' ').toLowerCase();
        return allKeywords.some(kw => blob.includes(kw.toLowerCase()));
    });

    // Relaxed fallback: if filtering eliminated all candidates, keep uniqueRaw
    const finalCandidates = filtered.length > 0 ? filtered : uniqueRaw;

    console.log(`[Kaggle API] Results after deduplication & relevance filter: ${finalCandidates.length} (out of ${uniqueRaw.length} total)`);

    // Normalize results
    const normalized: Partial<NormalizedDataset>[] = finalCandidates
        .map(raw => {
            const norm = normalizeKaggleDatasetItem(raw);
            if (!norm) return null;
            const { tags, description: desc, title, subtitle, ref, url, licenseName, totalBytes: sizeBytes, downloadCount, voteCount, usabilityRating, creatorName } = norm;
            const modality = inferKaggleModality(title, desc, tags);
            const task = inferKaggleTask(title, desc, tags);
            const size = sizeBytes != null
                ? sizeBytes > 1e9 ? `${(sizeBytes / 1e9).toFixed(1)} GB`
                : sizeBytes > 1e6 ? `${(sizeBytes / 1e6).toFixed(0)} MB`
                : sizeBytes > 1e3 ? `${(sizeBytes / 1e3).toFixed(0)} KB`
                : `${sizeBytes} B`
                : 'unknown';

            const evidence = [
                { value: title, state: 'CONFIRMED' as const, confidence: 1.0, source: 'Kaggle metadata', verified: true },
                { value: licenseName || 'unknown', state: licenseName ? 'CONFIRMED' as const : 'UNKNOWN' as const, confidence: licenseName ? 0.9 : 0, source: 'Kaggle metadata', verified: !!licenseName },
                { value: modality, state: modality !== 'unknown' ? 'INFERRED' as const : 'UNKNOWN' as const, confidence: modality !== 'unknown' ? 0.7 : 0, source: 'inferred from title/description/tags', verified: false },
            ];

            return {
                id: ref,
                name: title,
                title,
                subtitle,
                source: 'Kaggle' as const,
                url,
                description: desc.slice(0, 2000),
                domain: qu.domain.value ?? '',
                subdomain: qu.subdomain.value ?? '',
                task,
                modality,
                modalities: modality !== 'unknown' ? [modality] : [],
                formats: [],
                languages: [],
                license: licenseName,
                size,
                sizeBytes,
                downloads: downloadCount,
                likes: voteCount,
                creator: creatorName,
                tags,
                schema: { usabilityRating },
                splits: {},
                features: [],
                sample_count: null,
                image_resolution: null,
                video: modality === 'video',
                related_models: [],
                raw_metadata: { ...raw, usabilityRating },
                evidence,
                targetLabels: [],
                metadataQuality: computeKaggleMetadataQuality(norm, desc, tags),
                matchScore: 0,
                scoreBreakdown: { task: 0, modality: 0, domain: 0, subdomain: 0, target: 0, metadata: 0, semantic: 0, quality: 0, popularity: 0 },
                rejected: false,
                rejectionReason: null,
                matchReason: '',
            };
        })
        .filter(Boolean) as Partial<NormalizedDataset>[];

    const dur = Math.round(performance.now() - t0);
    if (trace) {
        trace.success = normalized.length > 0 || httpStatus === 200;
        trace.datasetsFound = normalized.length;
        trace.durationMs = dur;
        if (httpStatus !== null && httpStatus !== 200) trace.httpStatus = httpStatus;
        if (diagnostics.networkFailures > 0) trace.networkFailures = diagnostics.networkFailures;
        if (httpStatus === null && diagnostics.networkFailures > 0) trace.reason = 'Network connection to Kaggle failed';
    }
    console.log(`[Kaggle API] Search complete: ${normalized.length} datasets retrieved in ${dur}ms`);

    return normalized;
}

function computeKaggleMetadataQuality(item: any, desc: string, tags: string[]): number {
    let score = 0;
    if (item.title) score += 20;
    if (desc.length > 50) score += 20;
    if (desc.length > 200) score += 10;
    if (item.licenseName && item.licenseName !== 'Unknown') score += 20;
    if (tags.length > 2) score += 10;
    if (item.totalBytes != null) score += 10;
    if (item.downloadCount > 100) score += 10;
    return Math.min(100, score);
}
