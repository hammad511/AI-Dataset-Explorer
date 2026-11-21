import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import bcrypt from 'bcryptjs';
import { findUserByEmail, getAuthSecret } from '@/server/auth/userStore';
import { isAccountLocked, recordFailedAttempt, resetFailedAttempts } from '@/server/auth/accountLockout';
import { extractIp, isRateLimited, resetRateLimit } from '@/server/security/rate-limit';
import { logSecurityEvent } from '@/server/security/securityLogger';
import { sanitizeEmail } from '@/server/security/sanitize';

export const dynamic = 'force-dynamic';

const NEXTAUTH_SECRET = getAuthSecret();
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/**
 * POST /api/auth/login
 * 
 * Production authentication endpoint:
 * - Rate-limited & locked against brute-force attacks
 * - Verifies credentials using bcrypt
 * - Sets browser-sandboxed HttpOnly session cookie
 * - Returns user profile only (tokens NEVER exposed in JSON or URLs)
 */
export async function POST(req: NextRequest) {
    const ip = extractIp(req);
    const headers = new Headers();
    headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');

    // 1. IP-level Rate Limiting
    if (isRateLimited('login', ip, 15, 15 * 60 * 1000)) {
        logSecurityEvent({
            eventType: 'RATE_LIMIT_EXCEEDED',
            severity: 'WARN',
            ip,
            endpoint: '/api/auth/login',
        });
        return NextResponse.json(
            { success: false, error: 'Too many login attempts. Please wait 15 minutes.' },
            { status: 429, headers }
        );
    }

    try {
        const body = await req.json();
        const { email: rawEmail, password } = body;

        if (!rawEmail || !password) {
            return NextResponse.json(
                { success: false, error: 'Email and password are required.' },
                { status: 400, headers }
            );
        }

        const email = sanitizeEmail(rawEmail);
        if (!email) {
            return NextResponse.json(
                { success: false, error: 'Invalid email address format.' },
                { status: 400, headers }
            );
        }

        // 2. Account Lockout Check
        const lockout = isAccountLocked(email);
        if (lockout.locked) {
            logSecurityEvent({
                eventType: 'AUTH_ACCOUNT_LOCKED',
                severity: 'WARN',
                email,
                details: { remainingMs: lockout.remainingMs },
            });
            return NextResponse.json(
                {
                    success: false,
                    error: `Account temporarily locked due to failed attempts. Try again in ${Math.ceil(lockout.remainingMs / 60000)} minutes.`,
                },
                { status: 429, headers }
            );
        }

        // 3. Find User
        const user = await findUserByEmail(email);

        // Anti-enumeration timing mitigation
        if (!user) {
            await bcrypt.compare(password, '$2b$12$e8Y6l1k9bJqN0lW3r.Z7eu1uL7y0kP1Q7pM9j9nQ2x3v8W9u2t1O2');
            recordFailedAttempt(email);
            logSecurityEvent({
                eventType: 'AUTH_LOGIN_FAILED',
                severity: 'WARN',
                email,
                ip,
                details: { reason: 'User not found' },
            });
            return NextResponse.json(
                { success: false, error: 'Invalid email or password.' },
                { status: 401, headers }
            );
        }

        // 4. Verify Password (handle OAuth-only accounts without locking them out)
        if (!user.passwordHash) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'This account uses Google Sign-In. Please continue with Google or use Forgot Password to set a password.',
                },
                { status: 401, headers }
            );
        }

        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid) {
            const failStatus = recordFailedAttempt(email);
            logSecurityEvent({
                eventType: 'AUTH_LOGIN_FAILED',
                severity: 'WARN',
                email,
                userId: user.id,
                ip,
                details: {
                    reason: 'Password mismatch',
                    attemptsLeft: failStatus.attemptsLeft,
                    locked: failStatus.locked,
                },
            });

            const errorMsg = failStatus.locked
                ? 'Too many failed attempts. Account has been locked for 15 minutes.'
                : 'Invalid email or password.';

            return NextResponse.json(
                { success: false, error: errorMsg },
                { status: 401, headers }
            );
        }

        // 5. Successful Authentication: Reset lockout and IP rate-limit counters
        resetFailedAttempts(email);
        resetRateLimit('login', ip);
        resetRateLimit('login-callback', ip);

        logSecurityEvent({
            eventType: 'AUTH_LOGIN_SUCCESS',
            severity: 'INFO',
            email: user.email,
            userId: user.id,
            ip,
        });

        // 6. Sign Session JWT Token
        const instanceId = `inst_${Math.random().toString(36).substring(2, 10)}`;
        const sessionToken = await encode({
            token: {
                id: user.id,
                sub: user.id,
                name: user.name,
                email: user.email,
                role: user.role || 'USER',
                sessionVersion: user.sessionVersion || 1,
                instanceId,
            },
            secret: NEXTAUTH_SECRET,
            maxAge: SESSION_MAX_AGE,
        });

        // 7. Prepare response containing user profile data ONLY
        const response = NextResponse.json(
            {
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role || 'USER',
                },
            },
            { status: 200, headers }
        );

        // 8. Set HttpOnly Cookie (Browser sandboxed, immune to XSS and URL copying)
        const useSecureCookies = Boolean(process.env.NEXTAUTH_URL?.startsWith('https://'));
        const cookieName = (useSecureCookies ? '__Secure-' : '') + 'next-auth.session-token';

        response.cookies.set({
            name: cookieName,
            value: sessionToken,
            httpOnly: true,
            secure: useSecureCookies,
            sameSite: 'lax',
            path: '/',
            maxAge: SESSION_MAX_AGE,
        });

        return response;
    } catch (error) {
        console.error('[API_AUTH_LOGIN_ERROR]', error);
        return NextResponse.json(
            { success: false, error: 'Authentication request failed.' },
            { status: 500, headers }
        );
    }
}
