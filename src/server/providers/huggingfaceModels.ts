/**
 * HuggingFace Model Search — Architecture Extraction & Noise-Filtered Retrieval
 *
 * Fetches real model results from Hugging Face Hub API and enriches top candidates with:
 * - Full model card (README)
 * - config.json for architecture details
 * - Parameter count, framework, base model
 *
 * Excludes irrelevant anime/manga/waifu/LoRA models for technical & domain queries.
 */

import type { NormalizedModel } from '@/types/pipeline';
import type { QueryUnderstanding } from '@/server/query-understanding/queryParser';
import type { ExpandedQueries } from '@/server/query-understanding/queryExpander';
import {
    modelCardCache, modelConfigCache,
    modelCardKey, modelConfigKey, searchResultCache, searchKey
} from '../cache/metadataCache';
import {
    getHuggingFaceHeaders,
    fetchHuggingFaceWithRetry,
    HF_EXPAND_QUERY_PARAMS,
    extractModelParameterSize,
    extractHuggingFaceLicense,
} from '@/server/providers/huggingface';

const HF_API = 'https://huggingface.co/api';
const HF_MODELS_ENDPOINT = `${HF_API}/models`;

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

// ── Model card fetching ───────────────────────────────────────────────────────

async function fetchModelCard(modelId: string, headers: Record<string, string>, timeoutMs: number): Promise<string> {
    const cacheKey = modelCardKey(modelId);
    const cached = modelCardCache.get(cacheKey);
    if (cached !== null) return cached;

    const url = `${HF_API}/models/${encodeURIComponent(modelId)}/readme`;
    const res = await hfFetch(url, headers, timeoutMs);
    if (!res || !res.ok) { modelCardCache.set(cacheKey, ''); return ''; }

    try {
        const data = await res.json();
        let content = '';
        if (typeof data === 'string') content = data;
        else if (data?.content) {
            try { content = Buffer.from(data.content, 'base64').toString('utf-8'); }
            catch { content = String(data.content); }
        } else if (data?.text) content = String(data.text);
        // Security: cap at 8000 chars
        content = content.slice(0, 8000);
        modelCardCache.set(cacheKey, content);
        return content;
    } catch { modelCardCache.set(cacheKey, ''); return ''; }
}

// ── Model config.json fetching ────────────────────────────────────────────────

async function fetchModelConfig(modelId: string, headers: Record<string, string>, timeoutMs: number): Promise<Record<string, unknown>> {
    const cacheKey = modelConfigKey(modelId);
    const cached = modelConfigCache.get(cacheKey);
    if (cached !== null) return cached;

    const url = `https://huggingface.co/${encodeURIComponent(modelId)}/resolve/main/config.json`;
    const res = await hfFetch(url, { ...headers, Accept: 'application/json' }, timeoutMs);
    if (!res || !res.ok) { modelConfigCache.set(cacheKey, {}); return {}; }

    try {
        const data = await res.json();
        modelConfigCache.set(cacheKey, data ?? {});
        return data ?? {};
    } catch { modelConfigCache.set(cacheKey, {}); return {}; }
}

// ── Architecture extraction ───────────────────────────────────────────────────

interface ArchitectureInfo {
    name: string;
    confidence: number;
    source: string;
    state: 'CONFIRMED' | 'INFERRED' | 'UNKNOWN';
    baseModel: string;
    parameters: number | null;
    framework: string;
    inputTypes: string[];
    outputTypes: string[];
}

