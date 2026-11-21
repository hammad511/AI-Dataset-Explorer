import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isRateLimited } from '@/server/security/rate-limit';
import { logSecurityEvent } from '@/server/security/securityLogger';

// ── Allowed CORS Origins Allowlist (Item 14) ──────────────────────────────────
const DEFAULT_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://aiexplorer.dev',
];

function getAllowedOrigins(): string[] {
    const envOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
        : [];
    return [...DEFAULT_ALLOWED_ORIGINS, ...envOrigins];
}

// ── Request Size Limits in Bytes (Item 11) ──────────────────────────────────
const MAX_JSON_PAYLOAD_BYTES = 100 * 1024; // 100 KB for standard JSON APIs
const MAX_UPLOAD_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB for uploads

// ── Sensitive Path & File Signatures (Item 15) ──────────────────────────────
const BLOCKED_PATH_PATTERNS = [
    /\.\./, // Directory traversal
    /\/\.env/i, // .env files
    /\/\.git/i, // .git folder
    /\/\.svn/i,
    /\/users\.json/i, // Credential store file
    /\/package(?:-lock)?\.json/i,
    /\/\.DS_Store/i,
    /\.(?:bak|swp|old|orig|tmp)$/i,
];

// Routes accessible without authentication
const PUBLIC_PATHS = [
    '/',
    '/login',
    '/signup',
    '/api/health',
    '/api/csrf',
    '/api/webhooks',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
];

/**
 * Attaches standard security headers to outgoing responses (Item 1: HSTS, etc.)
 */
