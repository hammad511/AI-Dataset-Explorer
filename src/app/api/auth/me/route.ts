import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { findUserById, findUserByEmail, getAuthSecret } from '@/server/auth/userStore';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me
 * 
 * Verifies the incoming browser-sandboxed HttpOnly session cookie,
 * checks validity against the server-side user store, and returns
 * the authenticated user context.
 */
export async function GET(req: NextRequest) {
    const headers = new Headers();
    headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');

    try {
        const token = await getToken({ req, secret: getAuthSecret() });

        if (!token || (!token.id && !token.email)) {
            return NextResponse.json(
                { authenticated: false, error: 'Unauthorized. No active session found.' },
                { status: 401, headers }
            );
        }

        // Verify user against persistent store
        let user = token.id ? await findUserById(token.id as string) : null;
        if (!user && token.email) {
            user = await findUserByEmail(token.email as string);
        }

        if (!user) {
            return NextResponse.json(
                { authenticated: false, error: 'User record no longer exists.' },
                { status: 401, headers }
            );
        }

        // Check if session was revoked / invalidated by a password update
        const tokenVersion = (token.sessionVersion as number) || 1;
        const currentVersion = user.sessionVersion || 1;
        if (tokenVersion < currentVersion) {
            return NextResponse.json(
                { authenticated: false, error: 'Session expired due to security updates.' },
                { status: 401, headers }
            );
        }

        return NextResponse.json(
            {
                authenticated: true,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role || 'USER',
                },
            },
            { status: 200, headers }
        );
    } catch (error) {
        console.error('[API_AUTH_ME_ERROR]', error);
        return NextResponse.json(
            { authenticated: false, error: 'Failed to verify session.' },
            { status: 500, headers }
        );
    }
}
