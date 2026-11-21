/**
 * Unified Kaggle REST API (v1) Client, Authentication Builder & Resilient Fetch Helper
 *
 * Supports:
 * 1) Kaggle API Tokens (`KAGGLE_API_TOKEN` or `KGAT_...` in `KAGGLE_KEY`) via `Authorization: Bearer <token>`
 *    without requiring `KAGGLE_USERNAME`.
 * 2) Legacy `KAGGLE_USERNAME` + `KAGGLE_KEY` via `Authorization: Basic <base64(username:key)>`.
 */

export const KAGGLE_DATASETS_LIST_ENDPOINT = 'https://www.kaggle.com/api/v1/datasets/list';

let warnedUnconfiguredKaggle = false;

export function getKaggleBearerToken(): string {
    const apiToken = (process.env.KAGGLE_API_TOKEN || '').trim();
    if (apiToken) return apiToken;

    const key = (process.env.KAGGLE_KEY || '').trim();
    if (key.startsWith('KGAT_') || key.startsWith('kgat_')) {
        return key;
    }

    return '';
}

export function isKaggleConfigured(): boolean {
    if (getKaggleBearerToken()) return true;
    const username = (process.env.KAGGLE_USERNAME || '').trim();
    const key = (process.env.KAGGLE_KEY || '').trim();
    return Boolean(username && key);
}

export function getKaggleAuthHeaders(): Record<string, string> {
    const bearerToken = getKaggleBearerToken();
    const username = (process.env.KAGGLE_USERNAME || '').trim();
    const key = (process.env.KAGGLE_KEY || '').trim();

    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'AI-Dataset-Explorer/2.0 (Node.js)',
    };

    if (bearerToken) {
        headers['Authorization'] = `Bearer ${bearerToken}`;
    } else if (username && key) {
        const credentials = Buffer.from(`${username}:${key}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
    } else if (!warnedUnconfiguredKaggle) {
        warnedUnconfiguredKaggle = true;
        console.warn(
            '[Kaggle API] Warning: Kaggle credentials not configured (set KAGGLE_API_TOKEN or KAGGLE_USERNAME + KAGGLE_KEY).'
        );
    }

    return headers;
}

export interface NormalizedKaggleItem {
    id: string;
    ref: string;
    title: string;
    subtitle: string;
    description: string;
    url: string;
    downloadCount: number | null;
    voteCount: number | null;
    usabilityRating: number | null;
    licenseName: string;
    tags: string[];
    totalBytes: number | null;
    creatorName: string;
    ownerRef: string;
    lastUpdated: string | null;
    isFeatured: boolean;
}

/**
 * Normalizes a raw Kaggle `/api/v1/datasets/list` item into a consistent schema.
 */
export function normalizeKaggleDatasetItem(item: any): NormalizedKaggleItem | null {
    if (!item || typeof item !== 'object') return null;

    const ref = String(
        item.ref ||
        (item.ownerRef && item.datasetSlug ? `${item.ownerRef}/${item.datasetSlug}` : '') ||
        item.id ||
        ''
    ).trim();

    if (!ref) return null;

    const title = String(item.title || item.datasetTitle || ref.split('/').pop() || ref).trim();
    const subtitle = String(item.subtitle || '').trim();
    const description = String(item.description || subtitle || '').trim();
    const url = item.url && String(item.url).startsWith('http')
        ? String(item.url)
        : `https://www.kaggle.com/datasets/${ref}`;

    const downloadCount = item.downloadCount != null && Number.isFinite(Number(item.downloadCount))
        ? Number(item.downloadCount)
        : null;
    const voteCount = item.voteCount != null && Number.isFinite(Number(item.voteCount))
        ? Number(item.voteCount)
        : null;
    const usabilityRating = item.usabilityRating != null && Number.isFinite(Number(item.usabilityRating))
        ? Number(item.usabilityRating)
        : null;
    const totalBytes = item.totalBytes != null && Number.isFinite(Number(item.totalBytes))
        ? Number(item.totalBytes)
        : null;

    const licenseName = String(item.licenseName || 'Community / Open Access').trim();
    const tags: string[] = Array.isArray(item.tags)
        ? item.tags
            .map((t: any) => (typeof t === 'string' ? t : t?.name || t?.description || ''))
            .map((s: string) => String(s || '').trim())
            .filter(Boolean)
        : [];

    const creatorName = String(item.creatorName || item.ownerName || item.ownerRef || 'unknown').trim();
    const ownerRef = String(item.ownerRef || item.ownerName || creatorName).trim();
    const lastUpdated = item.lastUpdated ? String(item.lastUpdated) : null;
    const isFeatured = Boolean(item.isFeatured);

    return {
        id: ref,
        ref,
        title,
        subtitle,
        description,
        url,
        downloadCount,
        voteCount,
        usabilityRating,
        licenseName,
        tags,
        totalBytes,
        creatorName,
        ownerRef,
        lastUpdated,
        isFeatured,
    };
}

export interface KaggleFetchOptions {
    timeoutMs?: number;
    maxRetries?: number;
    baseDelayMs?: number;
    onNetworkFailure?: () => void;
}

/**
 * Fetches Kaggle API endpoint with clear diagnostic logs for HTTP 401/403/429 and retry on 429/503.
 */
export async function fetchKaggleWithRetry(
    url: string,
    headers?: Record<string, string>,
    options: KaggleFetchOptions = {}
): Promise<Response | null> {
    const reqHeaders = headers || getKaggleAuthHeaders();
    const timeoutMs = options.timeoutMs ?? 8000;
    const maxRetries = options.maxRetries ?? 2;
    const baseDelayMs = options.baseDelayMs ?? 500;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                headers: reqHeaders,
                signal: ctrl.signal,
                cache: 'no-store',
            });
            clearTimeout(tid);

            if (res.status === 401 || res.status === 403) {
                const errBody = await res.clone().text().catch(() => '');
                console.error(
                    `[Kaggle API] Authentication/Authorization failed (HTTP ${res.status}) on ${url.slice(0, 90)}. Check KAGGLE_API_TOKEN or KAGGLE_USERNAME/KAGGLE_KEY. Body: ${errBody.slice(0, 250)}`
                );
                return res;
            }

            if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                console.warn(
                    `[Kaggle API] Rate limit / temporary error (HTTP ${res.status}) on ${url.slice(0, 90)}. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`
                );
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }

            if (res.status === 429) {
                console.error(`[Kaggle API] Rate limit exceeded (HTTP 429) after ${maxRetries + 1} attempts.`);
            }

            return res;
        } catch (e: any) {
            clearTimeout(tid);
            if (options.onNetworkFailure) options.onNetworkFailure();
            if (attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }
            console.error('[Kaggle API] Network fetch error:', url.slice(0, 100), e?.message || e);
            return null;
        }
    }

    return null;
}

export * from './kaggleDatasets';
