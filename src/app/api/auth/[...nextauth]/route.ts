import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from 'bcryptjs';
import { findUserByEmail, findUserById, findOrCreateOAuthUser, getAuthSecret } from '@/server/auth/userStore';
import { isAccountLocked, recordFailedAttempt, resetFailedAttempts } from '@/server/auth/accountLockout';
import { logSecurityEvent } from '@/server/security/securityLogger';
import { sanitizeEmail } from '@/server/security/sanitize';

export const dynamic = 'force-dynamic';

const useSecureCookies = Boolean(process.env.NEXTAUTH_URL?.startsWith('https://'));
const cookiePrefix = useSecureCookies ? '__Secure-' : '';

const handler = NextAuth({
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                const email = sanitizeEmail(credentials.email);
                if (!email) return null;

                // 1. Account Lockout Check (Item 17)
                const lockout = isAccountLocked(email);
                if (lockout.locked) {
                    logSecurityEvent({
                        eventType: 'AUTH_ACCOUNT_LOCKED',
                        severity: 'WARN',
                        email,
                        details: { remainingMs: lockout.remainingMs },
                    });
                    throw new Error(`Account is temporarily locked. Please try again in ${Math.ceil(lockout.remainingMs / 60000)} minutes.`);
                }

                const user = await findUserByEmail(email);

                // Anti-enumeration: Perform dummy bcrypt compare if user not found to resist timing side-channels
                if (!user) {
                    await bcrypt.compare(credentials.password, '$2b$12$e8Y6l1k9bJqN0lW3r.Z7eu1uL7y0kP1Q7pM9j9nQ2x3v8W9u2t1O2');
                    recordFailedAttempt(email);
                    logSecurityEvent({
                        eventType: 'AUTH_LOGIN_FAILED',
                        severity: 'WARN',
                        email,
                        details: { reason: 'User not found' },
                    });
                    return null;
                }

                // Handle accounts created via Google OAuth that do not have a password set yet
                if (!user.passwordHash) {
                    logSecurityEvent({
                        eventType: 'AUTH_LOGIN_FAILED',
                        severity: 'INFO',
                        email,
                        userId: user.id,
                        details: { reason: 'OAuth account attempted password login without passwordHash' },
                    });
                    throw new Error('This account uses Google Sign-In. Please continue with Google or use Forgot Password to set a password.');
                }

                const passwordValid = await bcrypt.compare(credentials.password, user.passwordHash);
                if (!passwordValid) {
                    const failStatus = recordFailedAttempt(email);
                    logSecurityEvent({
                        eventType: 'AUTH_LOGIN_FAILED',
                        severity: 'WARN',
                        email,
                        userId: user.id,
                        details: {
                            reason: 'Password mismatch',
                            attemptsLeft: failStatus.attemptsLeft,
                            locked: failStatus.locked,
                        },
                    });

                    if (failStatus.locked) {
                        throw new Error('Too many failed attempts. Account has been locked for 15 minutes.');
                    }

                    return null;
                }

                // Successful login: reset failed counters
                resetFailedAttempts(email);

                logSecurityEvent({
                    eventType: 'AUTH_LOGIN_SUCCESS',
                    severity: 'INFO',
                    email: user.email,
                    userId: user.id,
                });

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    sessionVersion: user.sessionVersion || 1,
                };
            },
        }),
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
            ? [
                  GoogleProvider({
                      clientId: process.env.GOOGLE_CLIENT_ID.trim(),
                      clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
                      httpOptions: {
                          timeout: 15000,
                      },
                  }),
              ]
            : []),
    ],
    pages: {
        signIn: "/login",
        error: "/login",
    },
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    cookies: {
        sessionToken: {
            name: `${cookiePrefix}next-auth.session-token`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: useSecureCookies,
            },
        },
        callbackUrl: {
            name: `${cookiePrefix}next-auth.callback-url`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: useSecureCookies,
            },
        },
        csrfToken: {
            name: `${useSecureCookies ? '__Host-' : ''}next-auth.csrf-token`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: useSecureCookies,
            },
        },
    },
    callbacks: {
        async signIn({ user, account }) {
            if (account?.provider === 'google') {
                if (!user?.email) {
                    return false;
                }
                // Pre-create or link user in local user store
                await findOrCreateOAuthUser({
                    name: user.name,
                    email: user.email,
                    provider: 'google',
                });
            }
            return true;
        },
        async jwt({ token, user, account }) {
            // Generate or preserve unique instance identifier for this device/session
            if (!token.instanceId) {
                token.instanceId = `inst_${Math.random().toString(36).substring(2, 10)}`;
            }

            // Initial sign in
            if (user) {
                // If it's an OAuth sign-in (e.g. Google), link to the persistent user in userStore
                if (account?.provider === 'google' || (!user.id && user.email)) {
                    const dbUser = await findOrCreateOAuthUser({
                        name: user.name,
                        email: user.email,
                        provider: account?.provider || 'google',
                    });
                    token.id = dbUser.id;
                    token.name = dbUser.name;
                    token.email = dbUser.email;
                    token.role = dbUser.role || 'USER';
                    token.sessionVersion = dbUser.sessionVersion || 1;
                    return token;
                }

                // If credentials provider
                token.id = user.id;
                token.name = user.name;
                token.email = user.email;
                token.role = (user as any).role || 'USER';
                token.sessionVersion = (user as any).sessionVersion || 1;
                return token;
            }

            // Subsequent requests: Verify session validity against stored user version (Item 3)
            if (token && token.id) {
                let currentUser = await findUserById(token.id as string);

                // Fallback: If not found by ID (e.g. initial Google ID in cookie or edge case), find/create by email
                if (!currentUser && token.email) {
                    currentUser = await findUserByEmail(token.email as string);
                    if (currentUser) {
                        token.id = currentUser.id;
                        token.role = currentUser.role || 'USER';
                        token.sessionVersion = currentUser.sessionVersion || 1;
                    }
                }

                if (!currentUser) {
                    // Clear user data from token instead of returning null to prevent NextAuth serialization crash
                    delete token.id;
                    delete token.email;
                    delete token.name;
                    delete token.role;
                    delete token.sessionVersion;
                    return token;
                }
                const currentVersion = currentUser.sessionVersion || 1;
                const tokenVersion = (token.sessionVersion as number) || 1;

                if (tokenVersion < currentVersion) {
                    logSecurityEvent({
                        eventType: 'AUTH_SESSION_INVALIDATED',
                        severity: 'INFO',
                        userId: currentUser.id,
                        email: currentUser.email,
                        details: { reason: 'Password changed - session version mismatch' },
                    });
                    delete token.id;
                    delete token.email;
                    delete token.name;
                    delete token.role;
                    delete token.sessionVersion;
                    return token;
                }
            }

            return token || {};
        },
        async session({ session, token }) {
            if (!token || !token.id) {
                // Return empty session structure instead of null so NextAuth serialization never fails
                return {
                    ...session,
                    user: undefined,
                    expires: session?.expires || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                };
            }
            if (session && session.user) {
                (session.user as any).id = token.id as string;
                (session.user as any).role = (token.role as string) || 'USER';
                (session.user as any).instanceId = token.instanceId as string;
                if (token.name) session.user.name = token.name as string;
                if (token.email) session.user.email = token.email as string;
            }
            return session;
        },
        async redirect({ url, baseUrl }) {
            // Allows relative callback URLs
            if (url.startsWith("/")) return `${baseUrl}${url}`;
            // Allows callback URLs on the same origin
            try {
                if (new URL(url).origin === baseUrl) return url;
            } catch {
                // Ignore invalid URL
            }
            return `${baseUrl}/explore`;
        },
    },
    secret: getAuthSecret(),
});

export { handler as GET, handler as POST };
