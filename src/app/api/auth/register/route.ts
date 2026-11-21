import { NextResponse } from 'next/server';
import { isRateLimited, extractIp } from '@/server/security/rate-limit';
import { createUser, findUserByEmail } from '@/server/auth/userStore';
import { sanitizeEmail, sanitizeText } from '@/server/security/sanitize';
import { logSecurityEvent } from '@/server/security/securityLogger';

export async function POST(req: Request) {
    const ip = extractIp(req);

    // Rate limit: max 10 registrations per IP per hour
    if (isRateLimited('register', ip, 10, 60 * 60 * 1000)) {
        logSecurityEvent({
            eventType: 'RATE_LIMIT_EXCEEDED',
            severity: 'WARN',
            ip,
            endpoint: '/api/auth/register',
        });
        return NextResponse.json(
            {
                success: false,
                message: 'Too many registration attempts. Please try again later.',
                error: 'Too many registration attempts. Please try again later.',
            },
            { status: 429 }
        );
    }

    try {
        let body: any = {};
        try {
            body = await req.json();
        } catch {
            return NextResponse.json(
                { success: false, message: 'Invalid JSON request format.', error: 'Invalid JSON request format.' },
                { status: 400 }
            );
        }

        const rawEmail = body.email;
        const rawPassword = body.password;
        const rawName = body.name;

        const email = sanitizeEmail(rawEmail);
        const name = sanitizeText(rawName, 60);

        if (!name || name.trim().length < 2) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Please enter your full name (at least 2 characters).',
                    error: 'Please enter your full name (at least 2 characters).',
                },
                { status: 400 }
            );
        }

        if (!email || !rawPassword) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'A valid email and password are required.',
                    error: 'A valid email and password are required.',
                },
                { status: 400 }
            );
        }

        if (typeof rawPassword !== 'string' || rawPassword.length < 8) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Password must be at least 8 characters long.',
                    error: 'Password must be at least 8 characters long.',
                },
                { status: 400 }
            );
        }

        if (rawPassword.length > 128) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Password cannot exceed 128 characters.',
                    error: 'Password cannot exceed 128 characters.',
                },
                { status: 400 }
            );
        }

        const existing = await findUserByEmail(email);
        if (existing) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'An account with that email already exists. Please sign in instead.',
                    error: 'An account with that email already exists. Please sign in instead.',
                },
                { status: 409 }
            );
        }

        const newUser = await createUser({
            name,
            email,
            password: rawPassword,
            role: 'USER',
        });

        return NextResponse.json({
            ok: true,
            success: true,
            user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
        });
    } catch (e: any) {
        const msg = e?.message || 'Registration failed.';
        return NextResponse.json({ success: false, message: msg, error: msg }, { status: 500 });
    }
}
