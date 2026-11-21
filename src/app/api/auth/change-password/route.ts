import { NextRequest, NextResponse } from 'next/server';
import { getToken, encode } from 'next-auth/jwt';
import bcrypt from 'bcryptjs';
import { findUserById, findUserByEmail, updateUserPassword, getAuthSecret } from '@/server/auth/userStore';
import { validateCsrf } from '@/server/security/csrf';
import { logSecurityEvent } from '@/server/security/securityLogger';
import { extractIp } from '@/server/security/rate-limit';

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export async function POST(req: NextRequest) {
    const ip = extractIp(req);

    // 1. CSRF validation
    const csrfCheck = validateCsrf(req);
    if (!csrfCheck.valid) {
        logSecurityEvent({
            eventType: 'CSRF_VIOLATION',
            severity: 'WARN',
            ip,
            endpoint: '/api/auth/change-password',
            details: { reason: csrfCheck.reason },
        });
        return NextResponse.json({ success: false, error: 'CSRF validation failed.' }, { status: 403 });
    }

    // 2. Authentication check
    const secret = getAuthSecret();
    const token = await getToken({ req, secret });
    if (!token || (!token.id && !token.email)) {
        return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { currentPassword, newPassword } = body;

        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
            return NextResponse.json({ success: false, error: 'New password must be at least 8 characters long.' }, { status: 400 });
        }

        if (newPassword.length > 128) {
            return NextResponse.json({ success: false, error: 'New password cannot exceed 128 characters.' }, { status: 400 });
        }

        let user = token.id ? await findUserById(token.id as string) : null;
        if (!user && token.email) {
            user = await findUserByEmail(token.email as string);
        }
        if (!user) {
            return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });
        }

        // If user has an existing passwordHash, require and verify currentPassword
        if (user.passwordHash) {
            if (!currentPassword) {
                return NextResponse.json({ success: false, error: 'Current password is required.' }, { status: 400 });
            }
            const matches = await bcrypt.compare(currentPassword, user.passwordHash);
            if (!matches) {
                logSecurityEvent({
                    eventType: 'AUTH_LOGIN_FAILED',
                    severity: 'WARN',
                    userId: user.id,
                    email: user.email,
                    ip,
                    details: { action: 'change-password-incorrect-current' },
                });
                return NextResponse.json({ success: false, error: 'Current password is incorrect.' }, { status: 400 });
            }
        }

        // Update password and increment session version (Item 3: Invalidate all other active sessions)
        const updatedUser = await updateUserPassword(user.id, newPassword);

        // Re-encode session JWT with the new sessionVersion so the current device stays logged in
        const refreshedSessionToken = await encode({
            token: {
                ...token,
                id: updatedUser.id,
                sub: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role || 'USER',
                sessionVersion: updatedUser.sessionVersion,
            },
            secret,
            maxAge: SESSION_MAX_AGE,
        });

        const response = NextResponse.json({
            success: true,
            message: 'Password updated successfully. All other active sessions have been invalidated.',
        });

        const useSecureCookies = Boolean(process.env.NEXTAUTH_URL?.startsWith('https://'));
        const cookieName = (useSecureCookies ? '__Secure-' : '') + 'next-auth.session-token';
        response.cookies.set({
            name: cookieName,
            value: refreshedSessionToken,
            httpOnly: true,
            secure: useSecureCookies,
            sameSite: 'lax',
            path: '/',
            maxAge: SESSION_MAX_AGE,
        });

        return response;
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message || 'Password update failed.' }, { status: 500 });
    }
}
