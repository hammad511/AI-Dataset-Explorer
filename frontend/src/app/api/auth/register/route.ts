import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, email, password } = body;
        if (!email || !password) {
            return NextResponse.json({ message: 'Missing email or password' }, { status: 400 });
        }

        const usersPath = path.join(process.cwd(), 'src', 'app', 'api', 'auth', 'users.json');
        let usersRaw = '[]';
        try {
            usersRaw = await fs.readFile(usersPath, 'utf-8');
        } catch (err) {
            // will create file
        }

        const users = JSON.parse(usersRaw || '[]');
        if (users.find((u: any) => u.email === email)) {
            return NextResponse.json({ message: 'User already exists' }, { status: 409 });
        }

        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
        const newUser = { id: Date.now().toString(), name: name || email.split('@')[0], email, passwordHash };
        users.push(newUser);
        await fs.writeFile(usersPath, JSON.stringify(users, null, 2), 'utf-8');

        return NextResponse.json({ ok: true });
    } catch (err) {
        return NextResponse.json({ message: 'Registration failed' }, { status: 500 });
    }
}
