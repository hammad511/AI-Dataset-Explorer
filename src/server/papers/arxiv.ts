/**
 * arXiv API Integration
 *
 * Discovers preprints and recent machine learning/robotics research from arXiv.
 * Safely parses Atom XML feed responses without external binary dependencies.
 */

import { providerRawCache, buildPaperSearchKey } from './paperCache';

export interface ArxivPaperRaw {
    id: string;             // e.g. "http://arxiv.org/abs/2401.12345v1" or "2401.12345"
    arxivId: string;        // e.g. "2401.12345"
    title: string;
    summary: string;
    published: string;      // ISO string e.g. "2026-01-15T12:00:00Z"
    updated?: string;
    authors: string[];
    pdfUrl: string | null;
    landingUrl: string;
    primaryCategory?: string;
    categories: string[];
    comment?: string;
    journalRef?: string;
    doi?: string;
}

const TIMEOUT_MS = 7500;
const ARXIV_MIN_INTERVAL_MS = 3000; // Minimum 3-second cooldown per ArXiv terms of use

let lastArxivRequestTime = 0;
let arxivThrottleChain: Promise<void> = Promise.resolve();

export function getPoliteContactEmail(): string {
    return (
        process.env.CONTACT_EMAIL ||
        process.env.OPENALEX_EMAIL ||
        process.env.CROSSREF_EMAIL ||
        'research@example.com'
    ).trim();
}

export function getArxivUserAgent(): string {
    return `AI-Dataset-Explorer/1.0 (mailto:${getPoliteContactEmail()})`;
}

/**
 * Normalizes an ArXiv identifier by stripping URL prefixes and version suffixes (`v1`, `v2`, etc.).
 */
export function normalizeArxivIdentifier(rawId: string): string {
    if (!rawId) return '';
    const m = rawId
        .trim()
        .match(/(?:abs\/|pdf\/|arxiv\.org\/(?:abs|pdf)\/|arxiv:\s*)?([0-9]{4}\.[0-9]{4,5}|[a-z\-]+(?:\.[a-z\-]+)?\/[0-9]{7})(?:v[0-9]+)?/i);
    if (m && m[1]) {
        return m[1].replace(/v[0-9]+$/i, '');
    }
    return rawId.trim().replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//i, '').replace(/\.pdf$/i, '').replace(/v[0-9]+$/i, '');
}

export async function waitForArxivRateSlot(): Promise<void> {
    const nextSlot = arxivThrottleChain.then(async () => {
        const now = Date.now();
        const elapsed = now - lastArxivRequestTime;
        if (lastArxivRequestTime > 0 && elapsed < ARXIV_MIN_INTERVAL_MS) {
            await new Promise((r) => setTimeout(r, ARXIV_MIN_INTERVAL_MS - elapsed));
        }
        lastArxivRequestTime = Date.now();
    });
    arxivThrottleChain = nextSlot.catch(() => {});
    await nextSlot;
}

/**
 * Lightweight XML tag extractor for arXiv Atom feed.
 */
