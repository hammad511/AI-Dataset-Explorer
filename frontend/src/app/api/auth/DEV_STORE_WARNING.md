# ⚠️ Development-Only User Store

`users.json` is a **flat-file credential store for local development only**.

## Known limitations

| # | Limitation | Risk |
|---|---|---|
| 1 | No write locking | Concurrent registrations can corrupt the file (race condition) |
| 2 | Entire file loaded into memory on every login | Slow and unsafe at scale |
| 3 | Stored inside the `src/` tree | Risk of accidental static serving or bundling |
| 4 | User IDs are UUIDs (fixed) but the file has no integrity checks | Tampered files accepted silently |
| 5 | No email verification | Any email address can be registered |

## Before deploying to production

Replace this store with a real database. Recommended options:

- **Supabase** (hosted PostgreSQL) — enable Row Level Security on the `users` table
- **Prisma + SQLite** (self-hosted, simple) — enable WAL mode for concurrent writes
- **NextAuth database adapter** — any of the above via `@next-auth/prisma-adapter`

## What is safe right now

- Passwords are hashed with **bcrypt (cost 12)** — safe even if the file is read
- The file is in `.gitignore` and not tracked by git
- IDs use `crypto.randomUUID()` — not guessable
