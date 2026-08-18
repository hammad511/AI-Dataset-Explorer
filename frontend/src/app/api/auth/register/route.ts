import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { isRateLimited, extractIp } from '@/lib/rateLimit';

export async function POST(req: Request) {
    // Rate limit: max 5 registrations per IP per hour
    const ip = extractIp(req);
    if (isRateLimited('register', ip, 5, 60 * 60 * 1000)) {
        return NextResponse.json(
            { message: 'Too many registration attempts. Please try again later.' },
            { status: 429 },
        );
    }

    try {
        const body = await req.json();
        const { name, email, password } = body;

        if (!email || !password) {
            return NextResponse.json({ message: 'Missing email or password' }, { status: 400 });
        }

        // Basic email format check
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json({ message: 'Invalid email address' }, { status: 400 });
        }

        // Enforce minimum password length
        if (password.length < 8) {
            return NextResponse.json({ message: 'Password must be at least 8 characters' }, { status: 400 });
        }

        const usersPath = path.join(process.cwd(), 'src', 'app', 'api', 'auth', 'users.json');
        let usersRaw = '[]';
        try {
            usersRaw = await fs.readFile(usersPath, 'utf-8');
        } catch {
            // file does not exist yet — will be created below
        }

        const users = JSON.parse(usersRaw || '[]');
        if (users.find((u: { email: string }) => u.email === email)) {
            return NextResponse.json({ message: 'User already exists' }, { status: 409 });
        }

        // bcrypt with cost factor 12 — replaces the previous SHA-256 hashing
        const passwordHash = await bcrypt.hash(password, 12);

        // Use crypto.randomUUID() for unpredictable IDs — replaces Date.now()
        const newUser = {
            id: crypto.randomUUID(),
            name: name || email.split('@')[0],
            email,
            passwordHash,
        };
        users.push(newUser);
        await fs.writeFile(usersPath, JSON.stringify(users, null, 2), 'utf-8');

        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ message: 'Registration failed' }, { status: 500 });
    }
}
