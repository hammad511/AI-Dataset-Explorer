/**
 * Crossref API Integration
 *
 * Discovers peer-reviewed conference/journal papers and verifies DOIs/metadata.
 */

import { providerRawCache, buildPaperSearchKey } from './paperCache';

export interface CrossrefWorkRaw {
    DOI: string;
    title?: string[];
    author?: Array<{
        given?: string;
        family?: string;
        name?: string;
        affiliation?: Array<{ name: string }>;
    }>;
    'container-title'?: string[];
    publisher?: string;
    published?: {
        'date-parts'?: number[][];
    };
    'published-print'?: {
        'date-parts'?: number[][];
    };
    'published-online'?: {
        'date-parts'?: number[][];
    };
    'is-referenced-by-count'?: number;
    URL?: string;
    abstract?: string;
    subject?: string[];
    type?: string;
    link?: Array<{
        URL?: string;
        'content-type'?: string;
    }>;
}

export interface CrossrefResponse {
    status?: string;
    message?: {
        'total-results'?: number;
        items?: CrossrefWorkRaw[];
    };
}

const TIMEOUT_MS = 7500;
const CROSSREF_SELECT_FIELDS =
    'DOI,title,author,published,abstract,is-referenced-by-count,URL,container-title';

export function getCrossrefContactEmail(): string {
    return (
        process.env.CONTACT_EMAIL ||
        process.env.OPENALEX_EMAIL ||
        process.env.CROSSREF_EMAIL ||
        'research@example.com'
    ).trim();
}

export async function searchCrossref(
    query: string,
    limit: number = 6,
    trace?: Record<string, unknown>
): Promise<CrossrefWorkRaw[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const cacheKey = buildPaperSearchKey('crossref', `${cleanQuery}:${limit}`);
    const cached = providerRawCache.get(cacheKey);
    if (cached) {
        if (trace) trace.crossref = { success: true, cached: true, count: cached.length };
        return cached;
    }

    const mailto = getCrossrefContactEmail();
    const endpoint = `https://api.crossref.org/works?query=${encodeURIComponent(cleanQuery)}&rows=${limit}&select=${encodeURIComponent(CROSSREF_SELECT_FIELDS)}&mailto=${encodeURIComponent(mailto)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(endpoint, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': `AI-Dataset-Explorer/1.0 (mailto:${mailto})`,
            },
            signal: controller.signal,
            next: { revalidate: 3600 },
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            const status = res.status;
            if (trace) trace.crossref = { success: false, httpStatus: status, reason: `HTTP ${status}` };
            console.warn(`[CROSSREF] Search returned status ${status} for query: "${cleanQuery}"`);
            return [];
        }

        const data: CrossrefResponse = await res.json();
        const items = Array.isArray(data.message?.items) ? data.message!.items : [];

        providerRawCache.set(cacheKey, items, 60 * 60 * 1000);

        if (trace) {
            trace.crossref = {
                success: true,
                count: items.length,
                httpStatus: 200,
            };
        }

        return items;
    } catch (err: any) {
        clearTimeout(timeoutId);
        const isAbort = err.name === 'AbortError';
        if (trace) trace.crossref = { success: false, reason: isAbort ? 'Request timed out' : err.message };
        console.warn(`[CROSSREF] Fetch failed for query "${cleanQuery}":`, err.message);
        return [];
    }
}
