/**
 * HuggingFace Dataset Search — Full Metadata Retrieval
 *
 * Fetches real dataset list results from Hugging Face API and enriches top candidates with:
 * - Full dataset card (README)
 * - parquet/config info (features, splits)
 * - Complete tags, languages, task_categories
 *
 * Security: Treats README content as data, never as instructions.
 */

import type { NormalizedDataset } from '@/types/pipeline';
import type { QueryUnderstanding } from '@/server/query-understanding/queryParser';
import type { ExpandedQueries } from '@/server/query-understanding/queryExpander';
import {
    datasetCardCache, datasetMetaCache,
    datasetCardKey, datasetMetaKey, searchResultCache, searchKey
} from '../cache/metadataCache';
import {
    getHuggingFaceHeaders,
    fetchHuggingFaceWithRetry,
    HF_EXPAND_QUERY_PARAMS,
    extractHuggingFaceLicense,
} from '@/server/providers/huggingface';

const HF_API = 'https://huggingface.co/api';
const HF_DATASETS_ENDPOINT = `${HF_API}/datasets`;

// ── Fetch helpers ─────────────────────────────────────────────────────────────

interface FetchDiagnostics {
    networkFailures: number;
}

async function hfFetch(url: string, headers: Record<string, string>, timeoutMs: number, diagnostics?: FetchDiagnostics): Promise<Response | null> {
    return fetchHuggingFaceWithRetry(url, headers, {
        timeoutMs,
        maxRetries: 2,
        onNetworkFailure: () => {
            if (diagnostics) diagnostics.networkFailures += 1;
        },
    });
}

// ── Dataset card (README) fetching ────────────────────────────────────────────

async function fetchDatasetCard(id: string, headers: Record<string, string>, timeoutMs: number): Promise<string> {
    const cacheKey = datasetCardKey(id);
    const cached = datasetCardCache.get(cacheKey);
    if (cached !== null) return cached;

    // Try the HF datasets readme endpoint
    const url = `${HF_API}/datasets/${encodeURIComponent(id)}/readme`;
    const res = await hfFetch(url, headers, timeoutMs);
    if (!res || !res.ok) {
        datasetCardCache.set(cacheKey, '');
        return '';
    }
    try {
        const data = await res.json();
        // Response is { content: "<base64 or raw text>", ... } OR plain text
        let content = '';
        if (typeof data === 'string') {
            content = data;
        } else if (data && typeof data.content === 'string') {
            // May be base64-encoded
            try {
                content = Buffer.from(data.content, 'base64').toString('utf-8');
            } catch {
                content = data.content;
            }
        } else if (data && typeof data.text === 'string') {
            content = data.text;
        }
        // Security: cap at 8000 chars to prevent prompt injection bloat
        content = content.slice(0, 8000);
        datasetCardCache.set(cacheKey, content);
        return content;
    } catch {
        datasetCardCache.set(cacheKey, '');
        return '';
    }
}

// ── Dataset info (features/splits) fetching ───────────────────────────────────

async function fetchDatasetInfo(id: string, headers: Record<string, string>, timeoutMs: number): Promise<Record<string, unknown>> {
    const cacheKey = datasetMetaKey(id);
    const cached = datasetMetaCache.get(cacheKey);
    if (cached !== null) return cached;

    // The /api/datasets/:id endpoint returns full metadata including cardData
    const url = `${HF_API}/datasets/${encodeURIComponent(id)}`;
    const res = await hfFetch(url, headers, timeoutMs);
    if (!res || !res.ok) {
        datasetMetaCache.set(cacheKey, {});
        return {};
    }
    try {
        const data = await res.json();
        datasetMetaCache.set(cacheKey, data ?? {});
        return data ?? {};
    } catch {
        datasetMetaCache.set(cacheKey, {});
        return {};
    }
}

// ── Modality inference from dataset metadata ──────────────────────────────────

