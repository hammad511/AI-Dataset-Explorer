"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import {
  Activity,
  Server,
  ShieldAlert,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Cpu,
  Clock,
} from "lucide-react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import ErrorBoundary from "@/components/common/ErrorBoundary";

interface ProviderStatusItem {
  online: boolean;
  label: string;
  enhancedRateLimit?: boolean;
  optionalKey?: boolean;
}

interface HealthResponse {
  status: string;
  timestamp: number;
  providers: Record<string, ProviderStatusItem>;
  llm: {
    activeProvider: string;
    model?: string;
    hasGemini: boolean;
    hasFallbackLlm: boolean;
  };
}

interface FeedbackEntry {
  id?: string;
  searchId?: string;
  query: string;
  candidateId: string;
  candidateType: string;
  rating: "positive" | "negative";
  reasons?: string[];
  comment?: string;
  timestamp?: number;
}

interface SecurityLogItem {
  eventType: string;
  severity: string;
  ip?: string;
  endpoint?: string;
  timestamp?: string | number;
  details?: Record<string, any>;
}

function AdminTelemetryContent() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [feedbackList, setFeedbackList] = useState<FeedbackEntry[]>([]);
  const [feedbackSummary, setFeedbackSummary] = useState<{
    total?: number;
    positive?: number;
    negative?: number;
    positiveRate?: number;
  } | null>(null);
  const [adminStats, setAdminStats] = useState<{
    uptime?: number;
    nodeVersion?: string;
    memoryUsage?: { rss?: number; heapUsed?: number };
  } | null>(null);
  const [securityLogs, setSecurityLogs] = useState<SecurityLogItem[]>([]);
  const [adminAuthStatus, setAdminAuthStatus] = useState<"checking" | "authorized" | "standard">("checking");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadTelemetry = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [hRes, fRes, aRes] = await Promise.all([
        fetch("/api/health").catch(() => null),
        fetch("/api/search/feedback").catch(() => null),
        fetch("/api/admin").catch(() => null),
      ]);

      if (hRes && hRes.ok) {
        const hJson = await hRes.json();
        setHealth(hJson);
      }

      if (fRes && fRes.ok) {
        const fJson = await fRes.json();
        setFeedbackList(Array.isArray(fJson.feedback) ? fJson.feedback : []);
        setFeedbackSummary(fJson.summary || null);
      }

      if (aRes && aRes.ok) {
        const aJson = await aRes.json();
        if (aJson.status === "authorized") {
          setAdminAuthStatus("authorized");
          setAdminStats(aJson.systemStats || null);
          setSecurityLogs(Array.isArray(aJson.recentSecurityLogs) ? aJson.recentSecurityLogs : []);
        } else {
          setAdminAuthStatus("standard");
        }
      } else {
        setAdminAuthStatus("standard");
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTelemetry();
  }, [loadTelemetry]);

  const providers = health?.providers ? Object.entries(health.providers) : [];
  const onlineCount = providers.filter(([, p]) => p.online).length;
  const totalFeedback = feedbackSummary?.total ?? feedbackList.length;
  const positiveCount =
    feedbackSummary?.positive ??
    feedbackList.filter((f) => f.rating === "positive").length;
  const positivePct =
    totalFeedback > 0 ? Math.round((positiveCount / totalFeedback) * 100) : 100;

  return (
    <WorkspaceShell pageTitle="Operations & Telemetry">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header Bar */}
        <section className="obsidian-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-sky-400" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                Obsidian Operations Center
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">
              System Telemetry &amp; Retrieval Audit
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time readiness across all 7 search APIs, active LLM routing, and user feedback telemetry.
            </p>
          </div>

          <button
            type="button"
            onClick={loadTelemetry}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh Telemetry
          </button>
        </section>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="obsidian-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Live Search Providers</span>
              <Server className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="font-mono text-2xl font-bold text-slate-100 mt-2 tabular-nums">
              {onlineCount} / {providers.length || 7}
            </div>
            <p className="text-[11px] text-emerald-400 mt-1">Upstream registries reachable</p>
          </div>

          <div className="obsidian-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Active AI Copilot Model</span>
              <Cpu className="w-4 h-4 text-sky-400" />
            </div>
            <div className="font-mono text-base font-bold text-sky-300 mt-2 truncate">
              {health?.llm?.model || health?.llm?.activeProvider || "Loading..."}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Fallback Ready: {health?.llm?.hasFallbackLlm ? "Yes" : "Primary Only"}
            </p>
          </div>

          <div className="obsidian-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Feedback Approval Rate</span>
              <ThumbsUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="font-mono text-2xl font-bold text-emerald-300 mt-2 tabular-nums">
              {positivePct}%
            </div>
            <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
              {totalFeedback} total candidate evaluations
            </p>
          </div>

          <div className="obsidian-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Runtime Status</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="font-mono text-2xl font-bold text-slate-100 mt-2 tabular-nums">
              {adminStats?.uptime ? `${Math.round(adminStats.uptime)}s` : "Online"}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {adminAuthStatus === "authorized"
                ? `SUPER_ADMIN (${adminStats?.nodeVersion || "Node"})`
                : "Standard Telemetry Scope"}
            </p>
          </div>
        </div>

        {/* Provider Health Matrix */}
        <section className="obsidian-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100">
              Provider Health &amp; API Key Configuration Matrix
            </h2>
            <span className="font-mono text-[11px] text-slate-500">
              Non-secret flags via /api/health
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {providers.map(([key, item]) => (
              <div
                key={key}
                className="p-3.5 rounded-xl bg-[#07090E] border border-white/[0.07] flex items-center justify-between gap-2"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-100">{item.label}</div>
                  <div className="font-mono text-[10px] text-slate-500 mt-0.5">
                    {item.enhancedRateLimit
                      ? "10 RPS Enhanced"
                      : item.optionalKey
                      ? "Public Pool"
                      : item.online
                      ? "Authenticated"
                      : "Key Unset"}
                  </div>
                </div>
                {item.online ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-semibold">
                    <XCircle className="w-3 h-3" /> Limited
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* User Feedback Telemetry Table */}
        <section className="obsidian-card overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-bold text-slate-100">
                Candidate Relevance Feedback Telemetry
              </h2>
            </div>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              {feedbackList.length} logged events
            </span>
          </div>

          {feedbackList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No candidate feedback events logged in the current server process yet. Use the feedback controls on Explore cards or Copilot messages to populate telemetry.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0A0D14] border-b border-white/[0.07] text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Rating</th>
                    <th className="py-3 px-4">Candidate</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Query Context</th>
                    <th className="py-3 px-4">Reasons / Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {feedbackList.slice(0, 30).map((f, idx) => (
                    <tr key={f.id || idx} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4">
                        {f.rating === "positive" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold">
                            <ThumbsUp className="w-3 h-3" /> Positive
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-semibold">
                            <ThumbsDown className="w-3 h-3" /> Negative
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-200 max-w-[180px] truncate">
                        {f.candidateId}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] uppercase text-sky-300">
                        {f.candidateType}
                      </td>
                      <td className="py-3 px-4 text-slate-300 max-w-[240px] truncate">
                        {f.query}
                      </td>
                      <td className="py-3 px-4 text-slate-400 max-w-[260px] truncate">
                        {[...(f.reasons || []), f.comment].filter(Boolean).join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Super Admin Security Logs */}
        {adminAuthStatus === "authorized" && (
          <section className="obsidian-card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.07] flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-slate-100">
                Security Audit Stream (SUPER_ADMIN)
              </h2>
            </div>
            <div className="divide-y divide-white/[0.06] text-xs font-mono">
              {securityLogs.length === 0 ? (
                <div className="p-5 text-slate-500">Zero security warnings logged.</div>
              ) : (
                securityLogs.slice(0, 20).map((log, i) => (
                  <div key={i} className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 text-[10px]">
                        {log.severity}
                      </span>
                      <span className="text-slate-200">{log.eventType}</span>
                    </div>
                    <span className="text-slate-500 text-[11px]">
                      {log.endpoint || "/"} &bull; {log.ip || "local"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </div>
    </WorkspaceShell>
  );
}

export default function AdminDashboardPage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#07090E] flex items-center justify-center text-xs font-mono text-slate-400">
            Loading Operations Console...
          </div>
        }
      >
        <AdminTelemetryContent />
      </Suspense>
    </ErrorBoundary>
  );
}
