/**
 * PubMed API Integration (NCBI E-utilities)
 *
 * Discovers peer-reviewed biomedical, clinical, and medical imaging literature.
 * Automatically triggered when queries involve medical imaging, healthcare, biology, or clinical datasets.
 */

import { providerRawCache, buildPaperSearchKey } from './paperCache';

export interface PubMedArticleRaw {
    uid: string;
    title: string;
    authors: string[];
    source: string;
    pubdate: string;
    year?: number;
    doi?: string;
    url: string;
}

const TIMEOUT_MS = 7500;

export function getNcbiApiKey(): string {
    return (process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY || '').trim();
}

export function getNcbiEmail(): string {
    return (
        process.env.CONTACT_EMAIL ||
        process.env.OPENALEX_EMAIL ||
        process.env.CROSSREF_EMAIL ||
        'research@example.com'
    ).trim();
}

/**
 * Builds standard NCBI E-Utilities query parameters (`tool=ai_dataset_explorer&email=...` + optional `&api_key=...`).
 */
export function buildNcbiAuthParams(): string {
    const email = getNcbiEmail();
    const apiKey = getNcbiApiKey();
    let params = `&tool=ai_dataset_explorer&email=${encodeURIComponent(email)}`;
    if (apiKey) {
        params += `&api_key=${encodeURIComponent(apiKey)}`;
    }
    return params;
}

// Rate limiter state:
// 10 RPS (100ms min interval) when NCBI_API_KEY is present; < 3 RPS (350ms min interval) when absent.
let lastNcbiRequestTime = 0;
let throttleChain: Promise<void> = Promise.resolve();

export function getNcbiMinIntervalMs(): number {
    return getNcbiApiKey() ? 105 : 350;
}

async function waitForNcbiRateSlot(): Promise<void> {
    const minInterval = getNcbiMinIntervalMs();
    const nextSlot = throttleChain.then(async () => {
        const now = Date.now();
        const elapsed = now - lastNcbiRequestTime;
        if (elapsed < minInterval) {
            await new Promise((r) => setTimeout(r, minInterval - elapsed));
        }
        lastNcbiRequestTime = Date.now();
    });
    throttleChain = nextSlot.catch(() => {});
    await nextSlot;
}

export async function fetchNcbiWithRetry(
    url: string,
    timeoutMs: number = TIMEOUT_MS,
    maxRetries: number = 2
): Promise<Response | null> {
    const baseDelayMs = 450;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await waitForNcbiRateSlot();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                headers: {
                    'Accept': 'application/json, text/xml, application/xml',
                    'User-Agent': 'ai_dataset_explorer/2.0',
                },
                signal: controller.signal,
                cache: 'no-store',
            });
            clearTimeout(timeoutId);

            if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
                const retryAfterHeader = res.headers.get('retry-after');
                const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : NaN;
                const delay = Number.isFinite(retryAfterMs) && retryAfterMs > 0
                    ? Math.min(retryAfterMs, 3000)
                    : baseDelayMs * Math.pow(2, attempt);
                console.warn(
                    `[PUBMED] HTTP ${res.status} rate limit/service busy. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`
                );
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }

            if (res.status === 429) {
                console.warn('[PUBMED] Rate limit (HTTP 429) exceeded after retries.');
            }

            return res;
        } catch (err: any) {
            clearTimeout(timeoutId);
            if (attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }
            console.warn('[PUBMED] Network error:', err?.message || err);
            return null;
        }
    }

    return null;
}

export async function searchPubMed(
    query: string,
    limit: number = 6,
    trace?: Record<string, unknown>
): Promise<PubMedArticleRaw[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const cacheKey = buildPaperSearchKey('pubmed', `${cleanQuery}:${limit}`);
    const cached = providerRawCache.get(cacheKey);
    if (cached) {
        if (trace) trace.pubmed = { success: true, cached: true, count: cached.length };
        return cached;
    }

    const authParams = buildNcbiAuthParams();
    const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(cleanQuery)}&retmode=json&retmax=${limit}${authParams}`;

    try {
        const searchRes = await fetchNcbiWithRetry(esearchUrl, TIMEOUT_MS, 2);

        if (!searchRes || !searchRes.ok) {
            if (trace) trace.pubmed = { success: false, httpStatus: searchRes?.status ?? 0 };
            return [];
        }

        const searchText = await searchRes.text();
        let searchData: any;
        try {
            searchData = JSON.parse(searchText);
        } catch {
            console.warn('[PUBMED] Non-JSON esearch response received from NCBI.');
            if (trace) trace.pubmed = { success: false, reason: 'Invalid JSON response from esearch' };
            return [];
        }

        if (searchData?.error) {
            console.warn('[PUBMED] NCBI esearch returned API error:', searchData.error);
            if (trace) trace.pubmed = { success: false, reason: String(searchData.error) };
            return [];
        }

        const idList: string[] = searchData.esearchresult?.idlist || [];

        if (idList.length === 0) {
            providerRawCache.set(cacheKey, [], 60 * 60 * 1000);
            if (trace) trace.pubmed = { success: true, count: 0 };
            return [];
        }

        const esummaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${idList.join(',')}&retmode=json${authParams}`;
        const summaryRes = await fetchNcbiWithRetry(esummaryUrl, TIMEOUT_MS, 2);

        if (!summaryRes || !summaryRes.ok) {
            if (trace) trace.pubmed = { success: false, httpStatus: summaryRes?.status ?? 0 };
            return [];
        }

        const summaryText = await summaryRes.text();
        let summaryData: any;
        try {
            summaryData = JSON.parse(summaryText);
        } catch {
            console.warn('[PUBMED] Non-JSON esummary response received from NCBI.');
            if (trace) trace.pubmed = { success: false, reason: 'Invalid JSON response from esummary' };
            return [];
        }

        if (summaryData?.error) {
            console.warn('[PUBMED] NCBI esummary returned API error:', summaryData.error);
            if (trace) trace.pubmed = { success: false, reason: String(summaryData.error) };
            return [];
        }
        const resultDict = summaryData.result || {};
        const articles: PubMedArticleRaw[] = [];

        for (const uid of idList) {
            const item = resultDict[uid];
            if (!item) continue;

            const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
            const authors = Array.isArray(item.authors) ? item.authors.map((a: any) => a.name).filter(Boolean) : [];
            const source = item.source || item.fulljournalname || 'PubMed Central';
            const pubdate = item.pubdate || item.sortpubdate || '';
            const yearMatch = pubdate.match(/\b(19\d\d|20\d\d)\b/);
            const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

            let doi: string | undefined;
            if (Array.isArray(item.articleids)) {
                const doiObj = item.articleids.find((id: any) => id.idtype === 'doi');
                if (doiObj?.value) doi = doiObj.value;
            }

            if (title) {
                articles.push({
                    uid,
                    title,
                    authors,
                    source,
                    pubdate,
                    year,
                    doi,
                    url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
                });
            }
        }

        providerRawCache.set(cacheKey, articles, 60 * 60 * 1000);

        if (trace) {
            trace.pubmed = {
                success: true,
                count: articles.length,
                httpStatus: 200,
            };
        }

        return articles;
    } catch (err: any) {
        const isAbort = err?.name === 'AbortError';
        if (trace) trace.pubmed = { success: false, reason: isAbort ? 'Request timed out' : err?.message };
        console.warn(`[PUBMED] Fetch failed for query "${cleanQuery}":`, err?.message || err);
        return [];
    }
}
