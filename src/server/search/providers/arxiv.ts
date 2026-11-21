/**
 * arXiv Provider Adapter
 *
 * Fetches and normalizes preprints from the arXiv API.
 */

import { UnifiedCandidate, StructuredQueryUnderstanding } from '../types';
import {
    getArxivUserAgent,
    waitForArxivRateSlot,
    parseArxivAtomXml,
    normalizeArxivIdentifier,
} from '@/server/papers/arxiv';
import { providerRawCache, buildPaperSearchKey } from '@/server/papers/paperCache';

const ARXIV_API = 'https://export.arxiv.org/api/query';

export async function fetchArxivPapers(
    queries: string[],
    understanding: StructuredQueryUnderstanding,
    poolLimit = 40
): Promise<UnifiedCandidate[]> {
    const candidates: UnifiedCandidate[] = [];
    const seenIds = new Set<string>();

    for (const q of queries.slice(0, 2)) {
        try {
            const cleanQ = (q || '').trim();
            if (!cleanQ) continue;

            const cacheKey = buildPaperSearchKey('arxiv', `${cleanQ}:15`);
            let entries = providerRawCache.get(cacheKey);

            if (!entries) {
                await waitForArxivRateSlot();
                const searchQuery = `all:${encodeURIComponent(cleanQ)}`;
                const url = `${ARXIV_API}?search_query=${searchQuery}&start=0&max_results=15&sortBy=relevance&sortOrder=descending`;
                const ctrl = new AbortController();
                const tid = setTimeout(() => ctrl.abort(), 7500);

                const res = await fetch(url, {
                    headers: {
                        'Accept': 'application/atom+xml, application/xml, text/xml',
                        'User-Agent': getArxivUserAgent(),
                    },
                    signal: ctrl.signal,
                    cache: 'no-store',
                });
                clearTimeout(tid);

                if (!res.ok) continue;

                const xmlText = await res.text();
                entries = parseArxivAtomXml(xmlText);
                providerRawCache.set(cacheKey, entries, 60 * 60 * 1000);
            }

            for (const entry of entries) {
                const arxivId = normalizeArxivIdentifier(entry.arxivId || entry.id);
                if (!arxivId || seenIds.has(arxivId)) continue;
                seenIds.add(arxivId);

                const year = entry.published ? parseInt(entry.published.slice(0, 4), 10) : null;
                const landingUrl = `https://arxiv.org/abs/${arxivId}`;
                const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;

                candidates.push({
                    id: landingUrl,
                    source: 'arxiv',
                    type: 'paper',
                    title: entry.title,
                    name: entry.title,
                    description: entry.summary,
                    authors: entry.authors,
                    year,
                    venue: 'arXiv Preprint',
                    doi: entry.doi || null,
                    url: landingUrl,
                    pdfUrl,
                    retrievalQuery: cleanQ,
                    retrievalTier: queries.indexOf(q) + 1,
                    metadata: {
                        isPreprint: true,
                        arxivId,
                    },
                    matchScore: 50,
                    
                    tier: 'Tier C',
                    evidenceLevel: 'UNVERIFIED',
                    evidenceSources: ['arXiv'],
                    evidenceStrength: 35,
                    matchBreakdown: {
                        anatomy: 50, modality: 50, task: 50, dimension: 50, target: 50,
                        domain: 50, semantic: 50, evidence: 35, metadata: 60, accessibility: 95, popularity: 50, overall: 50,
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