function extractArchitecture(
    modelId: string,
    tags: string[],
    config: Record<string, unknown>,
    cardText: string,
    pipelineTag: string
): ArchitectureInfo {
    let name = 'Unknown';
    let confidence = 0;
    let source = 'not available';
    let state: 'CONFIRMED' | 'INFERRED' | 'UNKNOWN' = 'UNKNOWN';
    let baseModel = 'Unknown';
    let parameters: number | null = null;
    let framework = 'Unknown';
    const inputTypes: string[] = [];
    const outputTypes: string[] = [];

    // 1. config.json architectures field (highest confidence)
    if (config && typeof config === 'object') {
        const archs = (config as any).architectures;
        if (Array.isArray(archs) && archs.length > 0) {
            name = archs[0];
            confidence = 0.95;
            source = 'config.json';
            state = 'CONFIRMED';
        }
        if (!archs?.length && (config as any).model_type) {
            name = String((config as any).model_type);
            confidence = 0.9;
            source = 'config.json model_type';
            state = 'CONFIRMED';
        }
        if ((config as any).num_parameters) {
            parameters = Number((config as any).num_parameters);
        } else if ((config as any).n_params) {
            parameters = Number((config as any).n_params);
        }
        if ((config as any).base_model) {
            baseModel = String((config as any).base_model);
        } else if ((config as any)._name_or_path) {
            baseModel = String((config as any)._name_or_path);
        }
        if ((config as any).framework) {
            framework = String((config as any).framework);
        }
        if ((config as any).input_type) inputTypes.push(String((config as any).input_type));
        if ((config as any).output_type) outputTypes.push(String((config as any).output_type));
    }

    // 2. Tags — architecture: prefix
    if (state === 'UNKNOWN') {
        const archTag = tags.find(t => t.startsWith('architecture:'));
        if (archTag) {
            name = archTag.replace('architecture:', '').trim();
            confidence = 0.85;
            source = 'HF model tag';
            state = 'CONFIRMED';
        }
    }

    // 3. Model card text — "Architecture: X" pattern
    if (state === 'UNKNOWN' && cardText) {
        const m = cardText.match(/(?:architecture|model\s*type|backbone|base\s*model)\s*[:=]\s*([A-Za-z0-9_\-./]+)/i);
        if (m) {
            name = m[1].trim();
            confidence = 0.75;
            source = 'model card text';
            state = 'CONFIRMED';
        }
    }

    // 4. Known architecture patterns in model ID
    if (state === 'UNKNOWN') {
        const knownArchs = [
            [/SmolVLA/i, 'SmolVLA'],
            [/Pi0(?:\.5)?/i, 'Pi0 / Pi0.5'],
            [/lerobot/i, 'LeRobot policy'],
            [/llama[\s\-_]?3/i, 'LLaMA 3'],
            [/llama[\s\-_]?2/i, 'LLaMA 2'],
            [/llama/i, 'LLaMA'],
            [/mistral/i, 'Mistral'],
            [/gemma/i, 'Gemma'],
            [/bert/i, 'BERT'],
            [/roberta/i, 'RoBERTa'],
            [/gpt[\s\-_]?(?:2|j|neo|neox)?/i, 'GPT'],
            [/yolov?\d+/i, 'YOLO'],
            [/resnet[\d]+/i, 'ResNet'],
            [/efficientnet/i, 'EfficientNet'],
            [/vit[\s\-_]/i, 'Vision Transformer'],
            [/segformer/i, 'SegFormer'],
            [/unet/i, 'U-Net'],
            [/detr/i, 'DETR'],
            [/sam\b/i, 'SAM (Segment Anything)'],
            [/whisper/i, 'Whisper'],
            [/wav2vec/i, 'wav2vec 2.0'],
            [/hubert/i, 'HuBERT'],
            [/diffusion/i, 'Diffusion model'],
            [/t5/i, 'T5'],
            [/xlm/i, 'XLM'],
        ] as [RegExp, string][];

        const searchText = `${modelId} ${cardText.slice(0, 500)}`.toLowerCase();
        for (const [pattern, label] of knownArchs) {
            if (pattern.test(searchText)) {
                name = label;
                confidence = 0.6;
                source = 'inferred from model name/card';
                state = 'INFERRED';
                break;
            }
        }
    }

    // 5. Pipeline tag based inference
    if (state === 'UNKNOWN' && pipelineTag) {
        const pipelineToArch: Record<string, string> = {
            'text-generation': 'Language model (architecture unknown)',
            'image-segmentation': 'Segmentation model (architecture unknown)',
            'object-detection': 'Detection model (architecture unknown)',
            'image-classification': 'Image classification model (architecture unknown)',
            'text-classification': 'Text classification model (architecture unknown)',
            'automatic-speech-recognition': 'ASR model (architecture unknown)',
        };
        if (pipelineToArch[pipelineTag]) {
            name = pipelineToArch[pipelineTag];
            confidence = 0.3;
            source = 'inferred from HF pipeline tag';
            state = 'INFERRED';
        }
    }

    // Base model from tags
    if (baseModel === 'Unknown') {
        const baseTag = tags.find(t => t.startsWith('base_model:'));
        if (baseTag) baseModel = baseTag.replace('base_model:', '').trim();
    }

    // Framework from tags
    if (framework === 'Unknown') {
        if (tags.includes('pytorch')) framework = 'PyTorch';
        else if (tags.includes('tf') || tags.includes('tensorflow')) framework = 'TensorFlow';
        else if (tags.includes('jax') || tags.includes('flax')) framework = 'JAX/Flax';
        else if (tags.includes('onnx')) framework = 'ONNX';
    }

    // Input/output types from pipeline tag
    if (inputTypes.length === 0) {
        if (/image|vision/i.test(pipelineTag)) inputTypes.push('image');
        else if (/text/i.test(pipelineTag)) inputTypes.push('text');
        else if (/audio|speech/i.test(pipelineTag)) inputTypes.push('audio');
        else if (/video/i.test(pipelineTag)) inputTypes.push('video');
    }
    if (outputTypes.length === 0) {
        if (/classification/i.test(pipelineTag)) outputTypes.push('class label');
        else if (/generation/i.test(pipelineTag)) outputTypes.push('text');
        else if (/segmentation/i.test(pipelineTag)) outputTypes.push('segmentation mask');
        else if (/detection/i.test(pipelineTag)) outputTypes.push('bounding boxes');
    }

    return { name, confidence, source, state, baseModel, parameters, framework, inputTypes, outputTypes };
}

