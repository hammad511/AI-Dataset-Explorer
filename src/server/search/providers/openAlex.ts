/**
 * OpenAlex Provider Adapter
 *
 * Fetches and normalizes scholarly literature from OpenAlex API.
 */

import { UnifiedCandidate, StructuredQueryUnderstanding } from '../types';
import { buildOpenAlexAuthQueryParams, getOpenAlexEmail } from '@/server/papers/openAlex';

const OPENALEX_API = 'https://api.openalex.org/works';

export async function fetchOpenAlexPapers(
    queries: string[],
    understanding: StructuredQueryUnderstanding,
    poolLimit = 50
): Promise<UnifiedCandidate[]> {
    const candidates: UnifiedCandidate[] = [];
    const seenIds = new Set<string>();
    const authParams = buildOpenAlexAuthQueryParams();
    const mailto = getOpenAlexEmail();

    for (const q of queries.slice(0, 3)) {
        try {
            const url = `${OPENALEX_API}?search=${encodeURIComponent(q)}&per-page=20&${authParams}`;
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 6000);

            const res = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': `AIDatasetExplorer/2.0 (mailto:${mailto})`,
                },
                signal: ctrl.signal,
                cache: 'no-store',
            });
            clearTimeout(tid);

            if (!res.ok) continue;

            const data = await res.json();
            if (!Array.isArray(data.results)) continue;

            for (const item of data.results) {
                const id = item.id || item.doi || '';
                if (!id || seenIds.has(id)) continue;
                seenIds.add(id);

                const authors = Array.isArray(item.authorships)
                    ? item.authorships.map((a: any) => a.author?.display_name).filter(Boolean)
                    : [];

                // Reconstruct abstract from inverted index if present
                let abstract = '';
                if (item.abstract_inverted_index) {
                    const words: [number, string][] = [];
                    for (const [word, positions] of Object.entries(item.abstract_inverted_index as Record<string, number[]>)) {
                        for (const pos of positions) words.push([pos, word]);
                    }
                    words.sort((a, b) => a[0] - b[0]);
                    abstract = words.map(w => w[1]).join(' ');
                }

                const doi = item.doi ? item.doi.replace(/^https?:\/\/doi\.org\//, '') : null;

                candidates.push({
                    id,
                    source: 'openalex',
                    type: 'paper',
                    title: item.title || item.display_name || 'Untitled Scholarly Work',
                    name: item.title,
                    description: abstract,
                    authors,
                    year: item.publication_year || null,
                    venue: item.primary_location?.source?.display_name || 'Scholarly Publication',
                    doi,
                    url: item.doi || item.id,
                    pdfUrl: item.open_access?.oa_url || null,
                    citationCount: item.cited_by_count || null,
                    retrievalQuery: q,
                    retrievalTier: queries.indexOf(q) + 1,
                    metadata: {
                        concepts: item.concepts,
                        is_oa: item.open_access?.is_oa,
                    },
                    matchScore: 50,
                    
                    tier: 'Tier C',
                    evidenceLevel: 'UNVERIFIED',
                    evidenceSources: ['OpenAlex'],
                    evidenceStrength: 35,
                    matchBreakdown: {
                        anatomy: 50, modality: 50, task: 50, dimension: 50, target: 50,
                        domain: 50, semantic: 50, evidence: 35, metadata: 60, accessibility: 90, popularity: 50, overall: 50,
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
