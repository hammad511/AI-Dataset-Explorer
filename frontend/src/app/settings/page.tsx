"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { useTheme } from "@/lib/theme";
import type { Theme, Accent } from "@/lib/theme";

// ── tiny toast hook ────────────────────────────────────────────────────────
type ToastType = "success" | "error" | "info";
interface Toast { id: number; msg: string; type: ToastType }

function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const show = (msg: string, type: ToastType = "success") => {
        const id = Date.now();
        setToasts(p => [...p, { id, msg, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
    };
    return { toasts, show };
}

// ── helpers ───────────────────────────────────────────────────────────────
const LS_BIO       = "settings_bio";
const LS_NAME      = "settings_display_name";
const LS_NOTIFS    = "settings_notifications";

function useLocalState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    // Always start with `initial` so server and client first-render agree (no hydration mismatch).
    const [val, setVal] = useState<T>(initial);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        if (hydrated) return;
        try {
            const s = localStorage.getItem(key);
            if (s) setVal(JSON.parse(s) as T);
        } catch {}
        setHydrated(true);
    }, [key, hydrated]);

    useEffect(() => {
        if (!hydrated) return; // don't persist the default before loading
        try { localStorage.setItem(key, JSON.stringify(val)); }
        catch {}
    }, [key, val, hydrated]);

    return [val, setVal];
}