function inferModalityFromMetadata(tags: string[], cardData: any, cardText: string, id: string): string[] {
    const modalities: string[] = [];
    const blob = [
        ...tags,
        cardText.slice(0, 2000),
        id,
        JSON.stringify(cardData).slice(0, 500),
    ].join(' ').toLowerCase();

    if (/\bmri\b|magnetic.?resonance|t1[- ]weighted|t2[- ]weighted|t1w?|t2w?|flair|dce[- ]mri/i.test(blob)) modalities.push('MRI');
    if (/\bct\b|computed.?tomograph|\bcta\b|cardiac.?ct|coronary.?ct|hrct|cbct/i.test(blob)) modalities.push('CT');
    if (/x.?ray|radiograph|\bcxr\b/i.test(blob)) modalities.push('X-ray');
    if (/ultrasound|echocardio|sonograph/i.test(blob)) modalities.push('Ultrasound');
    if (/histopatholog|patholog|whole.?slide|\bwsi\b|biopsy/i.test(blob)) modalities.push('Histopathology');
    if (/angiograph/i.test(blob)) modalities.push('Angiography');
    if (/fundus|ophthalmoscopy|retinal/i.test(blob)) modalities.push('Fundus Photography');
    if (/dermoscop/i.test(blob)) modalities.push('Dermoscopy');
    if (/\bvideo\b|mp4|avi\b/i.test(blob)) modalities.push('Video');
    if (/\baudio\b|\bwav\b|\bmp3\b|speech|acoustic/i.test(blob)) modalities.push('Audio');
    if (/\btabular\b|\bcsv\b|structured.?data/i.test(blob)) modalities.push('Tabular');
    if (/\btext\b|\bnlp\b|natural.?language|\bdocument\b/i.test(blob)) modalities.push('Text');
    if (/\brobot|\bmanipulat|\bteleoper/i.test(blob)) modalities.push('Robotics');
    if (/point.?cloud|\blidar\b|\b3d.?scan/i.test(blob)) modalities.push('3D Point Cloud');
    if (/\bimage\b|\bphoto\b|\bpng\b|\bjpeg\b|\bjpg\b/i.test(blob) && modalities.length === 0) modalities.push('Image');

    return modalities.length > 0 ? [...new Set(modalities)] : ['General'];
}

// ── Task inference from metadata ──────────────────────────────────────────────

function inferTaskFromMetadata(
    tags: string[],
    taskCategories: string[],
    cardText: string,
    id: string
): string {
    // First: use official task_categories from card metadata
    if (taskCategories.length > 0) {
        const tc = taskCategories[0].replace(/-/g, ' ');
        return tc;
    }

    // Second: check for task: tags
    const taskTag = tags.find(t => t.startsWith('task_categories:'));
    if (taskTag) return taskTag.replace('task_categories:', '').replace(/-/g, ' ').trim();

    // Third: keyword inference from full text + tags + id
    const blob = [...tags, cardText.slice(0, 2000), id].join(' ').toLowerCase();

    if (/segment(?:ation)?/i.test(blob)) return 'segmentation';
    if (/object\s*detect/i.test(blob)) return 'object detection';
    if (/instance\s*segment/i.test(blob)) return 'instance segmentation';
    if (/semantic\s*segment/i.test(blob)) return 'semantic segmentation';
    if (/classif(?:y|ication)/i.test(blob)) return 'classification';
    if (/imitation\s*learning|behavior\s*clon/i.test(blob)) return 'imitation learning';
    if (/manipulation|pick|place|grasp/i.test(blob)) return 'robotic manipulation';
    if (/detect(?:ion)?/i.test(blob)) return 'detection';
    if (/recogni(?:ze|tion)/i.test(blob)) return 'recognition';
    if (/generat(?:e|ion)/i.test(blob)) return 'generation';
    if (/translat/i.test(blob)) return 'translation';
    if (/question\s*answer/i.test(blob)) return 'question answering';

    return 'unknown';
}

// ── Extract schema/features from cardData ─────────────────────────────────────

