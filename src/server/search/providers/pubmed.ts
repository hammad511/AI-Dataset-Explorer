/**
 * PubMed Provider Adapter (Search Engine 2.0.0)
 *
 * Fetches and normalizes biomedical peer-reviewed papers from NCBI E-Utilities API.
 * Uses ESearch + EFetch to extract authentic abstracts, DOIs, authors, and venues.
 */

import { UnifiedCandidate, StructuredQueryUnderstanding, NormalizedSearchResult } from '../types';
import { buildNcbiAuthParams, fetchNcbiWithRetry } from '@/server/papers/pubmed';

const PUBMED_SEARCH_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const PUBMED_FETCH_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const PUBMED_SUMMARY_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';

function parsePubMedXml(xml: string): Record<string, { title: string; abstract: string; authors: string[]; year: number | null; venue: string; doi: string | null }> {
    const results: Record<string, any> = {};
    const articles = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

    for (const art of articles) {
        const pmidMatch = art.match(/<PMID[^>]*>(.*?)<\/PMID>/);
        const pmid = pmidMatch ? pmidMatch[1].trim() : null;
        if (!pmid) continue;

        const titleMatch = art.match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/);
        const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';

        // Extract abstract texts
        const abstractMatches = art.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g) || [];
        const abstractParts: string[] = [];
        for (const ab of abstractMatches) {
            const cleaned = ab.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            if (cleaned) abstractParts.push(cleaned);
        }
        const abstract = abstractParts.join(' ');

        // Authors
        const authors: string[] = [];
        const authorMatches = art.match(/<Author[^>]*>[\s\S]*?<\/Author>/g) || [];
        for (const auth of authorMatches) {
            const lastMatch = auth.match(/<LastName>(.*?)<\/LastName>/);
            const firstMatch = auth.match(/<ForeName>(.*?)<\/ForeName>/);
            if (lastMatch) {
                const name = firstMatch ? `${firstMatch[1]} ${lastMatch[1]}` : lastMatch[1];
                authors.push(name.trim());
            }
        }

        // Year
        const yearMatch = art.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/) || art.match(/<JournalIssue>[\s\S]*?<Year>(\d{4})<\/Year>/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

        // Venue / Journal
        const journalMatch = art.match(/<Title>(.*?)<\/Title>/) || art.match(/<MedlineTA>(.*?)<\/MedlineTA>/);
        const venue = journalMatch ? journalMatch[1].trim() : 'Biomedical Journal';

        // DOI
        const doiMatch = art.match(/<ArticleId IdType="doi">(.*?)<\/ArticleId>/);
        const doi = doiMatch ? doiMatch[1].trim() : null;

        results[pmid] = {
            title: rawTitle,
            abstract,
            authors,
            year,
            venue,
            doi,
        };
    }

    return results;
}

export async function fetchPubMedPapers(
    queries: string[],
    understanding: StructuredQueryUnderstanding,
    poolLimit = 40
): Promise<UnifiedCandidate[]> {
    const candidates: UnifiedCandidate[] = [];
    const seenIds = new Set<string>();
    const authParams = buildNcbiAuthParams();

    for (let tierIdx = 0; tierIdx < Math.min(queries.length, 3); tierIdx++) {
        const q = queries[tierIdx];
        const retrievalTier = tierIdx + 1;

        try {
            // Step 1: ESearch to get PubMed IDs
            const searchUrl = `${PUBMED_SEARCH_API}?db=pubmed&term=${encodeURIComponent(q)}&retmode=json&retmax=12${authParams}`;
            const searchRes = await fetchNcbiWithRetry(searchUrl, 6000, 2);

            if (!searchRes || !searchRes.ok) continue;

            const searchData = await searchRes.json().catch(() => null);
            if (!searchData || searchData.error) continue;
            const idList: string[] = searchData.esearchresult?.idlist || [];
            if (idList.length === 0) continue;

            // Step 2: Try EFetch for authentic full abstracts in XML
            let parsedXml: Record<string, any> = {};
            try {
                const fetchUrl = `${PUBMED_FETCH_API}?db=pubmed&id=${idList.join(',')}&retmode=xml${authParams}`;
                const fetchRes = await fetchNcbiWithRetry(fetchUrl, 6000, 2);

                if (fetchRes && fetchRes.ok) {
                    const xmlText = await fetchRes.text();
                    if (!/<ERROR>/i.test(xmlText)) {
                        parsedXml = parsePubMedXml(xmlText);
                    }
                }
            } catch {
                // EFetch failed, fallback to ESummary below
            }

            // Step 3: Fallback to ESummary for any missing metadata
            const missingIds = idList.filter(id => !parsedXml[id]);
            let summaryMap: Record<string, any> = {};

            if (missingIds.length > 0) {
                try {
                    const summaryUrl = `${PUBMED_SUMMARY_API}?db=pubmed&id=${missingIds.join(',')}&retmode=json${authParams}`;
                    const sumRes = await fetchNcbiWithRetry(summaryUrl, 5000, 2);
                    if (sumRes && sumRes.ok) {
                        const sumData = await sumRes.json().catch(() => null);
                        if (sumData && !sumData.error) {
                            summaryMap = sumData.result || {};
                        }
                    }
                } catch {
                    // Ignore summary error
                }
            }

            for (const pmid of idList) {
                if (seenIds.has(pmid)) continue;
                seenIds.add(pmid);

                const fromXml = parsedXml[pmid];
                const fromSummary = summaryMap[pmid];

                const title = fromXml?.title || fromSummary?.title?.replace(/\.$/, '') || 'Biomedical Research Paper';
                const abstract = fromXml?.abstract || (fromSummary?.source ? `Published in ${fromSummary.source}.` : '');
                const authors = fromXml?.authors?.length ? fromXml.authors : (Array.isArray(fromSummary?.authors) ? fromSummary.authors.map((a: any) => a.name) : []);
                const year = fromXml?.year || (fromSummary?.pubdate ? parseInt(fromSummary.pubdate.slice(0, 4), 10) : null);
                const venue = fromXml?.venue || fromSummary?.source || 'PubMed Indexed Journal';
                const doi = fromXml?.doi || fromSummary?.articleids?.find((aid: any) => aid.idtype === 'doi')?.value || null;

                candidates.push({
                    id: `pmid:${pmid}`,
                    source: 'pubmed',
                    type: 'paper',
                    title,
                    name: title,
                    description: abstract,
                    authors,
                    year,
                    venue,
                    doi,
                    url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                    retrievalQuery: q,
                    retrievalTier,
                    metadata: {
                        pmid,
                        venue,
                        hasAbstract: Boolean(abstract.length > 50),
                    },
                    matchScore: 60,
                    
                    tier: 'Tier C',
                    evidenceLevel: 'UNVERIFIED',
                    evidenceSources: ['NCBI PubMed'],
                    evidenceStrength: 40,
                    matchBreakdown: {
                        anatomy: 50, modality: 50, task: 50, dimension: 50, target: 50,
                        domain: 50, semantic: 50, evidence: 40, metadata: 70, accessibility: 90, popularity: 50, overall: 60,
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