// ── Training datasets extraction ──────────────────────────────────────────────

function extractTrainingDatasets(tags: string[], cardText: string): string[] {
    const datasets: string[] = [];
    for (const t of tags) {
        if (t.startsWith('dataset:')) datasets.push(t.replace('dataset:', '').trim());
    }
    const trainedOnMatches = cardText.match(/(?:trained|fine-tuned?)\s+on\s+([A-Za-z0-9/_\-]+)/gi);
    if (trainedOnMatches) {
        datasets.push(...trainedOnMatches.map(m =>
            m.replace(/(?:trained|fine-tuned?)\s+on\s+/i, '').trim()
        ).slice(0, 5));
    }
    return [...new Set(datasets)].slice(0, 8);
}

// ── Modality from model metadata ──────────────────────────────────────────────

function inferModelModalities(pipelineTag: string, tags: string[], cardText: string, archName: string): string[] {
    const modalities: string[] = [];
    const blob = `${pipelineTag} ${tags.join(' ')} ${cardText.slice(0, 500)} ${archName}`.toLowerCase();

    if (/image|vision|visual|pixel|photo|ct|mri|x-ray|radiograph/i.test(blob)) modalities.push('image');
    if (/video/i.test(blob)) modalities.push('video');
    if (/audio|speech|wav|sound/i.test(blob)) modalities.push('audio');
    if (/text|language|nlp|document|token/i.test(blob)) modalities.push('text');
    if (/robo|manipulat|teleop|so-101/i.test(blob)) modalities.push('robotics');
    if (/3d|point.?cloud|lidar/i.test(blob)) modalities.push('3D');
    if (/eeg|ecg|time.?series|signal|sensor/i.test(blob)) modalities.push('time-series');

    return modalities.length > 0 ? [...new Set(modalities)] : ['unknown'];
}

