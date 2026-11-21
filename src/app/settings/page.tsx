"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  User,
  BarChart3,
  CreditCard,
  Palette,
  Bell,
  KeyRound,
  Shield,
  Check,
  Search,
  Trash2,
  Download,
  RefreshCw,
  LogOut,
  ExternalLink,
  Sparkles,
  Tag,
} from "lucide-react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useTheme, type Theme, type Accent } from "@/context/ThemeContext";
import { useRecentSearches } from "@/hooks/useRecentSearches";

type ToastType = "success" | "error" | "info";
interface Toast {
  id: number;
  msg: string;
  type: ToastType;
}

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((msg: string, type: ToastType = "success") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

interface RequestLogEntry {
  id: string;
  timestamp: number;
  dateKey: string;
  querySnippet: string;
  type: "dataset" | "general" | "hybrid" | "assistant" | "other";
  tokensUsed: number;
  status: "success" | "rate_limited" | "quota_exceeded";
}

interface UserUsageData {
  identifier: string;
  planTier: string;
  planName: string;
  todayCount: number;
  dailyLimit: number;
  remainingRequestsToday: number;
  usedPercentage: number;
  totalLifetimeRequests: number;
  totalLifetimeTokens: number;
  dailyTokensToday: number;
  dailyTokenLimit: number;
  remainingTokensToday: number;
  resetHours: number;
  dailyHistory: Array<{ date: string; label: string; count: number; tokens: number }>;
  recentRequests: RequestLogEntry[];
  categoryBreakdown: {
    datasetSearches: number;
    generalAiInquiries: number;
    researchAndHybrid: number;
  };
  averageDailyRequests: number;
  memberSince: string;
}

const LS_BIO = "settings_bio";
const LS_NAME = "settings_display_name";
const LS_NOTIFS = "settings_notifications";

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function useLocalState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
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
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }, [key, val, hydrated]);

  return [val, setVal];
}

type SettingsTab =
  | "Profile"
  | "Usage"
  | "Billing"
  | "Appearance"
  | "Notifications"
  | "API Keys"
  | "Security";

