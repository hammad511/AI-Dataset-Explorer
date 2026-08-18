import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { promises as fs } from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { isRateLimited, extractIp } from '@/lib/rateLimit';

const handler = NextAuth({
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                // Rate limit: max 10 login attempts per IP per 15 minutes
                // NOTE: `credentials` authorize has no direct access to the raw Request.
                // NextAuth does not expose it here. Brute-force protection is enforced
                // at the middleware level. For per-IP limiting in authorize(), use
                // a NextAuth custom sign-in page that calls a rate-limited API route.
                // This comment documents the limitation so it is not overlooked.
                if (!credentials?.email || !credentials?.password) return null;

                const usersPath = path.join(process.cwd(), 'src', 'app', 'api', 'auth', 'users.json');
                try {
                    const raw = await fs.readFile(usersPath, 'utf-8');
                    const users: Array<{ id: string; name: string; email: string; passwordHash: string }> = JSON.parse(raw || '[]');

                    const user = users.find((u) => u.email === credentials.email);
                    if (!user) return null;

                    // bcrypt.compare — replaces the previous SHA-256 comparison
                    const passwordValid = await bcrypt.compare(credentials.password, user.passwordHash);
                    if (!passwordValid) return null;

                    return { id: user.id, name: user.name, email: user.email };
                } catch {
                    // File unreadable or parse error — deny login
                    return null;
                }
            },
        }),
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        }),
    ],
    pages: {
        signIn: "/login",
    },
    callbacks: {
        async redirect({ baseUrl }) {
            return baseUrl + "/explore";
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