// ── Pipeline tag inference for model search ───────────────────────────────────

function inferPipelineTag(qu: QueryUnderstanding): string | null {
    const task = (qu.task.value ?? '').toLowerCase();
    const mod = (qu.modality.value ?? '').toLowerCase();
    const domain = (qu.domain.value ?? '').toLowerCase();

    if (/speech\s*emot|emotion\s*recogn|ser|audio\s*classif|sound\s*classif/.test(task)) return 'audio-classification';
    if (/\baudio\b|\bspeech\b|\bvoice\b|\bsound\b/.test(mod)) {
        if (/asr|transcri|speech.?recogn/.test(task)) return 'automatic-speech-recognition';
        return 'audio-classification';
    }
    if (/object\s*detect|bounding\s*box|yolo|bbox|instance\s*detect/.test(task) || (/detect(?:ion)?/.test(task) && /image|video|visual|vision|photo|cctv/.test(mod))) return 'object-detection';
    if (/segment(?:ation)?/.test(task) && /image|medical|ct|mri|x.ray|vision|visual/.test(mod + ' ' + domain)) return 'image-segmentation';
    if (/classif(?:y|ication)?/.test(task) && /image|ct|mri|x.ray|vision|visual|photo/.test(mod + ' ' + domain)) return 'image-classification';
    if (/classif|sentiment|nlp|intent|topic/.test(task) && /text|document|nlp/.test(mod)) return 'text-classification';
    if (/generat|llm|chat|dialog|summariz/.test(task) && /text|nlp/.test(mod)) return 'text-generation';
    if (/asr|speech.?recogni/.test(task)) return 'automatic-speech-recognition';
    return null;
}

const NOISE_PATTERN = /\b(speech-bubble|manga|anime|comic|cartoon|waifu|pony|civitai|lora|safetensors-lora|vtuber|danbooru|hentai|nsfw|novelai|artstation|furry|genshin|gacha)\b/i;

function isIrrelevantModel(m: any, qu: QueryUnderstanding): boolean {
    const userPrompt = [qu.explicitKeywords.join(' '), qu.target.value, qu.task.value].filter(Boolean).join(' ').toLowerCase();
    const userWantsAnime = NOISE_PATTERN.test(userPrompt);

    if (userWantsAnime) return false;

    const modelId = String(m.id || m.modelId || '').toLowerCase();
    const tags = Array.isArray(m.tags) ? m.tags.map((t: any) => String(t || '').toLowerCase()) : [];
    const modelBlob = `${modelId} ${tags.join(' ')}`.toLowerCase();

    if (NOISE_PATTERN.test(modelBlob)) {
        return true;
    }

    return false;
}

// ── Main search function ──────────────────────────────────────────────────────

