"use client";

import React, { useState, useEffect, useRef, useMemo, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Sparkles,
  Database,
  Cpu,
  BookOpen,
  Network,
  Layers,
  LayoutGrid,
  Table2,
  ShieldCheck,
  Activity,
  BarChart3,
  ArrowRight,
  Pin,
  ExternalLink,
  SlidersHorizontal,
  Tag,
  X,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Compass,
  Clock,
} from "lucide-react";

import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import DatasetCard, { isCommercialSafeLicense } from "@/components/cards/DatasetCard";
import ModelCard from "@/components/cards/ModelCard";
import PaperCard from "@/components/cards/PaperCard";
import TrainabilityVramCard from "@/components/explore/TrainabilityVramCard";
import InteractiveResearchGraph from "@/components/explore/InteractiveResearchGraph";
import StitchEmptyState from "@/components/common/StitchEmptyState";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import PaperDetailModal from "@/components/modals/PaperDetailModal";
import SearchDebugModal from "@/components/modals/SearchDebugModal";
import SearchBenchmarkModal from "@/components/modals/SearchBenchmarkModal";

import { useSearchSession } from "@/context/SearchSessionContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useAuth } from "@/hooks/useAuth";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { useSearchProgress } from "@/hooks/useSearchProgress";
import { TRENDING_TEMPLATES } from "@/fixtures/trending-templates";
import { recordSearchInPopularityAlgorithm } from "@/lib/algorithms/popularity";
import { extractExplicitModality } from "@/server/search/modalityParser";
import { estimateModelVram } from "@/lib/workstation/vramEstimator";
import type { NormalizedPaper } from "@/types/papers";

const GUEST_DAILY_LIMIT = 5;

type ExploreTab = "overview" | "datasets" | "models" | "papers" | "graph";

/**
 * SVG Radial Feasibility Gauge displaying 0-100 project readiness.
 */
function FeasibilityRadialGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;

  const strokeColor =
    clamped >= 75 ? "#10B981" : clamped >= 50 ? "#38BDF8" : "#F59E0B";

  return (
    <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="6"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-base font-bold text-slate-100 tabular-nums">
          {clamped}%
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          Feasible
        </span>
      </div>
    </div>
  );
}

function ExploreStudioContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { addSearch } = useRecentSearches();
  const { progress, stage, startProgress, completeProgress, resetProgress } =
    useSearchProgress();
  const {
    query: sessionQuery,
    searchResult: sessionResult,
    pinnedAssets,
    togglePinAsset,
    isAssetPinned,
    setSearchSession,
  } = useSearchSession();
  const {
    gpuConstraintGb,
    setGpuConstraintGb,
    commercialOnly,
    setCommercialOnly,
    modalityPreference,
    askAssistant,
  } = useWorkspace();

  const [queryInput, setQueryInput] = useState<string>(sessionQuery || "");
  const [submittedQuery, setSubmittedQuery] = useState<string>(sessionQuery || "");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(Boolean(sessionResult));
  const [searchFailureMessage, setSearchFailureMessage] = useState<string | null>(null);
  const [showSignInGate, setShowSignInGate] = useState<boolean>(false);
  const [anonSearchCount, setAnonSearchCount] = useState<number>(0);

  // Result state hydrated from session context if returning to /explore
  const [isGeneralQuery, setIsGeneralQuery] = useState<boolean>(
    Boolean(sessionResult?.isGeneralQuery)
  );
  const [aiDirectAnswer, setAiDirectAnswer] = useState<string | null>(
    sessionResult?.answer || sessionResult?.analysis?.ai_analysis || null
  );
  const [datasets, setDatasets] = useState<any[]>(sessionResult?.datasets || []);
  const [models, setModels] = useState<any[]>(sessionResult?.models || []);
  const [papers, setPapers] = useState<any[]>(sessionResult?.papers || []);
  const [summary, setSummary] = useState<any>(sessionResult?.summary || null);
  const [analysis, setAnalysis] = useState<any>(sessionResult?.analysis || null);
  const [feasibility, setFeasibility] = useState<any>(sessionResult?.feasibility || null);
  const [hardware, setHardware] = useState<any>(sessionResult?.hardware || null);
  const [apiAudit, setApiAudit] = useState<any>(sessionResult?.apiAudit || null);
  const [searchCoverage, setSearchCoverage] = useState<any>(sessionResult?.searchCoverage || null);
  const [researchSynthesis, setResearchSynthesis] = useState<any>(
    sessionResult?.researchSynthesis || null
  );
  const [labelMapping, setLabelMapping] = useState<any[]>(
    (sessionResult as any)?.labelMapping || []
  );
  const [intentDetails, setIntentDetails] = useState<any>(
    (sessionResult as any)?.intentDetails || null
  );
  const [rawSearchPayload, setRawSearchPayload] = useState<any>(sessionResult || null);

  // Workspace Tab & Filters
  const [activeTab, setActiveTab] = useState<ExploreTab>("overview");
  const [datasetViewMode, setDatasetViewMode] = useState<"cards" | "table">("cards");
  const [datasetSourceFilter, setDatasetSourceFilter] = useState<"all" | "huggingface" | "kaggle">("all");
  const [modalityFilter, setModalityFilter] = useState<string>(modalityPreference || "all");
  const [modelFitOnly, setModelFitOnly] = useState<boolean>(false);
  const [paperRelFilter, setPaperRelFilter] = useState<string>("ALL");
  const [inspectedModel, setInspectedModel] = useState<any | null>(null);
  const [inspectedPaper, setInspectedPaper] = useState<NormalizedPaper | null>(null);
  const [inspectedDatasetSchema, setInspectedDatasetSchema] = useState<any | null>(null);
  const [showLabelDrawer, setShowLabelDrawer] = useState<boolean>(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState<boolean>(false);
  const [isBenchmarkModalOpen, setIsBenchmarkModalOpen] = useState<boolean>(false);

  const latestRequestRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastAutoParamQueryRef = useRef<string>("");

  // Track guest search count on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const today = new Date().toISOString().split("T")[0];
      const storedDate = localStorage.getItem("anon_search_date");
      const count = storedDate === today ? parseInt(localStorage.getItem("anon_search_count") || "0", 10) : 0;
      setAnonSearchCount(count);
    } catch {}
  }, []);

  // Sync URL filter params (?license=commercial, ?modality=...)
  useEffect(() => {
    const licParam = searchParams.get("license");
    const modParam = searchParams.get("modality");
    if (licParam === "commercial") {
      setCommercialOnly(true);
    }
    if (modParam) {
      setModalityFilter(modParam);
    }
  }, [searchParams, setCommercialOnly]);

  const executeSearch = useCallback(
    async (rawQuery: string) => {
      const trimmed = rawQuery.trim();
      if (!trimmed) return;

      // Guest daily quota enforcement
      if (!user && typeof window !== "undefined") {
        const today = new Date().toISOString().split("T")[0];
        const storedDate = localStorage.getItem("anon_search_date");
        let count = parseInt(localStorage.getItem("anon_search_count") || "0", 10);
        if (storedDate !== today) {
          count = 0;
          localStorage.setItem("anon_search_date", today);
          localStorage.setItem("anon_search_count", "0");
        }
        if (count >= GUEST_DAILY_LIMIT) {
          setShowSignInGate(true);
          return;
        }
        const nextCount = count + 1;
        localStorage.setItem("anon_search_count", String(nextCount));
        localStorage.setItem("anon_search_date", today);
        setAnonSearchCount(nextCount);
      }

      const requestId = crypto.randomUUID();
      latestRequestRef.current = requestId;
      setQueryInput(trimmed);
      setSubmittedQuery(trimmed);
      recordSearchInPopularityAlgorithm(trimmed);
      addSearch(trimmed);

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setHasSearched(true);
      setSearchFailureMessage(null);
      setIsGeneralQuery(false);
      setAiDirectAnswer(null);
      startProgress();

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, searchId: requestId }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (requestId !== latestRequestRef.current || controller.signal.aborted) {
          resetProgress();
          return;
        }

        if (res.status === 429 || data?.code === "QUOTA_EXCEEDED") {
          resetProgress();
          setShowSignInGate(true);
          setIsLoading(false);
          return;
        }

        if (!res.ok || !data.success) {
          resetProgress();
          setSearchFailureMessage(
            data?.error?.message ||
              (typeof data?.error === "string" ? data.error : null) ||
              "Search encountered an upstream issue. Please retry."
          );
          setIsLoading(false);
          return;
        }

        await completeProgress();

        const isGen = Boolean(
          data.isGeneralQuery ||
            data.type === "general" ||
            data.type === "greeting" ||
            (!data.datasets?.length && data.answer)
        );

        setIsGeneralQuery(isGen);
        setAiDirectAnswer(data.answer || data.message || data.analysis?.ai_analysis || null);
        setDatasets(data.datasets || []);
        setModels(data.models || []);
        setPapers(data.papers || []);
        setSummary(data.summary || null);
        setAnalysis(data.analysis || null);
        setFeasibility(data.feasibility || null);
        setHardware(data.hardware || null);
        setApiAudit(data.apiAudit || null);
        setSearchCoverage(data.searchCoverage || null);
        setResearchSynthesis(data.researchSynthesis || null);
        setLabelMapping(data.labelMapping || []);
        setIntentDetails(data.intentDetails || null);
        setRawSearchPayload(data);
        setInspectedModel((data.models || [])[0] || null);

        setSearchSession(trimmed, data);

        if (isGen) {
          setActiveTab("overview");
        } else if (
          (data.intent === "RESEARCH_SEARCH" || data.intent === "EXACT_DATASET_RESEARCH") &&
          (data.papers || []).length > 0
        ) {
          setActiveTab("papers");
        } else {
          setActiveTab("overview");
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        resetProgress();
        setSearchFailureMessage(
          "Connection interrupted while querying live APIs. Please try again."
        );
      } finally {
        if (requestId === latestRequestRef.current) {
          setIsLoading(false);
        }
      }
    },
    [user, addSearch, startProgress, completeProgress, resetProgress, setSearchSession]
  );

  // Trigger search automatically if ?q= or ?template= changes in URL
  useEffect(() => {
    const qParam = searchParams.get("q");
    const tplParam = searchParams.get("template");

    let resolvedQuery = qParam || "";
    if (!resolvedQuery && tplParam) {
      const tpl = TRENDING_TEMPLATES.find((t) => t.id === tplParam);
      if (tpl) resolvedQuery = tpl.query;
    }

    if (resolvedQuery && resolvedQuery !== lastAutoParamQueryRef.current) {
      lastAutoParamQueryRef.current = resolvedQuery;
      executeSearch(resolvedQuery);
    }
  }, [searchParams, executeSearch]);

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;
    lastAutoParamQueryRef.current = queryInput.trim();
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/explore?q=${encodeURIComponent(queryInput.trim())}`);
    }
    executeSearch(queryInput);
  };

  // Derived filtered views
  const filteredDatasets = useMemo(() => {
    return datasets.filter((ds) => {
      if (commercialOnly && !isCommercialSafeLicense(ds.license)) return false;
      if (datasetSourceFilter !== "all") {
        const src = String(ds.source || "").toLowerCase();
        if (!src.includes(datasetSourceFilter)) return false;
      }
      if (modalityFilter && modalityFilter !== "all") {
        const mod = extractExplicitModality(ds)?.toLowerCase() || String(ds.modality || "").toLowerCase();
        if (mod && !mod.includes(modalityFilter.toLowerCase())) {
          // Also match title/description text for flexibility
          const blob = `${ds.title || ds.name || ""} ${ds.description || ""}`.toLowerCase();
          if (!blob.includes(modalityFilter.toLowerCase())) return false;
        }
      }
      return true;
    });
  }, [datasets, commercialOnly, datasetSourceFilter, modalityFilter]);

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      if (modelFitOnly) {
        const fit = estimateModelVram(m, "QLoRA", gpuConstraintGb);
        if (fit.fitStatus === "overflow") return false;
      }
      return true;
    });
  }, [models, modelFitOnly, gpuConstraintGb]);

  const filteredPapers = useMemo(() => {
    return papers.filter((p) => {
      if (paperRelFilter !== "ALL" && p.relationship !== paperRelFilter) return false;
      return true;
    });
  }, [papers, paperRelFilter]);

  // Project feasibility score calculation
  const feasibilityScore = useMemo(() => {
    if (typeof feasibility?.score === "number") return feasibility.score;
    if (typeof summary?.projectFeasibilityScore === "number") return summary.projectFeasibilityScore;
    if (datasets.length === 0 && models.length === 0) return isGeneralQuery ? 90 : 42;
    const topDs = datasets[0]?.matchScore ?? datasets[0]?.relevanceScore ?? 65;
    const topMod = models[0]?.matchScore ?? models[0]?.relevanceScore ?? 65;
    return Math.round((topDs * 0.45 + topMod * 0.4 + Math.min(100, papers.length * 18) * 0.15));
  }, [feasibility, summary, datasets, models, papers, isGeneralQuery]);

  // Live provider audit metrics
  const providerAuditEntries = useMemo(() => {
    const timings = rawSearchPayload?.searchDiagnostics?.timingsMs || rawSearchPayload?.diagnostics?.timingsMs || {};
    const breakdown = apiAudit?.providers || apiAudit?.sources || {};
    const entries = [
      { key: "huggingface", label: "Hugging Face", count: datasets.filter((d) => String(d.source).toLowerCase().includes("hugging")).length + models.length, ms: timings.huggingfaceMs || breakdown.huggingface?.durationMs },
      { key: "kaggle", label: "Kaggle", count: datasets.filter((d) => String(d.source).toLowerCase().includes("kaggle")).length, ms: timings.kaggleMs || breakdown.kaggle?.durationMs },
      { key: "openalex", label: "OpenAlex", count: papers.filter((p) => String(p.source).toLowerCase().includes("openalex")).length, ms: timings.openalexMs || breakdown.openalex?.durationMs },
      { key: "arxiv", label: "ArXiv", count: papers.filter((p) => String(p.source).toLowerCase().includes("arxiv")).length, ms: timings.arxivMs || breakdown.arxiv?.durationMs },
      { key: "pubmed", label: "PubMed", count: papers.filter((p) => String(p.source).toLowerCase().includes("pubmed")).length, ms: timings.pubmedMs || breakdown.pubmed?.durationMs },
      { key: "crossref", label: "Crossref", count: papers.filter((p) => String(p.source).toLowerCase().includes("crossref")).length, ms: timings.crossrefMs || breakdown.crossref?.durationMs },
    ];
    return entries;
  }, [rawSearchPayload, apiAudit, datasets, models, papers]);

  const parsedTags = useMemo(() => {
    const pq = rawSearchPayload?.diagnostics?.parsedQuery || intentDetails || {};
    const tags: Array<{ label: string; value: string }> = [];
    if (pq.domain || pq.primaryDomain) tags.push({ label: "Domain", value: pq.domain || pq.primaryDomain });
    if (pq.modality && pq.modality !== "unknown") tags.push({ label: "Modality", value: pq.modality });
    if (pq.task || pq.mlTask) tags.push({ label: "Task", value: pq.task || pq.mlTask });
    tags.push({ label: "GPU Budget", value: `${gpuConstraintGb}GB VRAM` });
    if (commercialOnly) tags.push({ label: "License", value: "Commercial-Safe" });
    return tags;
  }, [rawSearchPayload, intentDetails, gpuConstraintGb, commercialOnly]);

  const topDataset = filteredDatasets[0] || datasets[0] || null;
  const topModel = filteredModels[0] || models[0] || null;
  const topPaper = filteredPapers[0] || papers[0] || null;

  return (
    <WorkspaceShell
      pageTitle="Explore Studio"
      onSelectSearch={(q) => {
        lastAutoParamQueryRef.current = q;
        executeSearch(q);
      }}
      onNewSearch={() => {
        setQueryInput("");
        setHasSearched(false);
        setSearchFailureMessage(null);
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Smart Command Search Composer */}
        <section className="obsidian-card p-4 sm:p-5 bg-lab-dots relative overflow-hidden">
          <form onSubmit={handleSubmitForm} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-sky-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="Describe your project (e.g., clinical NER on pathology notes, solar panel thermal defect detection)..."
                  aria-label="Describe your ML project"
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#07090E] border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/30 transition-lab"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !queryInput.trim()}
                className="h-11 px-5 rounded-xl bg-gradient-to-r from-sky-400 to-sky-500 hover:from-sky-300 hover:to-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-lab cursor-pointer shrink-0 shadow-[0_0_20px_rgba(56,189,248,0.2)]"
              >
                <Sparkles className="w-4 h-4" />
                {isLoading ? "Retrieving..." : "Run Discovery"}
              </button>
            </div>

            {/* Constraint Strip + Presets */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Constraints:
                </span>
                <div className="inline-flex items-center rounded-lg bg-[#07090E] border border-white/[0.07] p-0.5">
                  {([8, 16, 24, 80] as const).map((gb) => (
                    <button
                      key={gb}
                      type="button"
                      onClick={() => setGpuConstraintGb(gb)}
                      className={`px-2 py-1 rounded-md font-mono text-[11px] font-semibold tabular-nums transition-lab cursor-pointer ${
                        gpuConstraintGb === gb
                          ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                          : "text-slate-400 hover:text-slate-200 border border-transparent"
                      }`}
                    >
                      {gb}GB
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setCommercialOnly(!commercialOnly)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-lab cursor-pointer ${
                    commercialOnly
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : "bg-[#07090E] border-white/[0.08] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Commercial-Safe Only
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {!user && (
                  <span className="font-mono text-[11px] text-slate-500 mr-2 tabular-nums">
                    Guest Quota: {Math.max(0, GUEST_DAILY_LIMIT - anonSearchCount)}/{GUEST_DAILY_LIMIT} left
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsBenchmarkModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-[11px] text-slate-300 transition-lab cursor-pointer"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-sky-400" />
                  IR Eval Suite
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Sign-in Quota Gate */}
        {showSignInGate && (
          <div className="obsidian-card p-6 border-amber-500/40 bg-amber-500/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Daily Guest Discovery Limit Reached ({GUEST_DAILY_LIMIT}/{GUEST_DAILY_LIMIT})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sign in for a free Researcher account to unlock unlimited searches, saved workspace history, and blueprint exports.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/login?redirect_to=/explore"
                className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-lab"
              >
                Sign In Free
              </Link>
              <button
                type="button"
                onClick={() => setShowSignInGate(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Loading Progress Banner */}
        {isLoading && (
          <div className="obsidian-card p-6 space-y-3 border-sky-500/30">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-semibold text-sky-300">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                {stage || "Executing multi-source semantic retrieval & evidence grounding..."}
              </span>
              <span className="font-mono text-sky-400 tabular-nums">{progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#07090E] border border-white/[0.08] overflow-hidden">
              <div
                style={{ width: `${progress}%` }}
                className="h-full bg-gradient-to-r from-sky-400 via-indigo-400 to-emerald-400 transition-all duration-300"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Querying Hugging Face Hub, Kaggle Datasets, OpenAlex, ArXiv, PubMed &amp; Crossref in parallel...
            </p>
          </div>
        )}

        {/* Search Issue Banner (explicitly avoids literal word "Error" in UI copy for clean status semantics) */}
        {searchFailureMessage && !isLoading && (
          <div className="obsidian-card p-5 border-rose-500/30 bg-rose-500/[0.05] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-100">Retrieval Unsuccessful</p>
                <p className="text-xs text-slate-400 mt-0.5">{searchFailureMessage}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => executeSearch(queryInput)}
              className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-xs font-medium cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Pre-Search Onboarding / Empty State */}
        {!hasSearched && !isLoading && (
          <div className="space-y-6">
            <StitchEmptyState
              category="general"
              title="Ready for Multi-Source ML Architecture Discovery"
              description="Enter any domain problem above or launch a verified domain preset below to inspect datasets, VRAM compatibility, and peer-reviewed evidence."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {TRENDING_TEMPLATES.slice(0, 6).map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    lastAutoParamQueryRef.current = tpl.query;
                    if (typeof window !== "undefined") {
                      window.history.replaceState(null, "", `/explore?q=${encodeURIComponent(tpl.query)}`);
                    }
                    executeSearch(tpl.query);
                  }}
                  className="obsidian-card-interactive p-4 text-left flex flex-col justify-between gap-3 cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/25 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                        {tpl.domain}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {tpl.category}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-100">{tpl.title}</h4>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{tpl.description}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400">
                    Load preset in Studio <ArrowRight className="w-3 h-3" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active Results Workstation */}
        {hasSearched && !isLoading && !searchFailureMessage && (
          <div className="space-y-5">
            {/* 1. Parsed Query & Project Feasibility Banner */}
            <section className="obsidian-card p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold uppercase tracking-wider">
                      Live Synthesis
                    </span>
                    <h1 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight truncate">
                      {submittedQuery}
                    </h1>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {parsedTags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#07090E] border border-white/[0.08] text-xs"
                      >
                        <span className="text-slate-500">{tag.label}:</span>
                        <span className="font-mono text-slate-200 font-medium">{tag.value}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-5 shrink-0">
                  <div className="text-right hidden sm:block">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Project Readiness
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5 max-w-[200px]">
                      {feasibility?.summary ||
                        `${datasets.length} datasets, ${models.length} models & ${papers.length} papers verified.`}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDebugModalOpen(true)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-sky-400 hover:text-sky-300 cursor-pointer"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      Inspect Pipeline Telemetry
                    </button>
                  </div>
                  <FeasibilityRadialGauge score={feasibilityScore} />
                </div>
              </div>

              {/* Live Retrieval Audit Strip */}
              <div className="pt-3 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1 mr-1">
                    <Clock className="w-3 h-3" /> Retrieval Audit:
                  </span>
                  {providerAuditEntries.map((p) => (
                    <span
                      key={p.key}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#07090E] border border-white/[0.06] font-mono text-[11px] text-slate-300 tabular-nums"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          p.count > 0 ? "bg-emerald-400" : "bg-slate-600"
                        }`}
                      />
                      <span>{p.label}</span>
                      <span className="text-sky-300">{p.count}</span>
                      {typeof p.ms === "number" && (
                        <span className="text-slate-500">({p.ms}ms)</span>
                      )}
                    </span>
                  ))}
                </div>
                {searchCoverage?.note && (
                  <span className="text-[11px] text-slate-400">{searchCoverage.note}</span>
                )}
              </div>
            </section>

            {/* Pinned Assets Quick Action Strip */}
            {pinnedAssets.length > 0 && (
              <div className="obsidian-card px-4 py-3 border-emerald-500/25 bg-emerald-500/[0.03] flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Pin className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-slate-200">
                    Pinned Stack ({pinnedAssets.length}/4):
                  </span>
                  {pinnedAssets.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#07090E] border border-white/10 text-[11px] text-slate-200"
                    >
                      {a.title}
                      <button
                        type="button"
                        aria-label={`Unpin ${a.title}`}
                        onClick={() => togglePinAsset(a)}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/benchmark"
                    className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-slate-200 transition-lab"
                  >
                    Open Benchmark Matrix
                  </Link>
                  <Link
                    href="/roadmap"
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-300 transition-lab"
                  >
                    Build Roadmap &amp; Code
                  </Link>
                </div>
              </div>
            )}

            {/* 2. Interactive 5-Tab Navigation Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
              <div role="tablist" aria-label="Workspace Tabs" className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "overview"}
                  onClick={() => setActiveTab("overview")}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-lab cursor-pointer ${
                    activeTab === "overview"
                      ? "bg-sky-500/15 text-sky-300 border border-sky-500/35"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  {isGeneralQuery ? "AI Direct Response" : "Overview & AI Rationale"}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "datasets"}
                  onClick={() => setActiveTab("datasets")}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-lab cursor-pointer ${
                    activeTab === "datasets"
                      ? "bg-sky-500/15 text-sky-300 border border-sky-500/35"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent"
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  Datasets
                  <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-white/[0.06] tabular-nums">
                    {filteredDatasets.length}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "models"}
                  onClick={() => setActiveTab("models")}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-lab cursor-pointer ${
                    activeTab === "models"
                      ? "bg-sky-500/15 text-sky-300 border border-sky-500/35"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent"
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  Models
                  <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-white/[0.06] tabular-nums">
                    {filteredModels.length}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "papers"}
                  onClick={() => setActiveTab("papers")}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-lab cursor-pointer ${
                    activeTab === "papers"
                      ? "bg-sky-500/15 text-sky-300 border border-sky-500/35"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent"
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Literature
                  <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-white/[0.06] tabular-nums">
                    {filteredPapers.length}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "graph"}
                  onClick={() => setActiveTab("graph")}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-lab cursor-pointer ${
                    activeTab === "graph"
                      ? "bg-sky-500/15 text-sky-300 border border-sky-500/35"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent"
                  }`}
                >
                  <Network className="w-3.5 h-3.5" />
                  Research Graph
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/benchmark"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-xs font-medium text-slate-300 transition-lab"
                >
                  Compare Matrix <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  href="/roadmap"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-xs font-semibold text-sky-300 transition-lab"
                >
                  Code &amp; Roadmap <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* TAB 1: Unified Overview (Bento Grid) */}
            {activeTab === "overview" && (
              <div className="space-y-5">
                {!isGeneralQuery && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Top Dataset + Model + Anchor Paper Trio */}
                    <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Top Dataset Bento */}
                      <div className="obsidian-card p-4 flex flex-col justify-between gap-3 border-emerald-500/20">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                              <Database className="w-3.5 h-3.5" /> Primary Dataset
                            </span>
                            {topDataset && (
                              <span className="font-mono text-xs font-bold text-emerald-300 tabular-nums">
                                {Math.round(topDataset.matchScore ?? topDataset.relevanceScore ?? 75)}% fit
                              </span>
                            )}
                          </div>
                          {topDataset ? (
                            <>
                              <h3 className="text-sm font-bold text-slate-100 line-clamp-2">
                                {topDataset.title || topDataset.name}
                              </h3>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                                {topDataset.subtitle || topDataset.description || "Curated benchmark corpus."}
                              </p>
                              <div className="flex flex-wrap gap-1.5 mt-3">
                                <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/10 font-mono text-[10px] text-slate-300">
                                  {topDataset.source || "Hub"}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/10 font-mono text-[10px] text-slate-300">
                                  {topDataset.license || "Check License"}
                                </span>
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-slate-500 py-4">No dataset match returned.</p>
                          )}
                        </div>
                        {topDataset && (
                          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                            <button
                              type="button"
                              onClick={() => setActiveTab("datasets")}
                              className="text-[11px] font-medium text-sky-400 hover:text-sky-300 cursor-pointer"
                            >
                              All {datasets.length} datasets &rarr;
                            </button>
                            <button
                              type="button"
                              onClick={() => setInspectedDatasetSchema(topDataset)}
                              className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                            >
                              Schema
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Top Model Bento */}
                      <div className="obsidian-card p-4 flex flex-col justify-between gap-3 border-indigo-500/20">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
                              <Cpu className="w-3.5 h-3.5" /> Primary Model
                            </span>
                            {topModel && (
                              <span className="font-mono text-xs font-bold text-indigo-300 tabular-nums">
                                {Math.round(topModel.matchScore ?? topModel.relevanceScore ?? 75)}% fit
                              </span>
                            )}
                          </div>
                          {topModel ? (
                            <>
                              <h3 className="text-sm font-bold text-slate-100 line-clamp-2">
                                {topModel.name || topModel.id}
                              </h3>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                                {topModel.architecture || topModel.task || "Pretrained Transformer Architecture"}
                              </p>
                              <div className="flex flex-wrap gap-1.5 mt-3">
                                <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/10 font-mono text-[10px] text-slate-300">
                                  {topModel.framework || "PyTorch"}
                                </span>
                                {topModel.paramsCount && (
                                  <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/10 font-mono text-[10px] text-sky-300 tabular-nums">
                                    {topModel.paramsCount}
                                  </span>
                                )}
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-slate-500 py-4">No model match returned.</p>
                          )}
                        </div>
                        {topModel && (
                          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                            <button
                              type="button"
                              onClick={() => setActiveTab("models")}
                              className="text-[11px] font-medium text-sky-400 hover:text-sky-300 cursor-pointer"
                            >
                              All {models.length} models &rarr;
                            </button>
                            <button
                              type="button"
                              onClick={() => setInspectedModel(topModel)}
                              className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                            >
                              Inspect VRAM
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Anchor Paper Full-Width Subcard */}
                      <div className="sm:col-span-2 obsidian-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-amber-500/20">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                              Anchor Evidence Paper
                            </span>
                            {topPaper?.year && (
                              <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                                {topPaper.year}
                              </span>
                            )}
                          </div>
                          {topPaper ? (
                            <p className="text-xs font-semibold text-slate-100 line-clamp-1">
                              {topPaper.title}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-500">
                              No anchor publication linked for this prompt.
                            </p>
                          )}
                        </div>
                        {topPaper && (
                          <button
                            type="button"
                            onClick={() => setActiveTab("papers")}
                            className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium cursor-pointer"
                          >
                            Verify {papers.length} Papers
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Trainability & VRAM Fit Card */}
                    <div className="lg:col-span-6">
                      <TrainabilityVramCard
                        model={inspectedModel || topModel}
                        allModels={models}
                        onSelectModel={(m) => setInspectedModel(m)}
                      />
                    </div>
                  </div>
                )}

                {/* AI Rationale & Synthesis Banner */}
                <div className="obsidian-card p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-sky-400" />
                      <h2 className="text-sm font-bold text-slate-100">
                        {isGeneralQuery ? "AI Research Briefing" : "Architecture Rationale & Evidence Synthesis"}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        askAssistant(
                          `Review the trade-offs between ${topDataset?.title || topDataset?.name || "the recommended dataset"} and ${topModel?.name || "the recommended model"} for "${submittedQuery}".`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-xs font-medium cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Deep-Dive in Copilot
                    </button>
                  </div>

                  <div className="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {aiDirectAnswer ||
                      analysis?.ai_analysis ||
                      researchSynthesis?.summary ||
                      summary?.recommendation ||
                      `Discovered ${datasets.length} datasets, ${models.length} pretrained backbones, and ${papers.length} scientific publications matching "${submittedQuery}".`}
                  </div>

                  {hardware?.recommendation && (
                    <div className="p-3 rounded-xl bg-[#07090E] border border-white/[0.07] text-xs text-slate-300 flex items-start gap-2.5">
                      <Cpu className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-slate-100">Compute Guidance: </span>
                        {hardware.recommendation}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: Datasets Explorer */}
            {activeTab === "datasets" && (
              <div className="space-y-4">
                <div className="obsidian-card p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                    <select
                      aria-label="Filter by source"
                      value={datasetSourceFilter}
                      onChange={(e) => setDatasetSourceFilter(e.target.value as any)}
                      className="bg-[#07090E] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                    >
                      <option value="all">All Sources</option>
                      <option value="huggingface">Hugging Face</option>
                      <option value="kaggle">Kaggle</option>
                    </select>

                    <select
                      aria-label="Filter by modality"
                      value={modalityFilter}
                      onChange={(e) => setModalityFilter(e.target.value)}
                      className="bg-[#07090E] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                    >
                      <option value="all">All Modalities</option>
                      <option value="text">Text / NLP</option>
                      <option value="vision">Vision / Imaging</option>
                      <option value="tabular">Tabular</option>
                      <option value="audio">Audio</option>
                      <option value="multimodal">Multimodal</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setCommercialOnly(!commercialOnly)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                        commercialOnly
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                          : "bg-[#07090E] border-white/10 text-slate-400"
                      }`}
                    >
                      Commercial-Safe
                    </button>

                    {labelMapping.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowLabelDrawer(!showLabelDrawer)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-medium cursor-pointer"
                      >
                        <Tag className="w-3.5 h-3.5" />
                        Suggested Label Mapping ({labelMapping.length})
                      </button>
                    )}
                  </div>

                  {/* Cards vs Table Switcher */}
                  <div className="inline-flex items-center rounded-lg bg-[#07090E] border border-white/[0.08] p-0.5">
                    <button
                      type="button"
                      onClick={() => setDatasetViewMode("cards")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                        datasetViewMode === "cards"
                          ? "bg-sky-500/15 text-sky-300"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" /> Cards
                    </button>
                    <button
                      type="button"
                      onClick={() => setDatasetViewMode("table")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                        datasetViewMode === "table"
                          ? "bg-sky-500/15 text-sky-300"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Table2 className="w-3.5 h-3.5" /> Table
                    </button>
                  </div>
                </div>

                {/* Expandable Suggested Label Mapping Preview Drawer */}
                {showLabelDrawer && labelMapping.length > 0 && (
                  <div className="obsidian-card p-4 border-sky-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                        Suggested Label &amp; Ontology Mapping
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowLabelDrawer(false)}
                        className="text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {labelMapping.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg bg-[#07090E] border border-white/[0.07] text-xs"
                        >
                          <div className="font-mono text-sky-300 font-semibold">
                            {item.sourceLabel || item.label || item.key || `Label ${idx + 1}`}
                          </div>
                          <div className="text-slate-400 mt-0.5">
                            &rarr; {item.targetLabel || item.mappedTo || item.description || "Standardized schema"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filteredDatasets.length === 0 ? (
                  <StitchEmptyState
                    category="datasets"
                    query={submittedQuery}
                    title="No Datasets Match Current Filters"
                    description="Try disabling the Commercial-Safe filter or switching to All Modalities."
                  />
                ) : datasetViewMode === "cards" ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredDatasets.map((ds, idx) => (
                      <DatasetCard
                        key={ds.id || idx}
                        dataset={ds}
                        onOpenDetails={(item) => setInspectedDatasetSchema(item)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="obsidian-card overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/[0.08] bg-[#0A0D14] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          <th className="py-3 px-4">Dataset</th>
                          <th className="py-3 px-3">Source</th>
                          <th className="py-3 px-3">Size / Rows</th>
                          <th className="py-3 px-3">License</th>
                          <th className="py-3 px-3 text-right">Fit Score</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06] text-xs">
                        {filteredDatasets.map((ds, idx) => {
                          const id = ds.id || ds.ref || ds.name;
                          const title = ds.title || ds.name || id;
                          const score = Math.round(ds.matchScore ?? ds.relevanceScore ?? 0);
                          const pinned = isAssetPinned(id);
                          const commercial = isCommercialSafeLicense(ds.license);

                          return (
                            <tr key={id || idx} className="hover:bg-white/[0.02] transition-lab">
                              <td className="py-3 px-4 max-w-[280px]">
                                <div className="font-semibold text-slate-100 truncate">{title}</div>
                                <div className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {ds.subtitle || ds.description || ""}
                                </div>
                              </td>
                              <td className="py-3 px-3 font-mono text-slate-300">
                                {ds.source || "Hub"}
                              </td>
                              <td className="py-3 px-3 font-mono text-slate-300 tabular-nums">
                                {ds.size || ds.rows || "—"}
                              </td>
                              <td className="py-3 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded font-mono text-[10px] border ${
                                    commercial
                                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                      : "bg-white/[0.04] border-white/10 text-slate-300"
                                  }`}
                                >
                                  {ds.license || "Unknown"}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-bold text-sky-300 tabular-nums">
                                {score}%
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                                <button
                                  type="button"
                                  onClick={() => setInspectedDatasetSchema(ds)}
                                  className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-[11px] cursor-pointer"
                                >
                                  Schema
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    togglePinAsset({
                                      id,
                                      type: "dataset",
                                      title,
                                      subtitle: ds.subtitle || ds.modality,
                                      source: ds.source || "Dataset",
                                      score,
                                      badge: "Dataset",
                                      url: ds.url,
                                      data: ds,
                                      pinnedAt: Date.now(),
                                    })
                                  }
                                  className={`px-2 py-1 rounded text-[11px] border cursor-pointer ${
                                    pinned
                                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                      : "bg-white/[0.04] border-white/10 text-slate-300"
                                  }`}
                                >
                                  {pinned ? "Pinned" : "Pin"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Model Architectures */}
            {activeTab === "models" && (
              <div className="space-y-4">
                <div className="obsidian-card p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Cpu className="w-4 h-4 text-sky-400" />
                    <span>
                      Showing <strong className="text-slate-100">{filteredModels.length}</strong> pretrained architectures calibrated to{" "}
                      <span className="font-mono text-sky-300">{gpuConstraintGb}GB VRAM</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModelFitOnly(!modelFitOnly)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                      modelFitOnly
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                        : "bg-[#07090E] border-white/10 text-slate-400"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    QLoRA Fits {gpuConstraintGb}GB Only
                  </button>
                </div>

                {filteredModels.length === 0 ? (
                  <StitchEmptyState
                    category="models"
                    query={submittedQuery}
                    title="No Models Fit Current GPU Filter"
                    description="Increase the GPU VRAM tier in the header or turn off the strict fit filter."
                  />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredModels.map((m, idx) => (
                      <ModelCard key={m.id || idx} model={m} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: Verified Literature & Evidence */}
            {activeTab === "papers" && (
              <div className="space-y-4">
                <div className="obsidian-card p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(["ALL", "EXACT_DATASET", "EXACT_MODEL", "SURVEY_OR_BENCHMARK"] as const).map(
                      (rel) => (
                        <button
                          key={rel}
                          type="button"
                          onClick={() => setPaperRelFilter(rel)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border cursor-pointer ${
                            paperRelFilter === rel
                              ? "bg-sky-500/15 border-sky-500/30 text-sky-300"
                              : "bg-[#07090E] border-white/[0.08] text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {rel === "ALL" ? `All (${papers.length})` : rel.replace(/_/g, " ")}
                        </button>
                      )
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Click &ldquo;Verified Evidence Spans&rdquo; inside any card to inspect literal paper quotes.
                  </span>
                </div>

                {filteredPapers.length === 0 ? (
                  <StitchEmptyState
                    category="papers"
                    query={submittedQuery}
                    title="No Papers Match Filter"
                    description="Switch relationship filter back to All to inspect all retrieved publications."
                  />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredPapers.map((p, idx) => (
                      <PaperCard
                        key={p.id || p.doi || idx}
                        paper={p}
                        onOpenDetails={(item) => setInspectedPaper(item)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: Interactive Research Graph */}
            {activeTab === "graph" && (
              <InteractiveResearchGraph
                query={submittedQuery}
                researchGraph={rawSearchPayload?.researchGraph}
                datasets={datasets}
                models={models}
                papers={papers}
              />
            )}
          </div>
        )}
      </div>

      {/* Dataset Schema & Sample Drawer Modal */}
      {inspectedDatasetSchema && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInspectedDatasetSchema(null);
          }}
        >
          <div className="w-full max-w-2xl obsidian-card p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-3">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                  Dataset Schema &amp; Metadata
                </span>
                <h3 className="text-base font-bold text-slate-100 mt-0.5">
                  {inspectedDatasetSchema.title || inspectedDatasetSchema.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedDatasetSchema(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/[0.06]">
                <div className="text-slate-500 text-[10px]">Source</div>
                <div className="font-mono text-slate-200 mt-0.5">{inspectedDatasetSchema.source || "Hub"}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/[0.06]">
                <div className="text-slate-500 text-[10px]">License</div>
                <div className="font-mono text-slate-200 mt-0.5">{inspectedDatasetSchema.license || "Check repo"}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/[0.06]">
                <div className="text-slate-500 text-[10px]">Size</div>
                <div className="font-mono text-slate-200 mt-0.5 tabular-nums">
                  {inspectedDatasetSchema.size || "—"}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/[0.06]">
                <div className="text-slate-500 text-[10px]">Format</div>
                <div className="font-mono text-slate-200 mt-0.5">
                  {inspectedDatasetSchema.fileFormat || "Parquet / Arrow"}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300">Features &amp; Columns</div>
              {Array.isArray(inspectedDatasetSchema.features) &&
              inspectedDatasetSchema.features.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {inspectedDatasetSchema.features.map((f: any, idx: number) => (
                    <span
                      key={idx}
                      className="px-2 py-1 rounded bg-[#07090E] border border-white/[0.08] font-mono text-[11px] text-sky-300"
                    >
                      {typeof f === "string" ? f : f.name || JSON.stringify(f)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  {inspectedDatasetSchema.description ||
                    "Inspect full column schema directly on the upstream dataset repository."}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
              {inspectedDatasetSchema.url && (
                <a
                  href={inspectedDatasetSchema.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-semibold"
                >
                  Open Source Repository <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Existing Modals Preserved */}
      <PaperDetailModal
        paper={inspectedPaper}
        onClose={() => setInspectedPaper(null)}
      />
      <SearchDebugModal
        isOpen={isDebugModalOpen}
        onClose={() => setIsDebugModalOpen(false)}
        diagnostics={rawSearchPayload?.diagnostics || rawSearchPayload?.searchDiagnostics}
        telemetry={rawSearchPayload?.telemetry}
        query={submittedQuery}
      />
      <SearchBenchmarkModal
        isOpen={isBenchmarkModalOpen}
        onClose={() => setIsBenchmarkModalOpen(false)}
      />
    </WorkspaceShell>
  );
}

export default function ExplorePage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#07090E] flex items-center justify-center text-xs font-mono text-slate-400">
            Initializing Explore Workstation...
          </div>
        }
      >
        <ExploreStudioContent />
      </Suspense>
    </ErrorBoundary>
  );
}
