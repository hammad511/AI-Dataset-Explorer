/**
 * Unified Hugging Face Client, Token Resolver & Resilient Fetch Helper
 */

export const HF_EXPAND_QUERY_PARAMS =
    'expand[]=downloads&expand[]=likes&expand[]=tags&expand[]=pipeline_tag&expand[]=cardData&expand[]=siblings';

let warnedUnauthenticated = false;

/**
 * Single shared helper resolving HF_TOKEN across all supported environment variable names.
 */
export function getHuggingFaceToken(): string {
    return (
        process.env.HF_TOKEN ||
        process.env.HUGGING_FACE_TOKEN ||
        process.env.HUGGINGFACE_TOKEN ||
        process.env.HUGGING_FACE_HUB_TOKEN ||
        process.env.HF_API_KEY ||
        ''
    ).trim();
}

export function getHuggingFaceHeaders(): Record<string, string> {
    const token = getHuggingFaceToken();

    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'AI-Dataset-Explorer/2.0 (Node.js)',
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else if (!warnedUnauthenticated) {
        warnedUnauthenticated = true;
        console.warn(
            '[Hugging Face API] Warning: Running unauthenticated (HF_TOKEN is not configured). Rate limits may apply.'
        );
    }

    return headers;
}

/**
 * Extracts total parameter count or byte size from expanded Hugging Face metadata
 * (safetensors.total, cardData, or siblings file sizes).
 */
export function extractModelParameterSize(item: any): {
    parameters: number | null;
    safetensorsBytes: number | null;
} {
    let parameters: number | null = null;
    let safetensorsBytes: number | null = null;

    if (item?.safetensors?.total && Number.isFinite(Number(item.safetensors.total))) {
        parameters = Number(item.safetensors.total);
    } else if (item?.cardData?.parameters && Number.isFinite(Number(item.cardData.parameters))) {
        parameters = Number(item.cardData.parameters);
    }

    if (Array.isArray(item?.siblings)) {
        let totalBytes = 0;
        for (const sib of item.siblings) {
            const fname = String(sib?.rfilename || '');
            const fsize = Number(sib?.size || 0);
            if (/\.(safetensors|bin|pt|pth|gguf|onnx)$/i.test(fname) && fsize > 0) {
                totalBytes += fsize;
            }
        }
        if (totalBytes > 0) {
            safetensorsBytes = totalBytes;
            // Approximate parameters (FP16 ~ 2 bytes/param) when explicit count is absent
            if (parameters === null) {
                parameters = Math.round(totalBytes / 2);
            }
        }
    }

    return { parameters, safetensorsBytes };
}

/**
 * Extracts normalized license from expanded `cardData` or `license:` tags.
 */
export function extractHuggingFaceLicense(item: any): string {
    if (item?.cardData?.license) {
        return Array.isArray(item.cardData.license)
            ? String(item.cardData.license[0])
            : String(item.cardData.license);
    }
    const tags: string[] = Array.isArray(item?.tags) ? item.tags : [];
    const licenseTag = tags.find((t) => typeof t === 'string' && t.startsWith('license:'));
    if (licenseTag) {
        return licenseTag.replace('license:', '').trim();
    }
    if (item?.license) {
        return String(item.license);
    }
    return 'Open Access';
}

export interface HfRetryOptions {
    timeoutMs?: number;
    maxRetries?: number;
    baseDelayMs?: number;
    onNetworkFailure?: () => void;
}

/**
 * Executes a Hugging Face API fetch with automatic exponential backoff on HTTP 429 and 503.
 */
export async function fetchHuggingFaceWithRetry(
    url: string,
    headers?: Record<string, string>,
    options: HfRetryOptions = {}
): Promise<Response | null> {
    const reqHeaders = headers || getHuggingFaceHeaders();
    const timeoutMs = options.timeoutMs ?? 8000;
    const maxRetries = options.maxRetries ?? 2;
    const baseDelayMs = options.baseDelayMs ?? 450;

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

            if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
                const retryAfterHeader = res.headers.get('retry-after');
                const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : NaN;
                const delay = Number.isFinite(retryAfterMs) && retryAfterMs > 0
                    ? Math.min(retryAfterMs, 3000)
                    : baseDelayMs * Math.pow(2, attempt);
                console.warn(
                    `[Hugging Face API] HTTP ${res.status} on ${url.slice(0, 90)}. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`
                );
                await new Promise((r) => setTimeout(r, delay));
                continue;
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
            console.error('[Hugging Face API] Network error:', url.slice(0, 100), e?.message || e);
            return null;
        }
    }

    return null;
}

export * from './huggingfaceDatasets';
export * from './huggingfaceModels';