function normalizeTabParam(raw: string | null): SettingsTab {
  if (!raw) return "Profile";
  const lower = raw.toLowerCase();
  if (lower.includes("usage") || lower.includes("history")) return "Usage";
  if (lower.includes("bill") || lower.includes("plan")) return "Billing";
  if (lower.includes("appear") || lower.includes("theme")) return "Appearance";
  if (lower.includes("notif")) return "Notifications";
  if (lower.includes("api") || lower.includes("key")) return "API Keys";
  if (lower.includes("sec") || lower.includes("pass")) return "Security";
  return "Profile";
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const { session } = useAuthGuard();
  const { toasts, show } = useToast();
  const { theme, accent, setTheme: applyTheme, setAccent: applyAccent } = useTheme();
  const { recentSearches, removeSearch, clearAllSearches } = useRecentSearches();

  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    normalizeTabParam(searchParams?.get("tab") || null)
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const t = searchParams?.get("tab");
    if (t) setActiveTab(normalizeTabParam(t));
  }, [searchParams]);

  // Usage Analytics
  const [usage, setUsage] = useState<UserUsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("");

  const fetchUsage = useCallback(async (quiet = false) => {
    if (!quiet) setUsageLoading(true);
    try {
      const res = await fetch("/api/user/usage");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.usage) setUsage(data.usage);
      }
    } catch {
    } finally {
      if (!quiet) setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage(true);
  }, [fetchUsage]);

  // Profile
  const [displayName, setDisplayName] = useLocalState<string>(LS_NAME, "");
  const [bio, setBio] = useLocalState<string>(LS_BIO, "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (session?.user?.name && !displayName) setDisplayName(session.user.name);
  }, [session?.user?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Billing / Stripe Checkout
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [couponCode, setCouponCode] = useState("");
  const [checkoutBusyPlan, setCheckoutBusyPlan] = useState<string | null>(null);
  const [checkoutReceipt, setCheckoutReceipt] = useState<{
    planId: string;
    checkoutUrl: string;
    finalAmountFormatted?: string;
    discountLabel?: string;
  } | null>(null);

  // Notifications
  type NotifKey = "weekly" | "datasets" | "roadmaps" | "security" | "announcements";
  const [notifs, setNotifs] = useLocalState<Record<NotifKey, boolean>>(LS_NOTIFS, {
    weekly: true,
    datasets: true,
    roadmaps: false,
    security: true,
    announcements: false,
  });

  // Security Password Change
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const userName = mounted ? displayName || session?.user?.name || "Researcher" : "Researcher";
  const userEmail = mounted ? session?.user?.email || "" : "";
  const userInitial = userName.charAt(0).toUpperCase();

  const handleCheckout = async (planId: "pro" | "team") => {
    setCheckoutBusyPlan(planId);
    setCheckoutReceipt(null);
    try {
      const csrfRes = await fetch("/api/csrf");
      const csrfData = await csrfRes.json();
      const csrfToken = csrfData.csrfToken || "";

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          planId,
          interval: billingInterval,
          couponCode: couponCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const order = data.order || {};
        setCheckoutReceipt({
          planId,
          checkoutUrl: data.checkoutUrl,
          finalAmountFormatted:
            typeof order.finalCents === "number"
              ? `$${(order.finalCents / 100).toFixed(2)}`
              : undefined,
          discountLabel: order.discountDescription || undefined,
        });
        show(`Checkout session initialized for ${planId.toUpperCase()} plan.`, "success");
      } else {
        show(data.error || "Unable to initiate Stripe checkout.", "error");
      }
    } catch {
      show("Network error creating checkout session.", "error");
    } finally {
      setCheckoutBusyPlan(null);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwCurrent) {
      show("Enter your current password", "error");
      return;
    }
    if (pwNew.length < 8) {
      show("New password must be at least 8 characters", "error");
      return;
    }
    if (pwNew !== pwConfirm) {
      show("New passwords do not match", "error");
      return;
    }

    setPwSaving(true);
    try {
      const csrfRes = await fetch("/api/csrf");
      const csrfData = await csrfRes.json();
      const csrfToken = csrfData.csrfToken || "";

      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        show(data.message || "Password updated successfully.", "success");
        setPwCurrent("");
        setPwNew("");
        setPwConfirm("");
      } else {
        show(data.error || "Failed to update password.", "error");
      }
    } catch {
      show("Network error while updating password.", "error");
    } finally {
      setPwSaving(false);
    }
  };

  const handleExportUsage = () => {
    if (!usage) {
      show("No usage metrics available yet.", "info");
      return;
    }
    const blob = new Blob([JSON.stringify(usage, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai_dataset_explorer_usage_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    show("Exported usage telemetry JSON", "success");
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: "Profile", label: "Profile", icon: <User className="w-4 h-4" /> },
    { id: "Usage", label: "History & Quota", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "Billing", label: "Plans & Billing", icon: <CreditCard className="w-4 h-4" /> },
    { id: "Appearance", label: "Appearance", icon: <Palette className="w-4 h-4" /> },
    { id: "Notifications", label: "Notifications", icon: <Bell className="w-4 h-4" /> },
    { id: "API Keys", label: "API & Tokens", icon: <KeyRound className="w-4 h-4" /> },
    { id: "Security", label: "Security", icon: <Shield className="w-4 h-4" /> },
  ];

  const filteredHistory = recentSearches.filter((item) =>
    !historyFilter.trim()
      ? true
      : item.query.toLowerCase().includes(historyFilter.toLowerCase())
  );

  return (
    <WorkspaceShell pageTitle="Workspace Settings">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Toasts */}
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto px-4 py-2.5 rounded-xl border text-xs font-semibold shadow-2xl ${
                t.type === "success"
                  ? "bg-[#0D111A] border-emerald-500/40 text-emerald-300"
                  : t.type === "error"
                  ? "bg-[#0D111A] border-rose-500/40 text-rose-300"
                  : "bg-[#0D111A] border-sky-500/40 text-sky-300"
              }`}
            >
              {t.msg}
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="obsidian-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-slate-950 font-bold text-base">
              {userInitial}
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-100">{userName}</h1>
              <p className="text-xs font-mono text-slate-400">
                {userEmail || "Local Researcher Session"} &bull; {usage?.planName || "Free Tier"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/30 text-xs font-medium text-slate-300 hover:text-rose-300 transition-lab cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Left Settings Navigation */}
          <aside className="md:col-span-3 obsidian-card p-2 space-y-1">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-lab cursor-pointer ${
                    active
                      ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                      : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border border-transparent"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </aside>

          {/* Main Tab Content */}
          <div className="md:col-span-9 space-y-5">
            {activeTab === "Profile" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setIsSaving(true);
                  setTimeout(() => {
                    setIsSaving(false);
                    show("Profile preferences updated");
                  }, 400);
                }}
                className="obsidian-card p-6 space-y-5"
              >
                <div>
                  <h2 className="text-base font-bold text-slate-100">Researcher Profile</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Personalize your workspace identity and focus domain.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1.5">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ada Lovelace"
                      className="w-full rounded-xl bg-[#07090E] border border-white/10 px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500/60"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1.5">
                      Account Email
                    </label>
                    <input
                      type="email"
                      disabled
                      value={userEmail || "guest@research.local"}
                      className="w-full rounded-xl bg-[#07090E]/50 border border-white/[0.06] px-3.5 py-2 text-xs font-mono text-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1.5">
                    Research Bio &amp; Target Hardware Notes
                  </label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Medical imaging, clinical NLP, 24GB RTX 4090 cluster..."
                    className="w-full rounded-xl bg-[#07090E] border border-white/10 px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500/60"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer"
                >
                  {isSaving ? "Saving..." : "Save Profile"}
                </button>
              </form>
            )}

            {activeTab === "Usage" && (
              <div className="space-y-5">
                {/* Quota KPIs */}
                <div className="obsidian-card p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-100">
                        Quota &amp; Usage Telemetry
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Live search consumption from `/api/user/usage` and local workspace session history.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fetchUsage(false)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-slate-300 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${usageLoading ? "animate-spin" : ""}`} /> Refresh
                      </button>
                      <button
                        type="button"
                        onClick={handleExportUsage}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-xs text-sky-300 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" /> Export JSON
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-[#07090E] border border-white/[0.07]">
                      <div className="text-[10px] uppercase text-slate-500">Today Queries</div>
                      <div className="font-mono text-lg font-bold text-sky-300 mt-1 tabular-nums">
                        {usage?.todayCount ?? 0} / {usage?.dailyLimit ?? 50}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#07090E] border border-white/[0.07]">
                      <div className="text-[10px] uppercase text-slate-500">Lifetime Searches</div>
                      <div className="font-mono text-lg font-bold text-slate-100 mt-1 tabular-nums">
                        {usage?.totalLifetimeRequests ?? recentSearches.length}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#07090E] border border-white/[0.07]">
                      <div className="text-[10px] uppercase text-slate-500">Today Tokens</div>
                      <div className="font-mono text-lg font-bold text-emerald-300 mt-1 tabular-nums">
                        {(usage?.dailyTokensToday ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#07090E] border border-white/[0.07]">
                      <div className="text-[10px] uppercase text-slate-500">Active Plan</div>
                      <div className="font-mono text-sm font-bold text-amber-300 mt-1.5">
                        {usage?.planName || "Free Tier"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Searchable Local History & Saved Blueprints */}
                <div className="obsidian-card p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-100">
                      Recent Search History ({recentSearches.length})
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={historyFilter}
                          onChange={(e) => setHistoryFilter(e.target.value)}
                          placeholder="Filter searches..."
                          className="pl-8 pr-3 py-1.5 rounded-lg bg-[#07090E] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-sky-500/50"
                        />
                      </div>
                      {recentSearches.length > 0 && (
                        <button
                          type="button"
                          onClick={clearAllSearches}
                          className="px-2.5 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {filteredHistory.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">
                      No matching research sessions recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {filteredHistory.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#07090E] border border-white/[0.07]"
                        >
                          <Link
                            href={`/explore?q=${encodeURIComponent(item.query)}`}
                            className="text-xs font-medium text-slate-200 hover:text-sky-300 truncate flex-1"
                          >
                            {item.query}
                          </Link>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-[10px] text-slate-500">
                              {formatRelativeTime(item.timestamp)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeSearch(item.id)}
                              className="text-slate-500 hover:text-rose-400 cursor-pointer"
                              aria-label="Remove search"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "Billing" && (
              <div className="obsidian-card p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-100">Subscription Plans &amp; Stripe Checkout</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Server-validated Stripe checkout via CSRF-protected `/api/checkout`.
                    </p>
                  </div>
                  <div className="inline-flex rounded-lg bg-[#07090E] border border-white/10 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setBillingInterval("monthly")}
                      className={`px-3 py-1 rounded-md cursor-pointer ${
                        billingInterval === "monthly" ? "bg-sky-500/20 text-sky-300" : "text-slate-400"
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingInterval("yearly")}
                      className={`px-3 py-1 rounded-md cursor-pointer ${
                        billingInterval === "yearly" ? "bg-emerald-500/20 text-emerald-300" : "text-slate-400"
                      }`}
                    >
                      Yearly (-17%)
                    </button>
                  </div>
                </div>

                {/* Promo Code Bar */}
                <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-[#07090E] border border-white/[0.08]">
                  <Tag className="w-4 h-4 text-sky-400" />
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="Promo code (try RESEARCH20 or STUDENT50)"
                    className="flex-1 min-w-[200px] bg-transparent text-xs font-mono text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Free Plan */}
                  <div className="p-5 rounded-xl bg-[#07090E] border border-white/[0.08] flex flex-col justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-400">Free Researcher</span>
                      <div className="text-2xl font-bold text-slate-100 mt-1 font-mono">$0</div>
                      <ul className="mt-3 space-y-1.5 text-xs text-slate-400">
                        <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> 7-Provider Search Pipeline</li>
                        <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Interactive Research Graph</li>
                        <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> QLoRA VRAM Estimator</li>
                      </ul>
                    </div>
                    <span className="text-center py-2 rounded-lg bg-white/[0.04] text-xs font-semibold text-slate-400">
                      Current Baseline
                    </span>
                  </div>

                  {/* Pro Lab Plan */}
                  <div className="p-5 rounded-xl bg-[#07090E] border border-sky-500/40 flex flex-col justify-between gap-4">
                    <div>
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-sky-400">
                        <Sparkles className="w-3 h-3" /> Pro Lab Workstation
                      </span>
                      <div className="text-2xl font-bold text-slate-100 mt-1 font-mono tabular-nums">
                        {billingInterval === "yearly" ? "$290/yr" : "$29/mo"}
                      </div>
                      <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
                        <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Unlimited Multi-Source Discovery</li>
                        <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Priority AI Copilot &amp; ZIP Exports</li>
                        <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Extended Paper Evidence Audits</li>
                      </ul>
                    </div>
                    <button
                      type="button"
                      disabled={checkoutBusyPlan !== null}
                      onClick={() => handleCheckout("pro")}
                      className="w-full py-2.5 rounded-lg bg-gradient-to-r from-sky-400 to-sky-500 hover:from-sky-300 hover:to-sky-400 text-slate-950 font-semibold text-xs cursor-pointer disabled:opacity-50"
                    >
                      {checkoutBusyPlan === "pro" ? "Preparing Checkout..." : "Upgrade to Pro Lab →"}
                    </button>
                  </div>
                </div>

                {checkoutReceipt && (
                  <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-bold text-emerald-300 block">
                        Checkout Ready ({checkoutReceipt.planId.toUpperCase()})
                      </span>
                      <span className="text-slate-300">
                        {checkoutReceipt.finalAmountFormatted ? `Verified Server Total: ${checkoutReceipt.finalAmountFormatted}` : "Order validated by server catalog"}
                        {checkoutReceipt.discountLabel ? ` · ${checkoutReceipt.discountLabel}` : ""}
                      </span>
                    </div>
                    <a
                      href={checkoutReceipt.checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-semibold"
                    >
                      Proceed to Stripe <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {activeTab === "Appearance" && (
              <div className="obsidian-card p-6 space-y-6">
                <div>
                  <h2 className="text-base font-bold text-slate-100">Obsidian Theme &amp; Accent</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure dark/light lab surfaces and primary highlight tokens.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {(["dark", "light", "system"] as Theme[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => applyTheme(t)}
                      className={`p-3 rounded-xl border text-xs font-semibold capitalize cursor-pointer ${
                        theme === t
                          ? "bg-sky-500/15 border-sky-500/40 text-sky-300"
                          : "bg-[#07090E] border-white/10 text-slate-400"
                      }`}
                    >
                      {t} Mode
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {(
                    [
                      { id: "quantum-cyan", label: "Quantum Cyan", color: "bg-sky-400" },
                      { id: "emerald", label: "Emerald", color: "bg-emerald-400" },
                      { id: "violet-cyan", label: "Violet Cyan", color: "bg-violet-400" },
                      { id: "blue-violet", label: "Cobalt", color: "bg-blue-400" },
                      { id: "amber-rose", label: "Amber", color: "bg-amber-400" },
                    ] as Array<{ id: Accent; label: string; color: string }>
                  ).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => applyAccent(a.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer ${
                        accent === a.id
                          ? "bg-white/[0.06] border-sky-500/50 text-slate-100"
                          : "bg-[#07090E] border-white/10 text-slate-400"
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full ${a.color}`} />
                      <span className="truncate">{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "Notifications" && (
              <div className="obsidian-card p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-100">Notification Preferences</h2>
                {(
                  [
                    { key: "weekly", label: "Weekly dataset & paper digest" },
                    { key: "datasets", label: "New open-license corpora matching saved domains" },
                    { key: "roadmaps", label: "Roadmap & training recipe updates" },
                    { key: "security", label: "Account login & password alerts" },
                  ] as Array<{ key: NotifKey; label: string }>
                ).map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#07090E] border border-white/[0.07] cursor-pointer"
                  >
                    <span className="text-xs text-slate-200">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={notifs[item.key]}
                      onChange={(e) => {
                        setNotifs((prev) => ({ ...prev, [item.key]: e.target.checked }));
                        show("Notification preference updated", "info");
                      }}
                      className="accent-sky-400"
                    />
                  </label>
                ))}
              </div>
            )}

            {activeTab === "API Keys" && (
              <div className="obsidian-card p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-100">Server-Side API Integrations</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  All provider credentials (`GEMINI_API_KEY`, `NCBI_API_KEY`, `KAGGLE_KEY`, `GITHUB_TOKEN`, `STRIPE_SECRET_KEY`) are managed strictly server-side via environment variables and never exposed to client bundles.
                </p>
                <Link
                  href="/api/health"
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-xs font-mono text-sky-300"
                >
                  Inspect Live `/api/health` Status <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}

            {activeTab === "Security" && (
              <form onSubmit={handlePasswordChange} className="obsidian-card p-6 space-y-4">
                <div>
                  <h2 className="text-base font-bold text-slate-100">Change Account Password</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Protected via CSRF validation token and bcrypt verification.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1.5">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    className="w-full rounded-xl bg-[#07090E] border border-white/10 px-3.5 py-2 text-xs text-slate-100"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1.5">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={pwNew}
                      onChange={(e) => setPwNew(e.target.value)}
                      className="w-full rounded-xl bg-[#07090E] border border-white/10 px-3.5 py-2 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1.5">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={pwConfirm}
                      onChange={(e) => setPwConfirm(e.target.value)}
                      className="w-full rounded-xl bg-[#07090E] border border-white/10 px-3.5 py-2 text-xs text-slate-100"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={pwSaving}
                  className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer disabled:opacity-50"
                >
                  {pwSaving ? "Updating..." : "Update Password"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

export default function SettingsPage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#07090E] flex items-center justify-center text-xs font-mono text-slate-400">
            Loading Workspace Settings...
          </div>
        }
      >
        <SettingsContent />
      </Suspense>
    </ErrorBoundary>
  );
}