// ── component ─────────────────────────────────────────────────────────────
export default function SettingsPage() {
    const { data: session } = useSession();
    const { toasts, show }  = useToast();

    const [activeTab,     setActiveTab]     = useState("Profile");
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const { theme, accent, setTheme: applyTheme, setAccent: applyAccent } = useTheme();
    // `mounted` gates all session-derived values so server/client first render agree.
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // Profile state
    const [displayName, setDisplayName] = useLocalState<string>(LS_NAME, "");
    const [bio,         setBio]         = useLocalState<string>(LS_BIO,  "");
    const [isSaving,    setIsSaving]    = useState(false);

    // Initialise display name from session once
    useEffect(() => {
        if (session?.user?.name && !displayName) setDisplayName(session.user.name);
    }, [session?.user?.name]); // eslint-disable-line react-hooks/exhaustive-deps

    // Notifications state
    type NotifKey = "weekly" | "datasets" | "roadmaps" | "security" | "announcements";
    const defaultNotifs: Record<NotifKey, boolean> = {
        weekly: true, datasets: true, roadmaps: false, security: true, announcements: false,
    };
    const [notifs, setNotifs] = useLocalState<Record<NotifKey, boolean>>(LS_NOTIFS, defaultNotifs);
    const [notifSaving, setNotifSaving] = useState(false);

    // Appearance state — now managed by ThemeProvider via useTheme()

    // Password state
    const [pwCurrent, setPwCurrent] = useState("");
    const [pwNew,     setPwNew]     = useState("");
    const [pwConfirm, setPwConfirm] = useState("");
    const [pwSaving,  setPwSaving]  = useState(false);

    // Gate on `mounted` so server and client render the same initial value.
    const userInitial = mounted ? (displayName?.charAt(0) || session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || "U") : "U";
    const userName    = mounted ? (displayName || session?.user?.name || "Anonymous") : "Anonymous";
    const userEmail   = mounted ? (session?.user?.email || "") : "";

    const tabs = [
        { id: "Profile",       icon: "👤", label: "Profile"       },
        { id: "Appearance",    icon: "🎨", label: "Appearance"    },
        { id: "Notifications", icon: "🔔", label: "Notifications" },
        { id: "API Keys",      icon: "🔑", label: "API Keys"      },
        { id: "Security",      icon: "🛡️", label: "Security"      },
    ];

    // ── handlers ──────────────────────────────────────────────────────────

    const handleProfileSave = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setTimeout(() => {
            setIsSaving(false);
            show("Profile saved successfully");
        }, 800);
    };

    const handleDeleteAccount = async () => {
        if (!window.confirm("Permanently delete your account? This cannot be undone.")) return;
        try {
            // Remove account from users.json via a DELETE call.
            // Since there is no DELETE endpoint yet, we sign out and show a message.
            show("Account deletion requires server support. You have been signed out.", "info");
            await new Promise(r => setTimeout(r, 1500));
            signOut({ callbackUrl: "/login" });
        } catch {
            show("Failed to delete account. Please try again.", "error");
        }
    };

    const handleNotifSave = () => {
        setNotifSaving(true);
        setTimeout(() => {
            setNotifSaving(false);
            show("Notification preferences saved");
        }, 600);
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pwCurrent) { show("Enter your current password", "error"); return; }
        if (pwNew.length < 8) { show("New password must be at least 8 characters", "error"); return; }
        if (pwNew !== pwConfirm) { show("New passwords do not match", "error"); return; }
        if (!userEmail) { show("No account email found", "error"); return; }

        setPwSaving(true);
        try {
            // Verify current password by attempting to sign in silently
            // then update password via re-register pattern (replace hash in users.json)
            // For now we call a PATCH-style endpoint — since only POST /register exists,
            // we show a coming-soon message but still validate inputs correctly.
            await new Promise(r => setTimeout(r, 800));
            show("Password change requires a /api/auth/update-password endpoint (not yet implemented). All validation passed.", "info");
        } finally {
            setPwSaving(false);
            setPwCurrent(""); setPwNew(""); setPwConfirm("");
        }
    };

    const handleCopyKey = (key: string) => {
        navigator.clipboard.writeText(key)
            .then(() => show("API key copied to clipboard"))
            .catch(() => show("Copy failed — please copy manually", "error"));
    };

    const handleRevokeKey = () => {
        if (!window.confirm("Revoke this API key? It will stop working immediately.")) return;
        show("Key revocation requires server support (not yet implemented)", "info");
    };

    // ── render ────────────────────────────────────────────────────────────
    return (
        <main className="min-h-screen bg-[#050508] text-white">

            {/* Toast container */}
            <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id}
                        className={`flex items-center gap-3 px-5 py-3 rounded-2xl border text-sm font-medium shadow-xl backdrop-blur-xl animate-in slide-in-from-bottom-3 fade-in duration-200 pointer-events-auto
                            ${t.type === "success" ? "bg-emerald-950/90 border-emerald-500/30 text-emerald-300"
                            : t.type === "error"   ? "bg-rose-950/90 border-rose-500/30 text-rose-300"
                            :                        "bg-slate-900/90 border-white/10 text-slate-300"}`}>
                        <span>{t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}</span>
                        {t.msg}
                    </div>
                ))}
            </div>

            {/* Aurora background */}
            <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
                <div className="absolute -top-40 left-[10%] w-[700px] h-[700px] rounded-full opacity-[0.15]"
                    style={{ background: "radial-gradient(ellipse,rgba(139,92,246,0.5),transparent 65%)" }} />
                <div className="absolute top-[5%] right-[5%] w-[500px] h-[500px] rounded-full opacity-[0.10]"
                    style={{ background: "radial-gradient(ellipse,rgba(6,182,212,0.5),transparent 65%)" }} />
                <div className="absolute bottom-[5%] left-[35%] w-[600px] h-[400px] rounded-full opacity-[0.07]"
                    style={{ background: "radial-gradient(ellipse,rgba(16,185,129,0.5),transparent 65%)" }} />
                <div className="absolute inset-0"
                    style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.012) 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
            </div>

            {/* Navbar */}
            <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between bg-black/50 backdrop-blur-xl border-b border-white/[0.05]">
                <Link href="/explore" className="flex items-center gap-3 group">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shadow-[0_0_25px_rgba(139,92,246,0.5)] group-hover:shadow-[0_0_35px_rgba(139,92,246,0.7)] transition-shadow"
                        style={{ background: "linear-gradient(135deg,#8B5CF6,#06B6D4)" }}>✦</div>
                    <span className="hidden sm:block text-sm font-semibold tracking-tight"
                        style={{ background: "linear-gradient(90deg,#c4b5fd,#67e8f9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                        AI Dataset Explorer
                    </span>
                </Link>

                <div className="relative">
                    <button onClick={() => setIsProfileOpen(v => !v)}
                        className="flex items-center gap-3 bg-white/[0.03] border border-white/10 hover:border-white/20 hover:bg-white/[0.06] transition rounded-full pl-3 pr-4 py-2">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                            style={{ background: "linear-gradient(135deg,#8B5CF6,#06B6D4)" }}>{userInitial}</div>
                        <span className="text-sm font-medium text-slate-200">{userName}</span>
                        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isProfileOpen ? "rotate-180" : ""}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {isProfileOpen && (
                        <div className="absolute right-0 mt-3 w-56 rounded-2xl border border-white/10 bg-[#0a0a0f]/90 backdrop-blur-xl shadow-2xl py-2 z-50"
                            onMouseLeave={() => setIsProfileOpen(false)}>
                            <div className="px-4 py-3 border-b border-white/5">
                                <p className="text-sm font-medium text-white truncate">{userName}</p>
                                <p className="text-xs text-slate-400 truncate mt-0.5">{userEmail}</p>
                            </div>
                            <div className="p-2">
                                <Link href="/settings" onClick={() => setIsProfileOpen(false)}
                                    className="block w-full text-left px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition">
                                    Settings
                                </Link>
                                <button onClick={() => signOut({ callbackUrl: "/login" })}
                                    className="w-full text-left px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 rounded-xl transition mt-1">
                                    Sign out
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* Page body */}
            <div className="max-w-6xl mx-auto px-4 pt-28 pb-16">

                {/* Heading */}
                <div className="mb-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                            style={{ background: "linear-gradient(135deg,#8B5CF6,#06B6D4)" }}>
                            <span className="text-white text-lg">⚙</span>
                        </div>
                        <h1 className="text-3xl font-black tracking-tight text-white">Settings</h1>
                    </div>
                    <p className="text-slate-400 text-sm ml-[52px]">Manage your account, preferences, and integrations.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">

                    {/* Sidebar */}
                    <aside className="space-y-1">
                        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 mb-4 flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                                style={{ background: "linear-gradient(135deg,#8B5CF6,#06B6D4)" }}>{userInitial}</div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{userName}</p>
                                <p className="text-xs text-slate-500 truncate">{userEmail}</p>
                            </div>
                        </div>

                        {tabs.map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className={`w-full text-left flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all
                                    ${activeTab === tab.id
                                        ? "bg-violet-500/15 border border-violet-500/30 text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.1)]"
                                        : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent"}`}>
                                <span className="text-base">{tab.icon}</span>
                                {tab.label}
                                {activeTab === tab.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400" />}
                            </button>
                        ))}

                        <div className="pt-4 border-t border-white/[0.06] mt-4">
                            <button onClick={() => signOut({ callbackUrl: "/login" })}
                                className="w-full text-left flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition">
                                <span className="text-base">🚪</span> Sign Out
                            </button>
                        </div>
                    </aside>

                    {/* Main panel */}
                    <div className="space-y-5 min-w-0">

                        {/* ══ PROFILE ══ */}
                        {activeTab === "Profile" && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
                                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-7">
                                    <div className="flex items-center gap-3 mb-7">
                                        <div className="w-2 h-6 rounded-full bg-violet-500" />
                                        <h2 className="text-lg font-bold text-white">Account Profile</h2>
                                    </div>

                                    <form className="space-y-6" onSubmit={handleProfileSave}>
                                        {/* Avatar */}
                                        <div className="flex items-center gap-5 p-5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                            <div className="relative shrink-0">
                                                <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-black text-3xl shadow-[0_0_30px_rgba(139,92,246,0.4)]"
                                                    style={{ background: "linear-gradient(135deg,#8B5CF6,#06B6D4)" }}>{userInitial}</div>
                                                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#050508]" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-white mb-1">{userName}</p>
                                                <p className="text-xs text-slate-500 mb-3">{userEmail}</p>
                                                <label className="text-xs px-4 py-2 rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.07] transition cursor-pointer inline-block">
                                                    Change Avatar
                                                    <input type="file" className="hidden" accept="image/*"
                                                        onChange={e => {
                                                            if (e.target.files?.[0]) {
                                                                show("Avatar upload requires cloud storage (not yet implemented). File: " + e.target.files[0].name, "info");
                                                                e.target.value = "";
                                                            }
                                                        }} />
                                                </label>
                                                <p className="text-[11px] text-slate-600 mt-1.5">JPG, GIF or PNG · Max 800 KB</p>
                                            </div>
                                        </div>

                                        {/* Name + Email */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                            <div>
                                                <label className="block text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                                                    Display Name
                                                </label>
                                                <input type="text"
                                                    value={displayName}
                                                    onChange={e => setDisplayName(e.target.value)}
                                                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)] transition"
                                                    placeholder="Your display name" />
                                                <p className="text-[11px] text-slate-600 mt-1.5">Saved locally in your browser.</p>
                                            </div>
                                            <div>
                                                <label className="block text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                                                    Email Address
                                                </label>
                                                <div className="relative">
                                                    <input type="email"
                                                        value={userEmail}
                                                        disabled
                                                        className="w-full rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-sm text-slate-500 outline-none cursor-not-allowed" />
                                                    <span className="absolute right-3 top-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.05] text-slate-600 border border-white/[0.06]">
                                                        LOCKED
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-600 mt-1.5">Email cannot be changed.</p>
                                            </div>
                                        </div>

                                        {/* Bio */}
                                        <div>
                                            <label className="block text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Bio</label>
                                            <textarea rows={3}
                                                value={bio}
                                                onChange={e => setBio(e.target.value)}
                                                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)] transition resize-none"
                                                placeholder="Tell us about yourself and your AI projects..." />
                                            <p className="text-[11px] text-slate-600 mt-1">{bio.length}/300 characters</p>
                                        </div>

                                        {/* Stats */}
                                        <div className="grid grid-cols-3 gap-4">
                                            {[
                                                { label: "Searches",      value: "—",   icon: "🔍" },
                                                { label: "Datasets Saved",value: "—",   icon: "📦" },
                                                { label: "Member Since",  value: "2026",icon: "📅" },
                                            ].map(({ label, value, icon }) => (
                                                <div key={label} className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.05] text-center">
                                                    <div className="text-xl mb-1">{icon}</div>
                                                    <div className="text-lg font-black text-white">{value}</div>
                                                    <div className="text-[11px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Save */}
                                        <div className="flex justify-end items-center gap-4 pt-4 border-t border-white/[0.06]">
                                            <button type="submit" disabled={isSaving}
                                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition hover:brightness-110 active:scale-95 disabled:opacity-50 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                                                style={{ background: "linear-gradient(135deg,#8B5CF6,#06B6D4)" }}>
                                                {isSaving ? (
                                                    <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                    </svg>Saving…</>
                                                ) : "Save Changes"}
                                            </button>
                                        </div>
                                    </form>
                                </div>

                                {/* Danger zone */}
                                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-2 h-6 rounded-full bg-rose-500" />
                                        <h2 className="text-base font-bold text-rose-400">Danger Zone</h2>
                                    </div>
                                    <p className="text-sm text-slate-400 mb-5 ml-5">
                                        Permanently delete your account and all associated data. This action is irreversible.
                                    </p>
                                    <button onClick={handleDeleteAccount}
                                        className="ml-5 text-sm px-5 py-2.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/50 transition font-medium">
                                        🗑 Delete Account
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ══ APPEARANCE ══ */}
                        {activeTab === "Appearance" && (
                            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-7 animate-in fade-in slide-in-from-right-2 duration-200">
                                <div className="flex items-center gap-3 mb-7">
                                    <div className="w-2 h-6 rounded-full bg-cyan-500" />
                                    <h2 className="text-lg font-bold text-white">Appearance</h2>
                                </div>
                                <p className="text-slate-400 text-sm mb-6">Customise the look and feel of the interface.</p>

                                {/* Theme */}
                                <div className="mb-8">
                                    <label className="block text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Theme</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {[
                                            { id: "dark",   label: "Dark",   bg: "#050508" },
                                            { id: "light",  label: "Light",  bg: "#f8fafc" },
                                            { id: "system", label: "System", bg: "linear-gradient(135deg,#050508 50%,#f8fafc 50%)" },
                                        ].map(t => (
                                            <button key={t.id} onClick={() => { applyTheme(t.id as Theme); show(`Theme set to ${t.label}`); }}
                                                className={`rounded-xl p-4 border text-center transition ${theme === t.id
                                                    ? "border-violet-500/50 bg-violet-500/10 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                                                    : "border-white/[0.07] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"}`}>
                                                <div className="w-full h-10 rounded-lg mb-2 border border-white/10" style={{ background: t.bg }} />
                                                <span className={`text-xs font-semibold ${theme === t.id ? "text-violet-300" : "text-slate-400"}`}>{t.label}</span>
                                                {theme === t.id && <span className="block text-[10px] text-violet-500 mt-0.5">Active</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Accent */}
                                <div>
                                    <label className="block text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Accent Color</label>
                                    <div className="flex gap-4 flex-wrap">
                                        {[
                                            { id: "violet-cyan",  color: "linear-gradient(135deg,#8B5CF6,#06B6D4)", label: "Violet / Cyan"  },
                                            { id: "emerald",      color: "linear-gradient(135deg,#10B981,#06B6D4)", label: "Emerald"         },
                                            { id: "amber-rose",   color: "linear-gradient(135deg,#F59E0B,#EF4444)", label: "Amber / Rose"    },
                                            { id: "blue-violet",  color: "linear-gradient(135deg,#3B82F6,#8B5CF6)", label: "Blue / Violet"   },
                                        ].map(a => (
                                            <button key={a.id} onClick={() => { applyAccent(a.id as Accent); show(`Accent set to ${a.label}`); }}
                                                title={a.label}
                                                className={`w-10 h-10 rounded-full border-2 transition ${accent === a.id
                                                    ? "border-white scale-110 shadow-[0_0_14px_rgba(139,92,246,0.7)]"
                                                    : "border-white/20 hover:border-white/60 hover:scale-105"}`}
                                                style={{ background: a.color }} />
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-slate-600 mt-3">
                                        Theme and accent are applied instantly across the entire app and saved for your next visit.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ══ NOTIFICATIONS ══ */}
                        {activeTab === "Notifications" && (
                            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-7 animate-in fade-in slide-in-from-right-2 duration-200">
                                <div className="flex items-center gap-3 mb-7">
                                    <div className="w-2 h-6 rounded-full bg-emerald-500" />
                                    <h2 className="text-lg font-bold text-white">Notifications</h2>
                                </div>
                                <p className="text-slate-400 text-sm mb-6">
                                    Your preferences are saved in your browser. Email delivery requires a backend notification service.
                                </p>

                                <div className="space-y-3">
                                    {([
                                        { key: "weekly",        label: "Weekly Digest",         desc: "A weekly summary of new datasets and models in your domains."   },
                                        { key: "datasets",      label: "New Dataset Alerts",     desc: "Get notified when new datasets matching your interests appear."  },
                                        { key: "roadmaps",      label: "New Roadmap Updates",    desc: "Be the first to know about new learning roadmaps."               },
                                        { key: "security",      label: "Security Alerts",        desc: "Critical account security notifications. Recommended."           },
                                        { key: "announcements", label: "Product Announcements",  desc: "New features and major releases from AI Dataset Explorer."       },
                                    ] as const).map(item => (
                                        <div key={item.key} className="flex items-start justify-between gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.09] transition">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-white">{item.label}</p>
                                                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                                                <input type="checkbox"
                                                    className="sr-only peer"
                                                    checked={notifs[item.key]}
                                                    onChange={e => setNotifs(prev => ({ ...prev, [item.key]: e.target.checked }))} />
                                                <div className="w-11 h-6 bg-white/10 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-violet-500 peer-checked:to-cyan-500" />
                                            </label>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-6 flex justify-end">
                                    <button onClick={handleNotifSave} disabled={notifSaving}
                                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition hover:brightness-110 active:scale-95 disabled:opacity-50 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                                        style={{ background: "linear-gradient(135deg,#8B5CF6,#06B6D4)" }}>
                                        {notifSaving ? "Saving…" : "Save Preferences"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ══ API KEYS ══ */}
                        {activeTab === "API Keys" && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
                                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-7">
                                    <div className="flex items-center justify-between mb-7">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-6 rounded-full bg-amber-400" />
                                            <h2 className="text-lg font-bold text-white">API Keys</h2>
                                        </div>
                                        <button
                                            onClick={() => show("Key generation requires a server-side /api/keys endpoint (not yet implemented)", "info")}
                                            className="flex items-center gap-2 text-xs px-4 py-2 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/15 transition font-semibold">
                                            <span>+</span> Generate Key
                                        </button>
                                    </div>
                                    <p className="text-slate-400 text-sm mb-6">
                                        Use these keys to authenticate API requests from your own applications.
                                    </p>

                                    <div className="space-y-3">
                                        {[
                                            { name: "Production Key", key: "sk_prod_*********************", created: "Aug 2026", used: "Just now" },
                                        ].map((k, i) => (
                                            <div key={i} className="flex items-center justify-between gap-4 p-5 rounded-xl bg-white/[0.02] border border-white/[0.07] hover:border-white/[0.10] transition group">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-semibold text-white">{k.name}</span>
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Active</span>
                                                    </div>
                                                    <p className="text-xs font-mono text-slate-500">{k.key}</p>
                                                    <p className="text-[11px] text-slate-600 mt-1">Created {k.created} · Last used {k.used}</p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        onClick={() => handleCopyKey(k.key)}
                                                        className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.07] transition">
                                                        Copy
                                                    </button>
                                                    <button
                                                        onClick={handleRevokeKey}
                                                        className="text-xs px-3 py-1.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.05] text-rose-400 hover:bg-rose-500/10 transition">
                                                        Revoke
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] p-5 flex gap-4">
                                    <span className="text-2xl shrink-0">ℹ️</span>
                                    <div>
                                        <p className="text-sm font-semibold text-cyan-300 mb-1">Keep your keys private</p>
                                        <p className="text-xs text-slate-400 leading-relaxed">
                                            Never expose API keys in client-side code or public repositories. Rotate them immediately if you suspect they have been compromised.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ══ SECURITY ══ */}
                        {activeTab === "Security" && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">

                                {/* Password */}
                                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-7">
                                    <div className="flex items-center gap-3 mb-7">
                                        <div className="w-2 h-6 rounded-full bg-emerald-500" />
                                        <h2 className="text-lg font-bold text-white">Change Password</h2>
                                    </div>
                                    <form onSubmit={handlePasswordChange} className="space-y-5">
                                        {[
                                            { label: "Current Password", val: pwCurrent, setter: setPwCurrent, placeholder: "Your current password"  },
                                            { label: "New Password",     val: pwNew,     setter: setPwNew,     placeholder: "Min. 8 characters"       },
                                            { label: "Confirm Password", val: pwConfirm, setter: setPwConfirm, placeholder: "Repeat your new password" },
                                        ].map(f => (
                                            <div key={f.label}>
                                                <label className="block text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{f.label}</label>
                                                <input type="password"
                                                    value={f.val}
                                                    onChange={e => f.setter(e.target.value)}
                                                    placeholder={f.placeholder}
                                                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)] transition" />
                                            </div>
                                        ))}

                                        {/* strength hint */}
                                        {pwNew.length > 0 && (
                                            <div className="space-y-1">
                                                <div className="flex gap-1">
                                                    {[1,2,3,4].map(n => (
                                                        <div key={n} className={`flex-1 h-1 rounded-full transition-all ${
                                                            pwNew.length >= n * 3
                                                                ? n <= 1 ? "bg-rose-500"
                                                                : n <= 2 ? "bg-amber-500"
                                                                : n <= 3 ? "bg-cyan-500"
                                                                :          "bg-emerald-500"
                                                                : "bg-white/10"}`} />
                                                    ))}
                                                </div>
                                                <p className="text-[11px] text-slate-600">
                                                    {pwNew.length < 4 ? "Too short" : pwNew.length < 7 ? "Weak" : pwNew.length < 10 ? "Fair" : "Strong"}
                                                    {pwNew !== pwConfirm && pwConfirm.length > 0 && <span className="text-rose-400 ml-3">Passwords don&apos;t match</span>}
                                                </p>
                                            </div>
                                        )}

                                        <div className="mt-2 flex justify-end">
                                            <button type="submit" disabled={pwSaving}
                                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition hover:brightness-110 active:scale-95 disabled:opacity-50 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                                                style={{ background: "linear-gradient(135deg,#8B5CF6,#06B6D4)" }}>
                                                {pwSaving ? "Updating…" : "Update Password"}
                                            </button>
                                        </div>
                                    </form>
                                </div>

                                {/* Sessions */}
                                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-7">
                                    <div className="flex items-center gap-3 mb-7">
                                        <div className="w-2 h-6 rounded-full bg-violet-500" />
                                        <h2 className="text-lg font-bold text-white">Active Sessions</h2>
                                    </div>
                                    <div className="space-y-3">
                                        {[
                                            { device: "Current browser session", location: "Your device", time: "Now", current: true  },
                                        ].map((s, i) => (
                                            <div key={i} className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.current ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" : "bg-slate-600"}`} />
                                                    <div>
                                                        <p className="text-sm font-semibold text-white">{s.device}</p>
                                                        <p className="text-xs text-slate-500">{s.location} · {s.time}</p>
                                                    </div>
                                                </div>
                                                {s.current ? (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shrink-0">
                                                        This device
                                                    </span>
                                                ) : (
                                                    <button onClick={() => show("Session revocation requires server-side session management", "info")}
                                                        className="text-xs px-3 py-1.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.05] text-rose-400 hover:bg-rose-500/10 transition shrink-0">
                                                        Revoke
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        <p className="text-[11px] text-slate-600 px-1">
                                            Multi-session tracking requires a server-side session store. Only your current session is shown.
                                        </p>
                                    </div>
                                </div>

                                {/* 2FA */}
                                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <span className="text-2xl shrink-0">🔒</span>
                                        <div>
                                            <p className="text-sm font-semibold text-amber-300 mb-0.5">Two-Factor Authentication</p>
                                            <p className="text-xs text-slate-400">Add an extra layer of security to your account.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => show("2FA requires an authenticator integration (not yet implemented)", "info")}
                                        className="shrink-0 text-xs px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15 transition font-semibold">
                                        Enable 2FA
                                    </button>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </main>
    );
}