export async function searchHuggingFaceModels(
    qu: QueryUnderstanding,
    expanded: ExpandedQueries,
    trace?: Record<string, unknown>
): Promise<Partial<NormalizedModel>[]> {
    const TIMEOUT = parseInt(process.env.EXTERNAL_API_TIMEOUT_MS || '15000', 10);
    const headers = getHuggingFaceHeaders();

    if (trace) { trace.called = true; trace.success = false; }

    const queries = expanded.hfModelQueries;
    const pipelineTag = inferPipelineTag(qu);

    console.log(`[Hugging Face API] Starting model search with queries:`, queries, pipelineTag ? `(pipeline_tag: ${pipelineTag})` : '');

    const t0 = performance.now();
    const rawResults: any[] = [];
    let httpStatus: number | null = null;
    const diagnostics: FetchDiagnostics = { networkFailures: 0 };

    // ── 1. Fetch model search results ─────────────────────────────────────
    for (const q of queries) {
        const cacheKey = searchKey('hf-models', q);
        const cached = searchResultCache.get(cacheKey);
        if (cached !== null) {
            rawResults.push(...(cached as any[]));
            continue;
        }

        // Search clean keyword query with expanded metadata fields
        let url = `${HF_MODELS_ENDPOINT}?search=${encodeURIComponent(q)}&sort=downloads&direction=-1&limit=15&${HF_EXPAND_QUERY_PARAMS}`;
        if (pipelineTag) {
            url += `&pipeline_tag=${encodeURIComponent(pipelineTag)}`;
        }

        console.log(`[Hugging Face API] Querying models: "${q}"`);
        const res = await hfFetch(url, headers, TIMEOUT, diagnostics);
        if (!res) continue;

        httpStatus = res.status;
        console.log(`[Hugging Face API] Models Status: ${res.status}`);

        if (!res.ok) {
            const errBody = await res.text();
            console.error(`[Hugging Face API] Model Error (${res.status}):`, errBody.slice(0, 300));
            continue;
        }

        try {
            const data = await res.json();
            const items: any[] = Array.isArray(data) ? data : [];
            searchResultCache.set(cacheKey, items);
            rawResults.push(...items);
            console.log(`[Hugging Face API] Found ${items.length} models for query "${q}"`);
        } catch (e: any) {
            console.error(`[Hugging Face API] Model parse error for query "${q}":`, e?.message || e);
        }
    }

    // Optional pipeline-tag fallback query if results are sparse
    if (pipelineTag && rawResults.length < 5 && queries.length > 0) {
        const primaryQ = queries[0];
        const cacheKeyTag = searchKey('hf-models', primaryQ + ':' + pipelineTag);
        const cachedTag = searchResultCache.get(cacheKeyTag);
        if (cachedTag !== null) {
            rawResults.push(...(cachedTag as any[]));
        } else {
            const urlTag = `${HF_MODELS_ENDPOINT}?search=${encodeURIComponent(primaryQ)}&pipeline_tag=${encodeURIComponent(pipelineTag)}&sort=downloads&direction=-1&limit=10&${HF_EXPAND_QUERY_PARAMS}`;
            console.log(`[Hugging Face API] Querying fallback pipeline models: "${primaryQ}" (pipeline: ${pipelineTag})`);
            const resTag = await hfFetch(urlTag, headers, TIMEOUT, diagnostics);
            if (resTag && resTag.ok) {
                try {
                    const dataTag = await resTag.json();
                    if (Array.isArray(dataTag)) {
                        searchResultCache.set(cacheKeyTag, dataTag);
                        rawResults.push(...dataTag);
                        console.log(`[Hugging Face API] Found ${dataTag.length} models from pipeline fallback`);
                    }
                } catch (e: any) {
                    console.error('[Hugging Face API] Fallback parse error:', e?.message || e);
                }
            }
        }
    }

    // ── 2. Deduplicate by modelId ─────────────────────────────────────────
    const uniqueMap = new Map<string, any>();
    for (const m of rawResults) {
        if (m?.modelId && !uniqueMap.has(m.modelId)) uniqueMap.set(m.modelId, m);
        else if (m?.id && !uniqueMap.has(m.id)) uniqueMap.set(m.id, { ...m, modelId: m.id });
    }
    const uniqueRaw = Array.from(uniqueMap.values());

    // ── 3. Filter out noise (manga/anime/waifu/unrelated LoRA models) ─────
    const cleanModels = uniqueRaw.filter(m => !isIrrelevantModel(m, qu));

    console.log(`[Hugging Face API] Models after deduplication & noise filter: ${cleanModels.length} (out of ${uniqueRaw.length} raw)`);

    // ── 4. Enrich top 15 candidates ───────────────────────────────────────
    const toEnrich = cleanModels
        .sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
        .slice(0, 15);

    const enriched: Partial<NormalizedModel>[] = await Promise.all(
        toEnrich.map(m => enrichModel(m, headers, TIMEOUT, qu))
    );

    const dur = Math.round(performance.now() - t0);
    if (trace) {
        trace.success = enriched.length > 0;
        trace.modelsFound = enriched.length;
        trace.durationMs = dur;
        if (httpStatus !== null && httpStatus !== 200) trace.httpStatus = httpStatus;
        if (diagnostics.networkFailures > 0) trace.networkFailures = diagnostics.networkFailures;
        if (httpStatus === null && diagnostics.networkFailures > 0) trace.reason = 'Network connection to Hugging Face failed';
    }
    console.log(`[Hugging Face API] Model search complete: ${enriched.length} models retrieved in ${dur}ms`);

    return enriched;
}

