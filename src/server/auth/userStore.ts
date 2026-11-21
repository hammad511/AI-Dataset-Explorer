import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { sanitizeEmail, sanitizeText } from '../security/sanitize';
import { logSecurityEvent } from '../security/securityLogger';

export interface ResetTokenRecord {
    tokenHash: string;
    expiresAt: number;
    used: boolean;
    createdAt: number;
}

export interface StoredUser {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
    sessionVersion: number;
    passwordChangedAt: number;
    createdAt: number;
    resetTokens?: ResetTokenRecord[];
    provider?: string;
}

export type SafeUser = Omit<StoredUser, 'passwordHash' | 'resetTokens'>;

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

// Serialize writes in-process to avoid concurrent file rename collisions on Windows
let writeQueue: Promise<void> = Promise.resolve();

export function getAuthSecret(): string {
    return process.env.NEXTAUTH_SECRET || 'AI_Dataset_Explorer_Secret_12345';
}

/**
 * Returns safe user object with sensitive hashes removed.
 */
export function toSafeUser(user: StoredUser): SafeUser {
    const { passwordHash, resetTokens, ...safe } = user;
    return safe;
}

/**
 * Reads all stored users securely.
 */
export async function getAllUsers(): Promise<StoredUser[]> {
    try {
        const raw = await fs.readFile(USERS_FILE, 'utf-8');
        const users: StoredUser[] = JSON.parse(raw || '[]');
        return users.map((u) => ({
            ...u,
            role: u.role || 'USER',
            sessionVersion: u.sessionVersion || 1,
            passwordChangedAt: u.passwordChangedAt || u.createdAt || Date.now(),
            createdAt: u.createdAt || Date.now(),
            resetTokens: u.resetTokens || [],
            provider: u.provider || (u.passwordHash ? 'credentials' : 'oauth'),
        }));
    } catch {
        return [];
    }
}

/**
 * Atomic write to user store with temporary file, Windows EPERM fallback, and serialized write queue.
 */
async function saveAllUsers(users: StoredUser[]): Promise<void> {
    const nextWrite = writeQueue.then(async () => {
        const dir = path.dirname(USERS_FILE);
        await fs.mkdir(dir, { recursive: true });
        const tempFile = `${USERS_FILE}.${crypto.randomUUID()}.tmp`;
        const data = JSON.stringify(users, null, 2);
        await fs.writeFile(tempFile, data, 'utf-8');
        try {
            await fs.rename(tempFile, USERS_FILE);
        } catch (err: any) {
            if (err?.code === 'EPERM' || err?.code === 'EACCES' || err?.code === 'EBUSY') {
                await fs.copyFile(tempFile, USERS_FILE);
                await fs.unlink(tempFile).catch(() => {});
            } else {
                await fs.unlink(tempFile).catch(() => {});
                throw err;
            }
        }
    });
    writeQueue = nextWrite.catch(() => {});
    await nextWrite;
}

/**
 * Finds a user by email.
 */
export async function findUserByEmail(email: string): Promise<StoredUser | null> {
    const cleanEmail = sanitizeEmail(email);
    if (!cleanEmail) return null;
    const users = await getAllUsers();
    return users.find((u) => u.email.toLowerCase() === cleanEmail.toLowerCase()) || null;
}

/**
 * Finds a user by ID.
 */
export async function findUserById(id: string): Promise<StoredUser | null> {
    if (!id || typeof id !== 'string') return null;
    const users = await getAllUsers();
    return users.find((u) => u.id === id) || null;
}

/**
 * Creates a new user with bcrypt-hashed password (cost 12) and initialized session version.
 */
export async function createUser(data: {
    name: string;
    email: string;
    password: string;
    role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
}): Promise<SafeUser> {
    const email = sanitizeEmail(data.email);
    const name = sanitizeText(data.name, 80) || email.split('@')[0];

    if (!email || !data.password || data.password.length < 8) {
        throw new Error('Invalid user input.');
    }

    const users = await getAllUsers();
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('User already exists.');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const now = Date.now();

    const newUser: StoredUser = {
        id: crypto.randomUUID(),
        name,
        email,
        passwordHash,
        role: data.role || 'USER',
        sessionVersion: 1,
        passwordChangedAt: now,
        createdAt: now,
        resetTokens: [],
    };

    users.push(newUser);
    await saveAllUsers(users);

    logSecurityEvent({
        eventType: 'AUTH_REGISTER',
        severity: 'INFO',
        userId: newUser.id,
        email: newUser.email,
    });

    return toSafeUser(newUser);
}

/**
 * Updates a user's password and increments sessionVersion, invalidating all existing active sessions.
 */
export async function updateUserPassword(userId: string, newPassword: string): Promise<SafeUser> {
    if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
        throw new Error('Password must be between 8 and 128 characters long.');
    }

    const users = await getAllUsers();
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
        throw new Error('User not found.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = Date.now();

    users[userIndex].passwordHash = passwordHash;
    users[userIndex].sessionVersion = (users[userIndex].sessionVersion || 1) + 1;
    users[userIndex].passwordChangedAt = now;
    // Invalidate all pending reset tokens
    users[userIndex].resetTokens = [];

    await saveAllUsers(users);

    logSecurityEvent({
        eventType: 'AUTH_PASSWORD_CHANGE',
        severity: 'INFO',
        userId,
        email: users[userIndex].email,
        details: { newSessionVersion: users[userIndex].sessionVersion },
    });

    return toSafeUser(users[userIndex]);
}

