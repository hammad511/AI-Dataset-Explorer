/**
 * In-process sliding-window rate limiter.
 *
 * PRODUCTION NOTE: This uses a module-level Map and resets on each deployment.
 * Replace with Redis/Upstash for multi-instance production deployments.
 *
 * Not vulnerable to X-Forwarded-For spoofing when the extractIp helper
 * is used — callers must decide whether to trust proxy headers.
 */

interface RateLimitStore {
    timestamps: number[];
}

const stores = new Map<string, Map<string, RateLimitStore>>();

/**
 * Returns true if the key has exceeded maxRequests within windowMs.
 * Automatically records the current request.
 */
export function isRateLimited(
    namespace: string,
    key: string,
    maxRequests: number,
    windowMs: number,
): boolean {
    if (!stores.has(namespace)) {
        stores.set(namespace, new Map());
    }
    const store = stores.get(namespace)!;
    const now = Date.now();

    const entry = store.get(key) ?? { timestamps: [] };
    // Prune timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= maxRequests) {
        store.set(key, entry);
        return true;
    }

    entry.timestamps.push(now);
    store.set(key, entry);

    // Periodic cleanup to avoid unbounded memory growth
    if (store.size > 10_000) {
        for (const [k, v] of store) {
            if (v.timestamps.every((t) => now - t >= windowMs)) {
                store.delete(k);
            }
        }
    }

    return false;
}

/**
 * Extracts the best available IP from a Request.
 * Only trusts x-forwarded-for when explicitly enabled (e.g. behind a known proxy).
 * Default: uses x-real-ip only, falls back to "unknown".
 */
export function extractIp(req: Request, trustForwardedFor = false): string {
    if (trustForwardedFor) {
        const forwarded = req.headers.get('x-forwarded-for');
        if (forwarded) return forwarded.split(',')[0].trim();
    }
    return req.headers.get('x-real-ip') ?? 'unknown';
}