async function enrichModel(
    m: any,
    headers: Record<string, string>,
    timeoutMs: number,
    qu: QueryUnderstanding
): Promise<Partial<NormalizedModel>> {
    const modelId: string = m.modelId ?? m.id ?? '';
    const pipelineTag: string = m.pipeline_tag ?? '';
    const tags: string[] = Array.isArray(m.tags) ? m.tags : [];

    // Fetch model card and config concurrently
    const [cardText, config] = await Promise.all([
        fetchModelCard(modelId, headers, timeoutMs),
        fetchModelConfig(modelId, headers, timeoutMs),
    ]);

    // Extract architecture with evidence
    const arch = extractArchitecture(modelId, tags, config, cardText, pipelineTag);
    const { parameters: expandedParams } = extractModelParameterSize(m);
    const resolvedParameters = arch.parameters ?? expandedParams;

    // Training datasets
    const trainingDatasets = extractTrainingDatasets(tags, cardText);

    // Modalities
    const modalities = inferModelModalities(pipelineTag, tags, cardText, arch.name);

    // License
    const license = extractHuggingFaceLicense({ ...m, tags, license: (config as any)?.license });

    // Languages
    const languages: string[] = tags
        .filter(t => t.startsWith('language:'))
        .map(t => t.replace('language:', '').trim())
        .slice(0, 10);

    // Evidence
    const evidence = [
        { value: modelId, state: 'CONFIRMED' as const, confidence: 1.0, source: 'HuggingFace metadata', verified: true },
        { value: arch.name, state: arch.state, confidence: arch.confidence, source: arch.source, verified: arch.state === 'CONFIRMED' },
        { value: pipelineTag || 'unknown', state: pipelineTag ? 'CONFIRMED' as const : 'UNKNOWN' as const, confidence: pipelineTag ? 0.9 : 0, source: 'HF pipeline_tag', verified: !!pipelineTag },
        ...(resolvedParameters != null ? [{ value: String(resolvedParameters), state: 'CONFIRMED' as const, confidence: 0.9, source: arch.parameters != null ? 'config.json' : 'HF expanded metadata', verified: true }] : []),
    ];

    return {
        id: modelId,
        name: modelId,
        source: 'Hugging Face',
        url: `https://huggingface.co/${modelId}`,
        task: pipelineTag ? pipelineTag.replace(/-/g, ' ') : 'unknown',
        architecture: arch.name,
        base_model: arch.baseModel,
        parameters: resolvedParameters,
        modality: modalities[0] ?? 'unknown',
        modalities,
        languages,
        framework: arch.framework,
        license,
        training_data: trainingDatasets,
        datasets_used: trainingDatasets,
        quantization: tags.includes('quantized') ? 'quantized' : null,
        context_length: (config as any)?.max_position_embeddings ?? (config as any)?.max_sequence_length ?? null,
        input_types: arch.inputTypes,
        output_types: arch.outputTypes,
        metrics: {},
        evidence,
        benchmarkEvidence: [],
        downloads: m.downloads ?? null,
        likes: m.likes ?? null,
        matchScore: 0,
        scoreBreakdown: { task: 0, modality: 0, architecture: 0, compatibility: 0, benchmark: 0, efficiency: 0, popularity: 0 },
        rejected: false,
        rejectionReason: null,
        matchReason: '',
    };
}