function applySecurityHeaders(res: NextResponse): NextResponse {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('X-Frame-Options', 'DENY');
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return res;
}

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;
    const origin = req.headers.get('origin');
    const clientIp = req.headers.get('x-real-ip') || 'unknown';

    // 1. Directory Listing & Sensitive File Access Blocking (Item 15)
    for (const pattern of BLOCKED_PATH_PATTERNS) {
        if (pattern.test(pathname)) {
            logSecurityEvent({
                eventType: 'SENSITIVE_FILE_ACCESS_BLOCKED',
                severity: 'ALERT',
                ip: clientIp,
                endpoint: pathname,
                details: { pattern: pattern.toString() },
            });
            return applySecurityHeaders(
                new NextResponse(JSON.stringify({ error: 'Access Denied' }), {
                    status: 403,
                    headers: { 'Content-Type': 'application/json' },
                })
            );
        }
    }

    // 2. Request Size Limits (Item 11: Limit request size)
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    const isUploadRoute = pathname.startsWith('/api/upload');
    const maxAllowedSize = isUploadRoute ? MAX_UPLOAD_PAYLOAD_BYTES : MAX_JSON_PAYLOAD_BYTES;

    if (contentLength > maxAllowedSize) {
        logSecurityEvent({
            eventType: 'PAYLOAD_TOO_LARGE',
            severity: 'WARN',
            ip: clientIp,
            endpoint: pathname,
            details: { contentLength, maxAllowedSize },
        });
        return applySecurityHeaders(
            new NextResponse(
                JSON.stringify({
                    error: `Payload too large. Maximum allowed size is ${maxAllowedSize / 1024}KB.`,
                }),
                {
                    status: 413,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        );
    }

    // 3. CORS Lockdown (Item 14: Lock down CORS)
    const allowedOrigins = getAllowedOrigins();
    const isAllowedOrigin = origin && allowedOrigins.includes(origin);

    // Handle Preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
        const preflightHeaders: Record<string, string> = {
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
            'Access-Control-Max-Age': '86400',
        };

        if (isAllowedOrigin && origin) {
            preflightHeaders['Access-Control-Allow-Origin'] = origin;
            preflightHeaders['Access-Control-Allow-Credentials'] = 'true';
        }

        const preflightResponse = new NextResponse(null, { status: 204, headers: preflightHeaders });
        return applySecurityHeaders(preflightResponse);
    }

    // 4. Rate Limiting for Credentials Sign-in Endpoint
    if (pathname === '/api/auth/callback/credentials' && req.method === 'POST') {
        if (isRateLimited('login-callback', clientIp, 25, 15 * 60 * 1000)) {
            logSecurityEvent({
                eventType: 'RATE_LIMIT_EXCEEDED',
                severity: 'WARN',
                ip: clientIp,
                endpoint: pathname,
            });
            return applySecurityHeaders(
                new NextResponse(
                    JSON.stringify({ error: 'Too many login attempts. Please wait 15 minutes.' }),
                    { status: 429, headers: { 'Content-Type': 'application/json' } }
                )
            );
        }
    }

    // Prepare response
    let response = NextResponse.next();

    // Attach CORS headers if origin is in whitelist
    if (isAllowedOrigin && origin) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    // Apply HSTS and core security headers (Item 1)
    response = applySecurityHeaders(response);

    // 5. Bypass authentication for internal next routes, static assets, and allowed API routes
    if (
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/api/assistant') ||
        pathname.startsWith('/api/search') ||
        pathname.startsWith('/api/health') ||
        pathname.startsWith('/api/csrf') ||
        pathname.startsWith('/api/webhooks') ||
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon') ||
        pathname.includes('.')
    ) {
        return response;
    }

    // Allow whitelisted public pages
    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
    if (isPublic) {
        return response;
    }

    // 6. Require Authentication for Protected Routes
    const secret = process.env.NEXTAUTH_SECRET || 'AI_Dataset_Explorer_Secret_12345';
    const token = await getToken({ req, secret });
    const isAuthenticatedToken = Boolean(token && (token.id || token.email));

    if (!isAuthenticatedToken || !token) {
        // If API route: return 401 Unauthorized instead of redirect
        if (pathname.startsWith('/api/')) {
            const apiRes = new NextResponse(
                JSON.stringify({ error: 'Authentication required.' }),
                { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } }
            );
            return applySecurityHeaders(apiRes);
        }

        // If unauthenticated: preserve requested safe path while stripping foreign instance params
        const cleanSearchParams = new URLSearchParams(req.nextUrl.searchParams);
        cleanSearchParams.delete('inst');
        const qs = cleanSearchParams.toString();
        const requestedTarget = `${pathname}${qs ? `?${qs}` : ''}`;
        const safeTarget =
            requestedTarget.startsWith('/') && !requestedTarget.startsWith('//') && !requestedTarget.includes('\\')
                ? requestedTarget
                : '/explore';

        const loginUrl = new URL('/login', req.url);
        loginUrl.searchParams.set('redirect_to', safeTarget);
        loginUrl.searchParams.set('callbackUrl', safeTarget);

        const redirectResponse = NextResponse.redirect(loginUrl);
        // Force browser and reverse proxies to never cache the unauthenticated redirect
        redirectResponse.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
        return applySecurityHeaders(redirectResponse);
    }

    // 7. Device / Session Instance URL Binding
    // Every logged-in device gets a unique instance ID in the URL.
    // If a user copies this URL to another device, that device will be rejected and bound to its own instance.
    const instanceId = (token as any).instanceId as string | undefined;
    if (instanceId && pathname === '/explore') {
        const currentInst = req.nextUrl.searchParams.get('inst');
        if (!currentInst || currentInst !== instanceId) {
            const boundUrl = new URL(req.url);
            boundUrl.searchParams.set('inst', instanceId);
            const redirectResponse = NextResponse.redirect(boundUrl);
            redirectResponse.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
            return applySecurityHeaders(redirectResponse);
        }
    }

    // Attach user context headers to downstream request
    const requestHeaders = new Headers(req.headers);
    if (token.id) requestHeaders.set('x-user-id', String(token.id));
    if (token.email) requestHeaders.set('x-user-email', String(token.email));
    if ((token as any).role) requestHeaders.set('x-user-role', String((token as any).role));

    response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });
    if (isAllowedOrigin && origin) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    response = applySecurityHeaders(response);

    // Ensure protected responses are private and not cached by shared proxies
    response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    return response;
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
