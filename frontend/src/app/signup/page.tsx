"use client";

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useState } from 'react';

async function registerUser(data: { name: string; email: string; password: string }) {
    const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res;
}

export default function SignupPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
        <main className="min-h-screen overflow-hidden bg-[#0c0a09] text-white flex items-center justify-center p-4">
            {/* Background decorations matching the explorer theme */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:28px_28px] opacity-15 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-gradient-to-br from-rose-500/20 via-orange-500/10 to-amber-400/20 blur-3xl h-[600px] w-[600px] -z-10 pointer-events-none" />

            <div className="relative w-full max-w-md z-10">
                <Link href="/" className="flex justify-center items-center gap-3 text-lg font-semibold tracking-tight mb-8 transition-transform hover:scale-105">
                    <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 via-orange-400 to-rose-500 text-slate-950 shadow-[0_0_40px_rgba(249,115,22,0.35)]">
                        ✦
                    </div>
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">AI Dataset Explorer</span>
                </Link>

                <div className="rounded-[32px] border border-white/8 bg-[#1c1917]/85 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.4)] backdrop-blur-xl">
                    <div className="text-center">
                        <h1 className="text-2xl font-semibold tracking-tight text-white mb-2">Create an account</h1>
                        <p className="text-sm text-slate-400">Join thousands of AI builders worldwide</p>
                    </div>

                    <form className="mt-8 space-y-4" onSubmit={async (e) => { e.preventDefault(); setError(null); const res = await registerUser({ name, email, password }); if (res.ok) { await signIn('credentials', { email, password, callbackUrl: '/explore' }); } else { const err = await res.json().catch(() => ({ message: 'Registration failed' })); setError(err.message || 'Registration failed'); } }}>
                        <div>
                            <label className="block text-[13px] font-medium text-slate-300 mb-2" htmlFor="name">
                                Full Name
                            </label>
                            <input
                                id="name"
                                type="text"
                                className="w-full rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-orange-400/50 focus:bg-white/[0.06] transition"
                                placeholder="Ada Lovelace"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-[13px] font-medium text-slate-300 mb-2" htmlFor="email">
                                Email Address
                            </label>
                            <input
                                id="email"
                                type="email"
                                className="w-full rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-orange-400/50 focus:bg-white/[0.06] transition"
                                placeholder="ada@example.com"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-[13px] font-medium text-slate-300 mb-2" htmlFor="password">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    className="w-full rounded-2xl border border-white/8 bg-white/[0.04] pl-4 pr-16 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-orange-400/50 focus:bg-white/[0.06] transition"
                                    placeholder="••••••••"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-3 text-[13px] font-medium text-slate-400 hover:text-orange-400 transition"
                                >
                                    {showPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </div>

                        <button type="submit" className="w-full rounded-2xl bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(244,63,94,0.3)] transition hover:brightness-110 mt-6 relative overflow-hidden group">
                            <span className="relative z-10">Sign Up</span>
                            <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-[0%] transition-transform duration-300 ease-[cubic-bezier(0.19,1,0.22,1)]" />
                        </button>
                        {error ? <div className="mt-4 text-sm text-rose-400">{error}</div> : null}
                    </form>

                    <div className="mt-8 flex items-center justify-between text-xs text-slate-500">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="px-4">OR CONTINUE WITH</span>
                        <div className="h-px flex-1 bg-white/10" />
                    </div>

                    <div className="mt-6">
                        <button
                            onClick={() => signIn('google')}
                            className="w-full flex items-center justify-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3.5 text-sm font-medium text-white transition hover:bg-white/[0.06] hover:border-white/20 shadow-sm"
                        >
                            <span className="text-lg">G</span> Continue with Google
                        </button>
                    </div>
                </div>

                <p className="mt-8 text-center text-sm text-slate-400">
                    Already have an account?{" "}
                    <Link href="/login" className="font-medium text-orange-400 hover:text-orange-300 transition underline-offset-4 hover:underline">
                        Sign In
                    </Link>
                </p>
            </div>
        </main>
    );
}
