"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Compass,
  GitCompareArrows,
  Map,
  History,
  Settings,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
  X,
  ChevronDown,
  Activity,
  Cpu,
  LogIn,
} from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useSearchSession } from "@/context/SearchSessionContext";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { QuickSettingsModal } from "@/components/modals/QuickSettingsModal";
import { TRENDING_TEMPLATES } from "@/fixtures/trending-templates";

interface LeftNavigationRailProps {
  onSelectSearch?: (query: string) => void;
  onNewSearch?: () => void;
}

export function LeftNavigationRail({ onSelectSearch, onNewSearch }: LeftNavigationRailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const {
    isRailCollapsed,
    setIsRailCollapsed,
    isMobileRailOpen,
    setIsMobileRailOpen,
    providerHealth,
    quotaUsage,
  } = useWorkspace();
  const { query: currentQuery, pinnedAssets, loadTemplate, activeTemplate } = useSearchSession();
  const { recentSearches, removeSearch } = useRecentSearches();

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);
  const [guestUsed, setGuestUsed] = useState(0);

  useEffect(() => {
    try {
      const c = parseInt(localStorage.getItem("anon_search_count") || "0", 10);
      setGuestUsed(isNaN(c) ? 0 : c);
    } catch {}
  }, [currentQuery]);

  const userInitial = session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || "G";
  const userName = session?.user?.name || session?.user?.email?.split("@")[0] || "Guest Researcher";
  const isAdmin =
    (session?.user as any)?.role === "ADMIN" || (session?.user as any)?.role === "SUPER_ADMIN";

  const usedCount = session?.user ? (quotaUsage?.todayCount ?? 0) : guestUsed;
  const totalLimit = session?.user ? (quotaUsage?.dailyLimit ?? 50) : 3;
  const quotaPct = Math.min(100, Math.round((usedCount / Math.max(1, totalLimit)) * 100));

  const navItems = [
    {
      href: "/explore",
      label: "Explore",
      shortcut: "⌘1",
      icon: Compass,
      match: (p: string) => p === "/explore",
      badge: null as number | null,
    },
    {
      href: "/benchmark",
      label: "Benchmark Matrix",
      shortcut: "⌘2",
      icon: GitCompareArrows,
      match: (p: string) => p.startsWith("/benchmark") || p.startsWith("/search"),
      badge: pinnedAssets.length > 0 ? pinnedAssets.length : null,
    },
    {
      href: "/roadmap",
      label: "Roadmap & Code",
      shortcut: "⌘3",
      icon: Map,
      match: (p: string) => p.startsWith("/roadmap"),
      badge: null as number | null,
    },
    {
      href: "/settings?tab=Usage",
      label: "History & Saved",
      shortcut: "⌘4",
      icon: History,
      match: (p: string) => p === "/settings",
      badge: recentSearches.length > 0 ? Math.min(recentSearches.length, 99) : null,
    },
  ];

  const handleRecentClick = (q: string, closeMobile = false) => {
    if (closeMobile) setIsMobileRailOpen(false);
    if (onSelectSearch) {
      onSelectSearch(q);
    } else {
      router.push(`/explore?q=${encodeURIComponent(q)}`);
    }
  };

  const handleNewClick = (closeMobile = false) => {
    if (closeMobile) setIsMobileRailOpen(false);
    if (onNewSearch) {
      onNewSearch();
    } else {
      router.push("/explore");
    }
  };

  const providersList = [
    { key: "HF", label: "Hugging Face", online: providerHealth?.providers?.huggingface?.online ?? true },
    { key: "KG", label: "Kaggle", online: providerHealth?.providers?.kaggle?.online ?? true },
    { key: "OA", label: "OpenAlex", online: providerHealth?.providers?.openalex?.online ?? true },
    { key: "AX", label: "arXiv", online: providerHealth?.providers?.arxiv?.online ?? true },
    { key: "PM", label: "PubMed", online: providerHealth?.providers?.pubmed?.online ?? true },
    {
      key: "AI",
      label: providerHealth?.llm?.activeProvider === "gemini" ? "Gemini LLM" : "Open LLM Fallback",
      online: Boolean(providerHealth?.llm?.hasGemini || providerHealth?.llm?.hasFallbackLlm || true),
    },
  ];

  const renderRailBody = (isMobile = false) => {
    const collapsed = !isMobile && isRailCollapsed;

    return (
      <div className="flex flex-col h-full bg-rail text-primary select-none">
        {/* ── Brand & Workspace Switcher ───────────────────────────────── */}
        <div className="h-[52px] px-3 border-b border-subtle flex items-center justify-between gap-2 shrink-0">
          {!collapsed ? (
            <>
              <div className="relative flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setWorkspaceMenuOpen((p) => !p)}
                  className="w-full flex items-center gap-2.5 px-1.5 py-1 rounded-lg hover:bg-card-hover transition-lab text-left group"
                >
                  <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-slate-950 font-black text-xs shadow-accent-sm shrink-0">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-primary truncate tracking-tight">
                        Obsidian Lab
                      </span>
                      <ChevronDown className="w-3 h-3 text-faint group-hover:text-secondary shrink-0" />
                    </div>
                    <span className="block text-[10px] font-mono text-faint truncate -mt-0.5">
                      {activeTemplate?.id ? activeTemplate.id : "ML Workstation"}
                    </span>
                  </div>
                </button>

                {workspaceMenuOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-60 rounded-xl obsidian-card p-1.5 z-50 shadow-2xl">
                    <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-faint border-b border-subtle mb-1">
                      Switch Active Blueprint
                    </div>
                    {TRENDING_TEMPLATES.slice(0, 4).map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          loadTemplate(tpl.id);
                          setWorkspaceMenuOpen(false);
                          if (isMobile) setIsMobileRailOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-lab ${
                          activeTemplate?.id === tpl.id
                            ? "bg-accent-subtle text-accent-from font-semibold"
                            : "text-secondary hover:bg-card-hover"
                        }`}
                      >
                        <span className="truncate">{tpl.title}</span>
                        <span className="text-[10px] font-mono text-faint uppercase shrink-0">
                          {tpl.domain.split(" ")[0]}
                        </span>
                      </button>
                    ))}
                    <div className="border-t border-subtle mt-1 pt-1">
                      <Link
                        href="/"
                        onClick={() => setWorkspaceMenuOpen(false)}
                        className="block px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-muted hover:text-primary hover:bg-card-hover transition-lab"
                      >
                        Return to Landing Composer →
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {isMobile ? (
                <button
                  type="button"
                  onClick={() => setIsMobileRailOpen(false)}
                  className="w-7 h-7 rounded-lg text-muted hover:text-primary hover:bg-card-hover flex items-center justify-center transition-lab"
                  aria-label="Close navigation"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsRailCollapsed(true)}
                  className="w-7 h-7 rounded-lg text-muted hover:text-primary hover:bg-card-hover flex items-center justify-center transition-lab shrink-0"
                  title="Collapse rail"
                  aria-label="Collapse navigation rail"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsRailCollapsed(false)}
              className="mx-auto w-8 h-8 rounded-lg bg-card-subtle hover:bg-card-hover border border-subtle text-muted hover:text-primary flex items-center justify-center transition-lab"
              title="Expand rail"
              aria-label="Expand navigation rail"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── New Session CTA ──────────────────────────────────────────── */}
        <div className="p-2.5 border-b border-subtle shrink-0">
          {!collapsed ? (
            <button
              type="button"
              onClick={() => handleNewClick(isMobile)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-accent-subtle hover:bg-sky-500/20 border border-accent/40 text-xs font-semibold text-primary transition-lab group"
            >
              <span className="flex items-center gap-2">
                <Plus className="w-3.5 h-3.5 text-accent-from group-hover:rotate-90 transition-transform" />
                <span>New Exploration</span>
              </span>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-page/70 border border-subtle text-muted">
                ⌘K
              </kbd>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleNewClick(isMobile)}
              className="mx-auto w-9 h-9 rounded-xl bg-accent-subtle hover:bg-sky-500/20 border border-accent/40 text-accent-from flex items-center justify-center transition-lab"
              title="New Exploration"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Primary Route Navigation ─────────────────────────────────── */}
        <nav className="p-2 space-y-1 shrink-0" aria-label="Workspace Views">
          {!collapsed && (
            <div className="px-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-faint">
              Workstation
            </div>
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.match(pathname || "");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (isMobile) setIsMobileRailOpen(false);
                }}
                title={collapsed ? `${item.label} (${item.shortcut})` : undefined}
                className={`relative flex items-center ${
                  collapsed ? "justify-center px-0 py-2.5" : "justify-between px-2.5 py-2"
                } rounded-xl text-xs font-medium transition-lab group ${
                  active
                    ? "bg-card-hover text-primary border border-strong shadow-sm"
                    : "text-muted hover:text-primary hover:bg-card-subtle border border-transparent"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-accent" />
                )}
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? "text-accent-from" : "text-muted group-hover:text-secondary"
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </span>
                {!collapsed && (
                  <span className="flex items-center gap-1.5 shrink-0">
                    {typeof item.badge === "number" && (
                      <span className="px-1.5 py-0.2 rounded-md bg-accent-subtle border border-accent/30 text-accent-from font-mono text-[10px] font-semibold tabular-nums">
                        {item.badge}
                      </span>
                    )}
                    <kbd className="text-[10px] font-mono text-faint">{item.shortcut}</kbd>
                  </span>
                )}
              </Link>
            );
          })}

          {/* Secondary Utility Links */}
          <div className="pt-2 mt-2 border-t border-subtle space-y-1">
            <Link
              href="/settings"
              onClick={() => isMobile && setIsMobileRailOpen(false)}
              title={collapsed ? "Settings & Billing" : undefined}
              className={`flex items-center ${
                collapsed ? "justify-center px-0 py-2" : "justify-between px-2.5 py-1.5"
              } rounded-xl text-xs transition-lab ${
                pathname === "/settings"
                  ? "text-primary bg-card-hover"
                  : "text-muted hover:text-primary hover:bg-card-subtle"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Settings className="w-4 h-4 shrink-0" />
                {!collapsed && <span>Settings & Billing</span>}
              </span>
            </Link>

            <Link
              href="/admin"
              onClick={() => isMobile && setIsMobileRailOpen(false)}
              title={collapsed ? "Admin & Telemetry Console" : undefined}
              className={`flex items-center ${
                collapsed ? "justify-center px-0 py-2" : "justify-between px-2.5 py-1.5"
              } rounded-xl text-xs transition-lab ${
                pathname === "/admin"
                  ? "text-primary bg-card-hover"
                  : "text-muted hover:text-primary hover:bg-card-subtle"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                {!collapsed && <span>Telemetry Console</span>}
              </span>
              {!collapsed && isAdmin && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-status-emerald border border-emerald-500/30">
                  ADMIN
                </span>
              )}
            </Link>
          </div>
        </nav>

        {/* ── Scrollable Recent Sessions (when expanded) ───────────────── */}
        {!collapsed ? (
          <div className="flex-1 overflow-y-auto px-2.5 py-2 border-t border-subtle min-h-0 space-y-1">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-faint">
                Recent Sessions
              </span>
              <span className="text-[10px] font-mono text-dimmed tabular-nums">
                {recentSearches.length}
              </span>
            </div>
            {recentSearches.length === 0 ? (
              <p className="px-1.5 py-3 text-[11px] text-faint leading-snug">
                Run a search to persist session history here.
              </p>
            ) : (
              recentSearches.slice(0, 8).map((item) => {
                const isActive =
                  currentQuery && item.query.toLowerCase() === currentQuery.toLowerCase();
                return (
                  <div
                    key={item.id}
                    onClick={() => handleRecentClick(item.query, isMobile)}
                    className={`group flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg text-[11px] cursor-pointer transition-lab ${
                      isActive
                        ? "bg-accent-subtle border border-accent/30 text-primary font-medium"
                        : "text-muted hover:text-primary hover:bg-card-hover border border-transparent"
                    }`}
                  >
                    <span className="truncate flex-1" title={item.query}>
                      {item.query}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSearch(item.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-faint hover:text-status-rose transition"
                      aria-label="Remove history entry"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* ── Bottom Pinned Provider Telemetry & Quota Meter ───────────── */}
        <div className="p-2.5 border-t border-subtle bg-page/60 space-y-2.5 shrink-0">
          {/* Live Provider Telemetry Pill */}
          {!collapsed ? (
            <div className="rounded-xl border border-subtle bg-card p-2.5 space-y-2">
              <button
                type="button"
                onClick={() => setTelemetryExpanded((p) => !p)}
                className="w-full flex items-center justify-between text-left"
              >
                <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted">
                  <Activity className="w-3 h-3 text-status-emerald" />
                  <span>Provider Telemetry</span>
                </span>
                <span className="text-[10px] font-mono text-status-emerald">
                  {providersList.filter((p) => p.online).length}/{providersList.length} LIVE
                </span>
              </button>

              <div className="grid grid-cols-6 gap-1">
                {providersList.map((prov) => (
                  <div
                    key={prov.key}
                    title={`${prov.label}: ${prov.online ? "Online" : "Standby"}`}
                    className="flex flex-col items-center gap-0.5 py-1 rounded-md bg-card-subtle border border-subtle"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        prov.online ? "bg-emerald-400 shadow-[0_0_6px_#10B981]" : "bg-amber-400"
                      }`}
                    />
                    <span className="text-[9px] font-mono text-faint">{prov.key}</span>
                  </div>
                ))}
              </div>

              {telemetryExpanded && (
                <div className="pt-1.5 border-t border-subtle space-y-1 text-[10px] font-mono">
                  {providersList.map((prov) => (
                    <div key={prov.key} className="flex items-center justify-between text-muted">
                      <span>{prov.label}</span>
                      <span className={prov.online ? "text-status-emerald" : "text-status-amber"}>
                        {prov.online ? "READY" : "DEGRADED"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/admin"
              className="mx-auto w-9 h-9 rounded-xl bg-card border border-subtle flex items-center justify-center text-status-emerald hover:border-strong transition-lab"
              title="Live Provider Telemetry"
            >
              <Activity className="w-4 h-4" />
            </Link>
          )}

          {/* Quota Meter Bar */}
          {!collapsed && (
            <div className="px-1 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-faint uppercase">Daily Quota</span>
                <span className="text-secondary tabular-nums font-semibold">
                  {usedCount} / {totalLimit}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-card-subtle border border-subtle overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    quotaPct >= 90
                      ? "bg-rose-500"
                      : quotaPct >= 70
                      ? "bg-amber-500"
                      : "bg-accent"
                  }`}
                  style={{ width: `${Math.max(4, quotaPct)}%` }}
                />
              </div>
            </div>
          )}

          {/* User Profile / Auth Control */}
          {session?.user ? (
            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className={`w-full flex items-center ${
                collapsed ? "justify-center p-1.5" : "gap-2.5 p-2"
              } rounded-xl bg-card hover:bg-card-hover border border-subtle hover:border-strong transition-lab text-left`}
              title="Workspace Profile & Preferences"
            >
              <div className="relative shrink-0">
                <div className="w-7 h-7 rounded-lg bg-accent text-slate-950 font-bold text-xs flex items-center justify-center">
                  {userInitial.toUpperCase()}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-obsidian-950" />
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-primary truncate">{userName}</div>
                  <div className="text-[10px] font-mono text-faint truncate">
                    {quotaUsage?.planName || "Free Researcher"}
                  </div>
                </div>
              )}
            </button>
          ) : (
            <Link
              href="/login"
              className={`w-full flex items-center ${
                collapsed ? "justify-center p-2" : "justify-center gap-2 py-2 px-3"
              } rounded-xl bg-accent-subtle hover:bg-sky-500/20 border border-accent/40 text-xs font-semibold text-accent-from transition-lab`}
              title="Sign in to sync sessions"
            >
              <LogIn className="w-3.5 h-3.5" />
              {!collapsed && <span>Sign In</span>}
            </Link>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Collapsible Rail */}
      <aside
        aria-label="Workspace Navigation Rail"
        className={`hidden md:flex flex-col shrink-0 border-r border-subtle sticky top-0 h-screen z-30 transition-lab ${
          isRailCollapsed ? "w-[64px]" : "w-[230px]"
        }`}
      >
        {renderRailBody(false)}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileRailOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={() => setIsMobileRailOpen(false)}
          />
          <aside className="relative w-[240px] max-w-[82vw] h-full border-r border-subtle z-10 shadow-2xl">
            {renderRailBody(true)}
          </aside>
        </div>
      )}

      <QuickSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />
    </>
  );
}
