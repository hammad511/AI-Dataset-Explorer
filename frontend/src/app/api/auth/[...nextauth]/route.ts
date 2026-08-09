import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { promises as fs } from 'fs';
import path from 'path';

const handler = NextAuth({
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;
                const usersPath = path.join(process.cwd(), 'src', 'app', 'api', 'auth', 'users.json');
                try {
                    const raw = await fs.readFile(usersPath, 'utf-8');
                    const users = JSON.parse(raw || '[]');
                    const pwHash = require('crypto').createHash('sha256').update(credentials.password).digest('hex');
                    const user = users.find((u: any) => u.email === credentials.email && u.passwordHash === pwHash);
                    if (user) {
                        return { id: user.id, name: user.name, email: user.email };
                    }
                } catch (err) {
                    // ignore and fallthrough to allow other providers
                }
                return null;
            }
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
            return baseUrl + "/explore"; // Navigate to Explorer after authentication
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