function extractSchema(cardData: any, cardText: string): { features: string[]; splits: Record<string, unknown>; sampleCount: number | null } {
    const features: string[] = [];
    const splits: Record<string, unknown> = {};
    let sampleCount: number | null = null;

    try {
        // features from cardData
        if (cardData?.features) {
            for (const [name] of Object.entries(cardData.features)) {
                features.push(String(name));
            }
        }
        // splits
        if (cardData?.splits) {
            for (const [name, info] of Object.entries(cardData.splits)) {
                splits[name] = info;
                if ((info as any)?.num_examples) {
                    sampleCount = (sampleCount ?? 0) + Number((info as any).num_examples);
                }
            }
        }
        // Parse from README as fallback
        if (features.length === 0 && cardText) {
            const featureMatches = cardText.match(/[-*]\s*`?(\w[\w.]+)`?\s*:/g);
            if (featureMatches) {
                features.push(...featureMatches.slice(0, 20).map(m => m.replace(/[-*`:\s]/g, '')));
            }
        }
        if (sampleCount === null && cardText) {
            const m = cardText.match(/(\d[\d,]+)\s*(?:samples?|examples?|instances?|rows?|episodes?|frames?)/i);
            if (m) sampleCount = parseInt(m[1].replace(/,/g, ''), 10) || null;
        }
    } catch {
        // ignore parse errors
    }

    return { features, splits, sampleCount };
}

// ── Related models extraction ─────────────────────────────────────────────────

function extractRelatedModels(cardData: any, cardText: string, id: string): string[] {
    const models: string[] = [];

    // From metadata model tags
    if (Array.isArray(cardData?.model_tags)) {
        models.push(...cardData.model_tags.slice(0, 5));
    }
    // From tags: model: prefix
    if (Array.isArray(cardData?.tags)) {
        for (const t of cardData.tags) {
            if (typeof t === 'string' && t.startsWith('model:')) {
                models.push(t.replace('model:', '').trim());
            }
        }
    }

    // Organization-based: if dataset is Project-IRA, suggest their models
    if (/project.?ira/i.test(id) || /project.?ira/i.test(cardText.slice(0, 500))) {
        if (!models.some(m => /project.?ira/i.test(m))) {
            models.push('Project-IRA models');
        }
    }

    // Parse README for "trained on" / "used for" model references
    const modelRefs = cardText.match(/(?:trained|fine-tuned?|based)\s+on\s+([A-Za-z0-9_\-/]+)/gi);
    if (modelRefs) {
        models.push(...modelRefs.slice(0, 5).map(m => m.replace(/(?:trained|fine-tuned?|based)\s+on\s+/i, '').trim()));
    }

    return [...new Set(models.filter(Boolean))].slice(0, 8);
}

// ── Main search function ──────────────────────────────────────────────────────

export async function searchHuggingFaceDatasets(
    qu: QueryUnderstanding,
    expanded: ExpandedQueries,
    trace?: Record<string, unknown>
): Promise<Partial<NormalizedDataset>[]> {
    const TIMEOUT = parseInt(process.env.EXTERNAL_API_TIMEOUT_MS || '15000', 10);
    const headers = getHuggingFaceHeaders();

    if (trace) { trace.called = true; trace.success = false; }

    const queries = expanded.hfDatasetQueries;
    console.log(`[Hugging Face API] Starting dataset search with queries:`, queries);

    const t0 = performance.now();
    const rawResults: any[] = [];
    let httpStatus: number | null = null;
    const diagnostics: FetchDiagnostics = { networkFailures: 0 };

    // ── 1. Fetch search results for each query ────────────────────────────
    for (const q of queries) {
        const cacheKey = searchKey('hf-datasets', q);
        const cached = searchResultCache.get(cacheKey);
        if (cached !== null) {
            rawResults.push(...(cached as any[]));
            continue;
        }

        const url = `${HF_DATASETS_ENDPOINT}?search=${encodeURIComponent(q)}&sort=likes&direction=-1&limit=15&${HF_EXPAND_QUERY_PARAMS}`;
        console.log(`[Hugging Face API] Querying datasets: "${q}"`);
        const res = await hfFetch(url, headers, TIMEOUT, diagnostics);
        if (!res) continue;

        httpStatus = res.status;
        console.log(`[Hugging Face API] Datasets Status: ${res.status}`);

        if (!res.ok) {
            const errBody = await res.text();
            console.error(`[Hugging Face API] Dataset Error (${res.status}):`, errBody.slice(0, 300));
            continue;
        }
        try {
            const data = await res.json();
            const items: any[] = Array.isArray(data) ? data : [];
            searchResultCache.set(cacheKey, items);
            rawResults.push(...items);
            console.log(`[Hugging Face API] Found ${items.length} datasets for query "${q}"`);
        } catch (e: any) {
            console.error(`[Hugging Face API] Dataset parse error for query "${q}":`, e?.message || e);
        }
    }

    // ── 2. Deduplicate by id ──────────────────────────────────────────────
    const uniqueMap = new Map<string, any>();
    for (const d of rawResults) {
        if (d?.id && !uniqueMap.has(d.id)) uniqueMap.set(d.id, d);
    }
    const uniqueRaw = Array.from(uniqueMap.values());

    // ── 3. Relevance pre-filter — must share at least one keyword ─────────
    const allKeywords = [...qu.explicitKeywords, ...qu.inferredKeywords];
    const filtered = uniqueRaw.filter(d => {
        if (allKeywords.length === 0) return true;
        const blob = [d.id, d.description, ...(d.tags ?? [])].join(' ').toLowerCase();
        return allKeywords.some(kw => blob.includes(kw.toLowerCase()));
    });

    console.log(`[Hugging Face API] Datasets after dedup & filter: ${filtered.length} (out of ${uniqueRaw.length} total)`);

    // ── 4. Enrich top N candidates with full dataset card ─────────────────
    // Only enrich top 20 (by likes) to avoid excessive API calls
    const toEnrich = filtered
        .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
        .slice(0, 20);

    const enriched: Partial<NormalizedDataset>[] = await Promise.all(
        toEnrich.map(d => enrichDataset(d, headers, TIMEOUT, qu))
    );

    const dur = Math.round(performance.now() - t0);
    if (trace) {
        trace.success = enriched.length > 0 || httpStatus === 200;
        trace.datasetsFound = enriched.length;
        trace.durationMs = dur;
        if (httpStatus !== null && httpStatus !== 200) trace.httpStatus = httpStatus;
        if (diagnostics.networkFailures > 0) trace.networkFailures = diagnostics.networkFailures;
        if (httpStatus === null && diagnostics.networkFailures > 0) trace.reason = 'Network connection to Hugging Face failed';
    }
    console.log(`[Hugging Face API] Dataset search complete: ${enriched.length} datasets retrieved in ${dur}ms`);

    return enriched;
}

async function enrichDataset(
    d: any,
    headers: Record<string, string>,
    timeoutMs: number,
    qu: QueryUnderstanding
): Promise<Partial<NormalizedDataset>> {
    const id: string = d.id ?? '';

    // If expanded metadata (cardData/tags/siblings) is already present from ?expand[], avoid redundant /api/datasets/:id call
    const hasExpandedMeta = !!(d?.cardData || Array.isArray(d?.siblings));
    const [fullMeta, cardText] = await Promise.all([
        hasExpandedMeta ? Promise.resolve(d as Record<string, unknown>) : fetchDatasetInfo(id, headers, timeoutMs),
        fetchDatasetCard(id, headers, timeoutMs),
    ]);

    const cardData: any = (fullMeta as any)?.cardData ?? d?.cardData ?? {};
    const tags: string[] = [
        ...((fullMeta as any)?.tags ?? []),
        ...(d.tags ?? []),
    ].filter(Boolean);

    const taskCategories: string[] = cardData?.task_categories ?? cardData?.task_ids ?? [];
    const languages: string[] = cardData?.language ?? cardData?.languages ?? [];

    // Infer modality and task from rich metadata + card text
    const modalities = inferModalityFromMetadata(tags, cardData, cardText, id);
    const primaryModality = modalities[0] ?? 'unknown';
    const task = inferTaskFromMetadata(tags, taskCategories, cardText, id);

    // Schema / features / splits
    const { features, splits, sampleCount } = extractSchema(cardData, cardText);

    // Related models
    const relatedModels = extractRelatedModels(cardData, cardText, id);

    // License
    const license = extractHuggingFaceLicense({ ...d, ...fullMeta, cardData, tags });

    // Size
    const sizeBytes: number | null =
        cardData?.dataset_size != null ? Number(cardData.dataset_size) :
        (fullMeta as any)?.dataset_size != null ? Number((fullMeta as any).dataset_size) :
        null;
    const size = sizeBytes != null
        ? sizeBytes > 1e9 ? `${(sizeBytes / 1e9).toFixed(1)} GB`
        : sizeBytes > 1e6 ? `${(sizeBytes / 1e6).toFixed(0)} MB`
        : sizeBytes > 1e3 ? `${(sizeBytes / 1e3).toFixed(0)} KB`
        : `${sizeBytes} B`
        : 'unknown';

    // Pretty description: prefer card text intro over short API field
    const apiDesc = String(d.description ?? cardData?.description ?? '');
    const cardIntro = cardText
        ? cardText
            .replace(/^---[\s\S]*?---/, '') // strip frontmatter
            .replace(/#+\s*.*/g, '')         // strip headers
            .trim()
            .slice(0, 500)
        : '';
    const description = cardIntro.length > apiDesc.length ? cardIntro : apiDesc || id;

    // Evidence array
    const evidence = [
        { value: id, state: 'CONFIRMED' as const, confidence: 1.0, source: 'HuggingFace metadata', verified: true },
        { value: task, state: task !== 'unknown' ? 'CONFIRMED' as const : 'UNKNOWN' as const, confidence: task !== 'unknown' ? 0.85 : 0, source: task !== 'unknown' ? (taskCategories.length > 0 ? 'HF task_categories' : 'inferred from metadata') : 'not available', verified: task !== 'unknown' },
        { value: primaryModality, state: primaryModality !== 'unknown' ? 'CONFIRMED' as const : 'UNKNOWN' as const, confidence: primaryModality !== 'unknown' ? 0.8 : 0, source: 'HF tags + dataset card', verified: primaryModality !== 'unknown' },
        ...(cardText ? [{ value: 'dataset card available', state: 'CONFIRMED' as const, confidence: 1.0, source: 'HuggingFace README', verified: true }] : []),
    ];

    return {
        id,
        name: id,
        title: (cardData?.pretty_name ?? id).slice(0, 200),
        subtitle: cardData?.pretty_name ?? '',
        source: 'Hugging Face',
        url: `https://huggingface.co/datasets/${id}`,
        description: description.slice(0, 2000),
        domain: qu.domain.value ?? '',
        subdomain: qu.subdomain.value ?? '',
        task,
        modality: primaryModality,
        modalities,
        formats: cardData?.format ? [cardData.format] : [],
        languages: Array.isArray(languages) ? languages.slice(0, 10) : [],
        license,
        size,
        sizeBytes,
        downloads: (fullMeta as any)?.downloads ?? d.downloads ?? null,
        likes: (fullMeta as any)?.likes ?? d.likes ?? null,
        creator: (fullMeta as any)?.author ?? d.author ?? 'unknown',
        tags,
        schema: cardData ?? {},
        splits,
        features,
        sample_count: sampleCount,
        image_resolution: null,
        video: modalities.includes('video'),
        related_models: relatedModels,
        raw_metadata: fullMeta as Record<string, unknown>,
        evidence,
        targetLabels: [],
        metadataQuality: computeMetadataQuality(id, description, license, tags, cardText, features),
        matchScore: 0,
        scoreBreakdown: { task: 0, modality: 0, domain: 0, subdomain: 0, target: 0, metadata: 0, semantic: 0, quality: 0, popularity: 0 },
        rejected: false,
        rejectionReason: null,
        matchReason: '',
    };
}

function computeMetadataQuality(
    id: string,
    description: string,
    license: string,
    tags: string[],
    cardText: string,
    features: string[]
): number {
    let score = 0;
    if (description.length > 100) score += 20;
    if (description.length > 500) score += 10;
    if (license && license !== 'unknown') score += 20;
    if (tags.length > 3) score += 10;
    if (cardText.length > 200) score += 20;
    if (cardText.length > 1000) score += 10;
    if (features.length > 0) score += 10;
    return Math.min(100, score);
}

// ── Legacy adapter for backward-compat with datasetPipeline ──────────────────

export { searchHuggingFaceDatasets as default };
