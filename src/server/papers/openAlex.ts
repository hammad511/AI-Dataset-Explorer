/**
 * OpenAlex API Integration
 *
 * Discovers scholarly works, concepts, citations, and open-access metadata from OpenAlex.
 */

import { providerRawCache, buildPaperSearchKey } from './paperCache';

export interface OpenAlexAuthor {
    author: {
        id: string;
        display_name: string;
    };
    institutions?: Array<{ id: string; display_name: string }>;
}

export interface OpenAlexWorkRaw {
    id: string;
    doi?: string;
    title?: string;
    display_name?: string;
    publication_year?: number;
    publication_date?: string;
    cited_by_count?: number;
    open_access?: {
        is_oa?: boolean;
        oa_status?: string;
        oa_url?: string;
    };
    primary_location?: {
        source?: {
            display_name?: string;
            type?: string;
        };
        pdf_url?: string;
        landing_page_url?: string;
    };
    host_venue?: {
        display_name?: string;
    };
    authorships?: OpenAlexAuthor[];
    concepts?: Array<{
        id: string;
        display_name: string;
        score: number;
    }>;
    abstract_inverted_index?: Record<string, number[]>;
    type?: string;
}

export interface OpenAlexResponse {
    meta?: {
        count?: number;
        page?: number;
        per_page?: number;
    };
    results?: OpenAlexWorkRaw[];
}

/**
 * Reconstructs standard abstract paragraph text from OpenAlex inverted index structure.
 */
export function reconstructOpenAlexAbstract(invertedIndex?: Record<string, number[]>): string {
    if (!invertedIndex || typeof invertedIndex !== 'object') return '';
    const positions: Array<{ word: string; pos: number }> = [];

    for (const [word, indices] of Object.entries(invertedIndex)) {
        if (Array.isArray(indices)) {
            for (const pos of indices) {
                positions.push({ word, pos });
            }
        }
    }

    if (positions.length === 0) return '';
    positions.sort((a, b) => a.pos - b.pos);
    return positions.map((p) => p.word).join(' ');
}

const TIMEOUT_MS = 7500;

export function getOpenAlexApiKey(): string {
    return (process.env.OPENALEX_API_KEY || '').trim();
}

export function getOpenAlexEmail(): string {
    return (
        process.env.CONTACT_EMAIL ||
        process.env.OPENALEX_EMAIL ||
        process.env.CROSSREF_EMAIL ||
        'research@example.com'
    ).trim();
}

export function buildOpenAlexAuthQueryParams(): string {
    const apiKey = getOpenAlexApiKey();
    const mailto = getOpenAlexEmail();
    if (apiKey) {
        return `api_key=${encodeURIComponent(apiKey)}&mailto=${encodeURIComponent(mailto)}`;
    }
    return `mailto=${encodeURIComponent(mailto)}`;
}

export async function searchOpenAlex(
    query: string,
    limit: number = 8,
    trace?: Record<string, unknown>
): Promise<OpenAlexWorkRaw[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const cacheKey = buildPaperSearchKey('openalex', `${cleanQuery}:${limit}`);
    const cached = providerRawCache.get(cacheKey);
    if (cached) {
        if (trace) trace.openAlex = { success: true, cached: true, count: cached.length };
        return cached;
    }

    const mailto = getOpenAlexEmail();
    const authParams = buildOpenAlexAuthQueryParams();
    const endpoint = `https://api.openalex.org/works?search=${encodeURIComponent(cleanQuery)}&per-page=${limit}&${authParams}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(endpoint, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': `AIDatasetExplorer/2.0 (mailto:${mailto})`,
            },
            signal: controller.signal,
            next: { revalidate: 3600 },
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            const status = res.status;
            if (trace) {
                trace.openAlex = {
                    success: false,
                    httpStatus: status,
                    reason: `HTTP ${status}`,
                };
            }
            console.warn(`[OPENALEX] Search returned status ${status} for query: "${cleanQuery}"`);
            return [];
        }

        const data: OpenAlexResponse = await res.json();
        const results = Array.isArray(data.results) ? data.results : [];

        providerRawCache.set(cacheKey, results, 60 * 60 * 1000);

        if (trace) {
            trace.openAlex = {
                success: true,
                count: results.length,
                httpStatus: 200,
            };
        }

        return results;
    } catch (err: any) {
        clearTimeout(timeoutId);
        const isAbort = err.name === 'AbortError';
        if (trace) {
            trace.openAlex = {
                success: false,
                reason: isAbort ? 'Request timed out' : err.message,
            };
        }
        console.warn(`[OPENALEX] Fetch failed for query "${cleanQuery}":`, err.message);
        return [];
    }
}