export function parseArxivAtomXml(xmlText: string): ArxivPaperRaw[] {
    const papers: ArxivPaperRaw[] = [];
    const seenBaseIds = new Set<string>();
    const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
    const entries = xmlText.match(entryRegex) || [];

    for (const entry of entries) {
        // ID
        const idMatch = entry.match(/<id>(.*?)<\/id>/i);
        const rawId = idMatch ? idMatch[1].trim() : '';
        const arxivId = normalizeArxivIdentifier(rawId);
        if (!arxivId || seenBaseIds.has(arxivId.toLowerCase())) continue;

        // Title
        const titleMatch = entry.match(/<title[\s\S]*?>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : 'Untitled arXiv Paper';

        // Summary
        const summaryMatch = entry.match(/<summary[\s\S]*?>([\s\S]*?)<\/summary>/i);
        const summary = summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : '';

        // Published date
        const pubMatch = entry.match(/<published>(.*?)<\/published>/i);
        const published = pubMatch ? pubMatch[1].trim() : '';

        // Authors
        const authors: string[] = [];
        const authorMatches = entry.match(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/gi) || [];
        for (const auth of authorMatches) {
            const nameMatch = auth.match(/<name>(.*?)<\/name>/i);
            if (nameMatch) {
                authors.push(nameMatch[1].trim());
            }
        }

        // Links — canonical direct PDF URL and HTTPS abstract URL using normalized versionless arxivId
        const landingUrl = `https://arxiv.org/abs/${arxivId}`;
        const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;

        // Primary Category
        const catMatch = entry.match(/<arxiv:primary_category[^>]*?term="(.*?)"/i);
        const primaryCategory = catMatch ? catMatch[1].trim() : undefined;

        // All Categories
        const categories: string[] = [];
        const allCatMatches = entry.match(/<category[^>]*?term="(.*?)"/gi) || [];
        for (const cat of allCatMatches) {
            const m = cat.match(/term="(.*?)"/i);
            if (m && !categories.includes(m[1].trim())) {
                categories.push(m[1].trim());
            }
        }

        // DOI if published
        const doiMatch = entry.match(/<arxiv:doi[^>]*>(.*?)<\/arxiv:doi>/i);
        const doi = doiMatch ? doiMatch[1].trim() : undefined;

        // Journal ref if published
        const jrMatch = entry.match(/<arxiv:journal_ref[^>]*>(.*?)<\/arxiv:journal_ref>/i);
        const journalRef = jrMatch ? jrMatch[1].trim() : undefined;

        if (title && arxivId) {
            seenBaseIds.add(arxivId.toLowerCase());
            papers.push({
                id: landingUrl,
                arxivId,
                title,
                summary,
                published,
                authors,
                pdfUrl,
                landingUrl,
                primaryCategory,
                categories,
                doi,
                journalRef,
            });
        }
    }

    return papers;
}

export async function searchArxiv(
    query: string,
    limit: number = 8,
    trace?: Record<string, unknown>
): Promise<ArxivPaperRaw[]> {
    if (process.env.ARXIV_ENABLED === 'false') {
        if (trace) trace.arxiv = { success: false, reason: 'Disabled by ARXIV_ENABLED=false' };
        return [];
    }

    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const cacheKey = buildPaperSearchKey('arxiv', `${cleanQuery}:${limit}`);
    const cached = providerRawCache.get(cacheKey);
    if (cached) {
        if (trace) trace.arxiv = { success: true, cached: true, count: cached.length };
        return cached;
    }

    // Clean query for arXiv search syntax: escape double quotes, strip special boolean chars
    const sanitized = cleanQuery
        .replace(/["'\(\)\+]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 1)
        .slice(0, 6)
        .join(' ');

    const endpoint = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(sanitized)}&start=0&max_results=${limit}&sortBy=relevance&sortOrder=descending`;

    try {
        await waitForArxivRateSlot();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const res = await fetch(endpoint, {
            headers: {
                'Accept': 'application/atom+xml, application/xml, text/xml',
                'User-Agent': getArxivUserAgent(),
            },
            signal: controller.signal,
            next: { revalidate: 3600 },
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            const status = res.status;
            if (trace) trace.arxiv = { success: false, httpStatus: status, reason: `HTTP ${status}` };
            console.warn(`[ARXIV] Search returned status ${status} for query: "${cleanQuery}"`);
            return [];
        }

        const xmlText = await res.text();
        const papers = parseArxivAtomXml(xmlText);

        providerRawCache.set(cacheKey, papers, 60 * 60 * 1000);

        if (trace) {
            trace.arxiv = {
                success: true,
                count: papers.length,
                httpStatus: 200,
            };
        }

        return papers;
    } catch (err: any) {
        const isAbort = err?.name === 'AbortError';
        if (trace) trace.arxiv = { success: false, reason: isAbort ? 'Request timed out' : err?.message };
        console.warn(`[ARXIV] Fetch failed for query "${cleanQuery}":`, err?.message || err);
        return [];
    }
}
