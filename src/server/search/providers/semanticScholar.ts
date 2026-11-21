/**
 * Semantic Scholar Provider Adapter
 *
 * Fetches and normalizes research paper candidates from Semantic Scholar Graph API.
 */

import { UnifiedCandidate, StructuredQueryUnderstanding } from '../types';
import { getSemanticScholarApiKey, fetchSemanticScholarWithRetry } from '@/server/papers/semanticScholar';

const S2_API = 'https://api.semanticscholar.org/graph/v1/paper/search';
const FIELDS = 'paperId,title,abstract,authors,year,venue,citationCount,openAccessPdf,externalIds,url';

export async function fetchSemanticScholarPapers(
    queries: string[],
    understanding: StructuredQueryUnderstanding,
    poolLimit = 50
): Promise<UnifiedCandidate[]> {
    const candidates: UnifiedCandidate[] = [];
    const seenIds = new Set<string>();
    const apiKey = getSemanticScholarApiKey();
    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'AIDatasetExplorer/2.0 (Academic Research Assistant)',
    };
    if (apiKey) headers['x-api-key'] = apiKey;

    for (const q of queries.slice(0, 3)) {
        try {
            const url = `${S2_API}?query=${encodeURIComponent(q)}&fields=${FIELDS}&limit=20`;
            const res = await fetchSemanticScholarWithRetry(url, headers, 6000, 2);

            if (!res.ok) continue;

            const data = await res.json();
            if (!Array.isArray(data.data)) continue;

            for (const paper of data.data) {
                const id = paper.paperId || paper.externalIds?.DOI || '';
                if (!id || seenIds.has(id)) continue;
                seenIds.add(id);

                const authors = Array.isArray(paper.authors) ? paper.authors.map((a: any) => a.name) : [];
                const doi = paper.externalIds?.DOI || null;

                candidates.push({
                    id,
                    source: 'semantic_scholar',
                    type: 'paper',
                    title: paper.title || 'Untitled Paper',
                    name: paper.title,
                    description: paper.abstract || '',
                    authors,
                    year: paper.year || null,
                    venue: paper.venue || 'Peer-Reviewed Conference / Journal',
                    doi,
                    url: paper.url || (doi ? `https://doi.org/${doi}` : `https://www.semanticscholar.org/paper/${id}`),
                    pdfUrl: paper.openAccessPdf?.url || null,
                    citationCount: paper.citationCount || null,
                    retrievalQuery: q,
                    retrievalTier: queries.indexOf(q) + 1,
                    metadata: {
                        externalIds: paper.externalIds,
                        isOpenAccess: Boolean(paper.openAccessPdf),
                    },
                    matchScore: 50,
                    
                    tier: 'Tier C',
                    evidenceLevel: 'UNVERIFIED',
                    evidenceSources: ['Semantic Scholar'],
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