/**
 * Creates a cryptographically secure, time-limited (15-min) password reset token.
 * Stores only the SHA-256 hash of the token.
 */
export async function createPasswordResetToken(email: string): Promise<string | null> {
    const cleanEmail = sanitizeEmail(email);
    if (!cleanEmail) return null;

    const users = await getAllUsers();
    const userIndex = users.findIndex((u) => u.email.toLowerCase() === cleanEmail.toLowerCase());
    if (userIndex === -1) {
        return null;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1000; // 15 minutes strict expiration

    const resetRecord: ResetTokenRecord = {
        tokenHash,
        expiresAt,
        used: false,
        createdAt: now,
    };

    const currentTokens = users[userIndex].resetTokens || [];
    // Keep only active, unexpired tokens
    users[userIndex].resetTokens = [...currentTokens.filter((t) => !t.used && t.expiresAt > now), resetRecord];

    await saveAllUsers(users);

    logSecurityEvent({
        eventType: 'AUTH_PASSWORD_RESET_REQUEST',
        severity: 'INFO',
        email: cleanEmail,
        userId: users[userIndex].id,
        details: { expiresAt: new Date(expiresAt).toISOString() },
    });

    return rawToken;
}

/**
 * Verifies a reset token and consumes it, updating password and invalidating active sessions.
 */
export async function consumePasswordResetToken(rawToken: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!rawToken || typeof rawToken !== 'string') {
        return { success: false, message: 'Invalid or missing reset token.' };
    }

    if (!newPassword || newPassword.length < 8) {
        return { success: false, message: 'New password must be at least 8 characters.' };
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const now = Date.now();

    const users = await getAllUsers();
    let targetUserIndex = -1;
    let targetTokenIndex = -1;

    for (let i = 0; i < users.length; i++) {
        const tokens = users[i].resetTokens || [];
        const tokenIdx = tokens.findIndex((t) => t.tokenHash === tokenHash);
        if (tokenIdx !== -1) {
            targetUserIndex = i;
            targetTokenIndex = tokenIdx;
            break;
        }
    }

    if (targetUserIndex === -1 || targetTokenIndex === -1) {
        return { success: false, message: 'Invalid or expired password reset link.' };
    }

    const user = users[targetUserIndex];
    const tokenRecord = user.resetTokens![targetTokenIndex];

    if (tokenRecord.used) {
        logSecurityEvent({
            eventType: 'AUTH_PASSWORD_RESET_SUCCESS',
            severity: 'WARN',
            userId: user.id,
            email: user.email,
            details: { reason: 'Attempted reuse of consumed token' },
        });
        return { success: false, message: 'This reset link has already been used.' };
    }

    if (now > tokenRecord.expiresAt) {
        return { success: false, message: 'This password reset link has expired. Please request a new one.' };
    }

    // Mark token as used
    tokenRecord.used = true;

    // Hash new password and update user session version
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.sessionVersion = (user.sessionVersion || 1) + 1;
    user.passwordChangedAt = now;
    user.resetTokens = user.resetTokens!.filter((t) => !t.used && t.expiresAt > now);

    await saveAllUsers(users);

    logSecurityEvent({
        eventType: 'AUTH_PASSWORD_RESET_SUCCESS',
        severity: 'INFO',
        userId: user.id,
        email: user.email,
        details: { sessionReset: true },
    });

    return { success: true, message: 'Password has been successfully updated. All active sessions have been reset.' };
}

/**
 * Finds an existing user by email or creates a new one for OAuth (e.g. Google) sign-in.
 */
export async function findOrCreateOAuthUser(data: {
    name?: string | null;
    email?: string | null;
    provider?: string;
}): Promise<StoredUser> {
    const rawEmail = data.email || '';
    const cleanEmail = sanitizeEmail(rawEmail);
    if (!cleanEmail) {
        throw new Error('Valid email required for OAuth authentication.');
    }

    const users = await getAllUsers();
    let existingUser = users.find((u) => u.email.toLowerCase() === cleanEmail.toLowerCase());

    if (existingUser) {
        let modified = false;
        if ((!existingUser.name || existingUser.name === cleanEmail.split('@')[0]) && data.name) {
            existingUser.name = sanitizeText(data.name, 80) || existingUser.name;
            modified = true;
        }
        if (!existingUser.provider && data.provider) {
            existingUser.provider = data.provider;
            modified = true;
        }
        if (modified) {
            await saveAllUsers(users);
        }
        return existingUser;
    }

    const name = sanitizeText(data.name || '', 80) || cleanEmail.split('@')[0];
    const now = Date.now();

    const newUser: StoredUser = {
        id: crypto.randomUUID(),
        name,
        email: cleanEmail,
        passwordHash: '',
        role: 'USER',
        sessionVersion: 1,
        passwordChangedAt: now,
        createdAt: now,
        resetTokens: [],
        provider: data.provider || 'google',
    };

    users.push(newUser);
    await saveAllUsers(users);

    logSecurityEvent({
        eventType: 'AUTH_REGISTER',
        severity: 'INFO',
        userId: newUser.id,
        email: newUser.email,
        details: { provider: data.provider || 'google' },
    });

    return newUser;
}

