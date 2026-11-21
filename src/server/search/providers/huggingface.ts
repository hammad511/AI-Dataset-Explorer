/**
 * Hugging Face Provider Adapter
 *
 * Fetches and normalizes Datasets and Pretrained Models from Hugging Face Hub APIs.
 */

import { UnifiedCandidate, StructuredQueryUnderstanding } from '../types';
import { extractExplicitModality } from '../modalityParser';
import { classifyTask, canonicalTaskToHFPipelineTag } from '../taskAlignmentMatrix';
import {
    getHuggingFaceHeaders,
    fetchHuggingFaceWithRetry,
    HF_EXPAND_QUERY_PARAMS,
    extractModelParameterSize,
    extractHuggingFaceLicense,
} from '@/server/providers/huggingface';
import { getFallbackBaselineModels } from '../modelsFallback';

const HF_DATASETS_API = 'https://huggingface.co/api/datasets';
const HF_MODELS_API = 'https://huggingface.co/api/models';

export async function fetchHuggingFaceDatasets(
    queries: string[],
    understanding: StructuredQueryUnderstanding,
    poolLimit = 80
): Promise<UnifiedCandidate[]> {
    const candidates: UnifiedCandidate[] = [];
    const seenIds = new Set<string>();
    const headers = getHuggingFaceHeaders();

    for (const q of queries.slice(0, 4)) {
        try {
            const url = `${HF_DATASETS_API}?search=${encodeURIComponent(q)}&limit=30&${HF_EXPAND_QUERY_PARAMS}`;
            const res = await fetchHuggingFaceWithRetry(url, headers, { timeoutMs: 6000, maxRetries: 2 });

            if (!res || !res.ok) continue;

            const items = await res.json();
            if (!Array.isArray(items)) continue;

            for (const item of items) {
                const id = item.id || item._id || '';
                if (!id || seenIds.has(id)) continue;
                seenIds.add(id);

                const title = id.split('/').pop() || id;
                const desc = item.description || item.cardData?.description || item.cardData?.summary || '';
                const tags = Array.isArray(item.tags) ? item.tags : [];
                const siblings = Array.isArray(item.siblings) ? item.siblings : [];

                const formats: string[] = [];
                const siblingNames = siblings.map((s: any) => String(s?.rfilename || '')).join(' ');
                const blob = `${id} ${title} ${desc} ${tags.join(' ')} ${siblingNames}`.toLowerCase();
                if (/nii|\.nii\.gz|nifti/i.test(blob)) formats.push('nii.gz');
                if (/mha/i.test(blob)) formats.push('mha');
                if (/dicom/i.test(blob)) formats.push('dicom');
                if (/parquet|\.parquet/i.test(blob)) formats.push('parquet');
                if (/arrow|\.arrow/i.test(blob)) formats.push('arrow');
                const explicitModality = extractExplicitModality(
                    item.cardData?.pretty_name || title,
                    desc,
                    tags,
                    formats
                );
                const license = extractHuggingFaceLicense(item);

                candidates.push({
                    id,
                    source: 'huggingface',
                    type: 'dataset',
                    title: item.cardData?.pretty_name || title,
                    name: id,
                    description: desc,
                    tags,
                    modality: explicitModality,
                    url: `https://huggingface.co/datasets/${id}`,
                    license,
                    formats,
                    downloads: item.downloads || null,
                    likes: item.likes || null,
                    metadata: {
                        author: item.author,
                        private: item.private,
                        gated: item.gated,
                        cardData: item.cardData,
                        siblingsCount: siblings.length,
                    },
                    matchScore: 50,
                    
                    tier: 'Tier C',
                    evidenceLevel: 'UNVERIFIED',
                    evidenceSources: ['Hugging Face API'],
                    evidenceStrength: 30,
                    matchBreakdown: {
                        anatomy: 50, modality: 50, task: 50, dimension: 50, target: 50,
                        domain: 50, semantic: 50, evidence: 30, metadata: 50, accessibility: 90, popularity: 50, overall: 50,
                        confirmedClaims: [], warnings: [],
                    },
                    evidence: [],
                    warnings: [],
                    rejected: false,
                    rejectionReason: null,
                    matchReason: '',
                });

                if (candidates.length >= poolLimit) break;
            }
        } catch {
            // Continue on timeout
        }
    }

    return candidates;
}

