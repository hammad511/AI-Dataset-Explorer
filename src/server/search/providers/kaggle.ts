/**
 * Kaggle Provider Adapter
 *
 * Fetches and normalizes dataset candidates from the Kaggle API into standard UnifiedCandidate format.
 */

import { UnifiedCandidate, StructuredQueryUnderstanding } from '../types';
import {
    getKaggleAuthHeaders,
    isKaggleConfigured,
    fetchKaggleWithRetry,
    normalizeKaggleDatasetItem,
    KAGGLE_DATASETS_LIST_ENDPOINT,
} from '@/server/providers/kaggle';
import { extractExplicitModality } from '../modalityParser';

export async function fetchKaggleCandidates(
    queries: string[],
    understanding: StructuredQueryUnderstanding,
    poolLimit = 80
): Promise<UnifiedCandidate[]> {
    if (!isKaggleConfigured()) {
        return [];
    }

    const headers = getKaggleAuthHeaders();
    if (!headers['Authorization']) {
        return [];
    }

    const candidates: UnifiedCandidate[] = [];
    const seenIds = new Set<string>();

    const effectiveQueries = Array.from(
        new Set(queries.map((q) => (q || '').trim()).filter((q) => q.length >= 2))
    );

    for (const q of effectiveQueries.slice(0, 5)) {
        try {
            const url = `${KAGGLE_DATASETS_LIST_ENDPOINT}?search=${encodeURIComponent(q)}&pageSize=30`;
            const res = await fetchKaggleWithRetry(url, headers, { timeoutMs: 6000, maxRetries: 2 });

            if (!res || !res.ok) continue;

            const items = await res.json();
            if (!Array.isArray(items)) continue;

            for (const rawItem of items) {
                const norm = normalizeKaggleDatasetItem(rawItem);
                if (!norm || seenIds.has(norm.id)) continue;
                seenIds.add(norm.id);

                const { id, title, description: desc, tags, url: itemUrl, licenseName, totalBytes, downloadCount, voteCount, usabilityRating, ownerRef, lastUpdated, isFeatured } = norm;

                // Infer format signals from title and tags
                const formats: string[] = [];
                const blob = `${title} ${desc} ${tags.join(' ')}`.toLowerCase();
                if (/mrc|\.mrc/i.test(blob)) formats.push('mrc');
                if (/\bem\b|\.em\b/i.test(blob)) formats.push('em');
                if (/nii|\.nii\.gz/i.test(blob)) formats.push('nii.gz');
                if (/mha/i.test(blob)) formats.push('mha');
                if (/dicom|\.dcm/i.test(blob)) formats.push('dicom');
                if (/csv/i.test(blob)) formats.push('csv');
                if (/png/i.test(blob)) formats.push('png');
                const explicitModality = extractExplicitModality(title, desc, tags, formats);

                const candidate: UnifiedCandidate = {
                    id,
                    source: 'kaggle',
                    type: 'dataset',
                    title,
                    name: title,
                    description: desc,
                    tags,
                    modality: explicitModality,
                    url: itemUrl,
                    license: licenseName || 'Other / See Page',
                    formats,
                    sizeBytes: totalBytes,
                    downloads: downloadCount,
                    likes: voteCount,
                    metadata: {
                        owner: ownerRef,
                        lastUpdated,
                        isFeatured,
                        usabilityRating,
                    },
                    matchScore: 50,
                    
                    tier: 'Tier C',
                    evidenceLevel: 'UNVERIFIED',
                    evidenceSources: ['Kaggle API'],
                    evidenceStrength: 30,
                    matchBreakdown: {
                        anatomy: 50, modality: 50, task: 50, dimension: 50, target: 50,
                        domain: 50, semantic: 50, evidence: 30, metadata: 50, accessibility: 80, popularity: 50, overall: 50,
                        confirmedClaims: [], warnings: [],
                    },
                    evidence: [],
                    warnings: [],
                    rejected: false,
                    rejectionReason: null,
                    matchReason: '',
                };

                candidates.push(candidate);
                if (candidates.length >= poolLimit) break;
            }
        } catch {
            // Graceful continue on provider timeout
        }
    }

    return candidates;
}