export async function fetchHuggingFaceModels(
    queries: string[],
    understanding: StructuredQueryUnderstanding,
    poolLimit = 80
): Promise<UnifiedCandidate[]> {
    const candidates: UnifiedCandidate[] = [];
    const seenIds = new Set<string>();
    const headers = getHuggingFaceHeaders();

    // Determine HF pipeline_tag from the query's extracted task for precision filtering.
    const queryTaskText = `${understanding.rawQuery} ${(understanding.tasks && understanding.tasks[0]) || ''}`;
    const canonicalTask = classifyTask(queryTaskText);
    const hfPipelineTag = canonicalTask !== 'DISCOVERY' ? canonicalTaskToHFPipelineTag(canonicalTask) : null;
    let hitRateLimitOrOutage = false;

    const urlsToFetch: string[] = [];
    for (const [idx, q] of queries.slice(0, 4).entries()) {
        urlsToFetch.push(`${HF_MODELS_API}?search=${encodeURIComponent(q)}&limit=30&${HF_EXPAND_QUERY_PARAMS}`);
        if (hfPipelineTag && idx < 2) {
            urlsToFetch.push(`${HF_MODELS_API}?pipeline_tag=${encodeURIComponent(hfPipelineTag)}&search=${encodeURIComponent(q)}&limit=20&${HF_EXPAND_QUERY_PARAMS}`);
        }
    }

    for (const url of urlsToFetch) {
        try {
            const res = await fetchHuggingFaceWithRetry(url, headers, { timeoutMs: 6000, maxRetries: 2 });

            if (!res) {
                hitRateLimitOrOutage = true;
                continue;
            }
            if (res.status === 429 || res.status === 503) {
                hitRateLimitOrOutage = true;
                continue;
            }
            if (!res.ok) continue;

            const items = await res.json();
            if (!Array.isArray(items)) continue;

            for (const item of items) {
                const id = item.id || item._id || '';
                if (!id || seenIds.has(id)) continue;
                seenIds.add(id);

                const title = id.split('/').pop() || id;
                const desc = item.cardData?.description || item.cardData?.summary || '';
                const tags = Array.isArray(item.tags) ? item.tags : [];
                const pipelineTag = item.pipeline_tag || '';

                // Extract architecture if available
                let architecture = item.cardData?.model_type || item.config?.model_type || '';
                if (!architecture) {
                    if (/swin/i.test(id)) architecture = 'Swin UNETR Transformer';
                    else if (/unetr/i.test(id)) architecture = 'UNETR Transformer';
                    else if (/unet/i.test(id)) architecture = 'Residual U-Net';
                    else if (/vit/i.test(id)) architecture = 'Vision Transformer (ViT)';
                    else if (/segformer/i.test(id)) architecture = 'SegFormer';
                    else if (/yolo/i.test(id)) architecture = 'YOLO';
                    else architecture = 'Pretrained Transformer';
                }

                const explicitModality = extractExplicitModality(
                    item.cardData?.pretty_name || title,
                    desc,
                    tags,
                    []
                );
                const license = extractHuggingFaceLicense(item);
                const { parameters, safetensorsBytes } = extractModelParameterSize(item);

                candidates.push({
                    id,
                    source: 'huggingface',
                    type: 'model',
                    title: item.cardData?.pretty_name || title,
                    name: id,
                    description: desc,
                    tags,
                    modality: explicitModality,
                    url: `https://huggingface.co/${id}`,
                    pipelineTag,
                    architecture,
                    license,
                    downloads: item.downloads || null,
                    likes: item.likes || null,
                    metadata: {
                        pipeline_tag: pipelineTag,
                        library_name: item.library_name,
                        framework: item.library_name || 'PyTorch',
                        parameters,
                        safetensorsBytes,
                        siblingsCount: Array.isArray(item.siblings) ? item.siblings.length : 0,
                    },
                    matchScore: 50,
                    
                    tier: 'Tier C',
                    evidenceLevel: 'UNVERIFIED',
                    evidenceSources: ['Hugging Face Hub'],
                    evidenceStrength: 30,
                    matchBreakdown: {
                        anatomy: 50, modality: 50, task: 50, dimension: 50, target: 50,
                        domain: 50, semantic: 50, evidence: 30, metadata: 50, accessibility: 90, popularity: 50, overall: 50,
                        confirmedClaims: [], warnings: [],
                    },
                    evidence: [],
                    warnings: [],
                    rejected: false,
                    rejectionReason: null,
                    matchReason: '',
                });

                if (candidates.length >= poolLimit) break;
            }
        } catch {
            // Continue on timeout
        }
    }

    // Graceful fallback to modelsFallback.ts when rate-limited (429) or unavailable (503) and no models retrieved
    if (candidates.length === 0 && hitRateLimitOrOutage) {
        console.warn('[Hugging Face API] Rate limit/outage encountered with 0 models retrieved; falling back to getFallbackBaselineModels.');
        return getFallbackBaselineModels(understanding);
    }

    return candidates;
}
