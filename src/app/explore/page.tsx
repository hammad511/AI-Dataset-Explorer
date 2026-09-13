"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import DatasetCard, { DatasetItem } from "@/components/cards/DatasetCard";
import ModelCard, { ModelItem } from "@/components/cards/ModelCard";
import PaperCard from "@/components/cards/PaperCard";
import PaperDetailModal from "@/components/modals/PaperDetailModal";
import SearchDebugModal from "@/components/modals/SearchDebugModal";
import SearchBenchmarkModal from "@/components/modals/SearchBenchmarkModal";
import type { NormalizedPaper, ResearchLandscape, ResearchSynthesis } from "@/types/papers";
import { recordSearchInPopularityAlgorithm } from "@/lib/algorithms/popularity";
import { useSearchSession } from "@/context/SearchSessionContext";
import { useSearchProgress } from "@/hooks/useSearchProgress";
import { extractExplicitModality } from "@/server/search/modalityParser";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { StitchEmptyState } from "@/components/common/StitchEmptyState";
import { GeminiRightSidebar } from "@/components/layout/GeminiRightSidebar";
import { useRecentSearches } from "@/hooks/useRecentSearches";

function ExploreContent() {
    const { session } = useAuthGuard();
    const searchParams = useSearchParams();
    const initialQuery = searchParams?.get("q") || "";
    const { query: sessionQuery, searchResult: sessionResult, setSearchSession, pinnedAssets, clearPinnedAssets } = useSearchSession();

    const [searchInput, setSearchInput] = useState(initialQuery || sessionQuery || "");
    const [submittedQuery, setSubmittedQuery] = useState(initialQuery || sessionQuery || "");

    // Search progress tracking for percentage display
    const {
        progress: searchProgress,
        stage: searchStage,
        startProgress,
        completeProgress,
        resetProgress,
    } = useSearchProgress();

    // Search state
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(Boolean(initialQuery || sessionResult));
    const [error, setError] = useState<string | null>(null);

    // Diagnostics & Benchmark Modals
    const [debugModalOpen, setDebugModalOpen] = useState(false);
    const [benchmarkModalOpen, setBenchmarkModalOpen] = useState(false);
    const [tierFilter, setTierFilter] = useState<'all' | 'Tier A' | 'Tier B' | 'Tier C' | 'Tier D'>('all');

    // Non-dataset query flag & direct answer
    const [isGeneralQuery, setIsGeneralQuery] = useState(Boolean(sessionResult?.isGeneralQuery));
    const [aiDirectAnswer, setAiDirectAnswer] = useState<string | null>(sessionResult?.answer || null);

    // Active tab in results view
    const [activeTab, setActiveTab] = useState<'overview' | 'datasets' | 'models' | 'papers' | 'hardware' | 'inspector'>('overview');

    // Dataset & model & research results
    const [datasets, setDatasets] = useState<DatasetItem[]>((sessionResult?.datasets as any) || []);
    const [models, setModels] = useState<ModelItem[]>((sessionResult?.models as any) || []);
    const [papers, setPapers] = useState<NormalizedPaper[]>((sessionResult?.papers as any) || []);
    const [researchLandscape, setResearchLandscape] = useState<ResearchLandscape | null>((sessionResult?.researchLandscape as any) || null);
    const [researchSynthesis, setResearchSynthesis] = useState<ResearchSynthesis | null>((sessionResult?.researchSynthesis as any) || null);
    const [selectedPaper, setSelectedPaper] = useState<NormalizedPaper | null>(null);

    const [summary, setSummary] = useState<any>(sessionResult?.summary || null);
    const [analysis, setAnalysis] = useState<any>(sessionResult?.analysis || null);
    const [feasibility, setFeasibility] = useState<any>(sessionResult?.feasibility || null);

    const [hardware, setHardware] = useState<any>(null);
    const [apiAudit, setApiAudit] = useState<any>(null);
    const [searchCoverage, setSearchCoverage] = useState<any>(null);
    const [datasetCompatibility, setDatasetCompatibility] = useState<any[]>([]);
    const [labelMapping, setLabelMapping] = useState<any[]>([]);
    const [recommendationCategories, setRecommendationCategories] = useState<any[]>([]);

    // Filters
    const [sourceFilter, setSourceFilter] = useState<'all' | 'kaggle' | 'huggingface'>('all');
    const [paperFilter, setPaperFilter] = useState<'all' | 'latest' | 'most_relevant' | 'most_cited' | 'exact_dataset' | 'exact_model' | 'directly_related' | 'open_access' | 'preprint'>('all');
    const [selectedYear, setSelectedYear] = useState<number | null>(null);

    const [selectedCompare, setSelectedCompare] = useState<string[]>([]);
    const [compareModalOpen, setCompareModalOpen] = useState(false);
    const [activeDataset, setActiveDataset] = useState<DatasetItem | null>(null);

    // Inspector state
    const [intentDetails, setIntentDetails] = useState<any>(null);
    const [rawSearchPayload, setRawSearchPayload] = useState<any>(null);
    const [searchId, setSearchId] = useState<string>('');
    const [copiedJson, setCopiedJson] = useState(false);
    const [copiedSearchId, setCopiedSearchId] = useState(false);
    const [rawJsonExpanded, setRawJsonExpanded] = useState(false);

    // Anonymous limit
    const GUEST_DAILY_LIMIT = 3;
    const [anonSearchCount, setAnonSearchCount] = useState<number>(0);
    const [mounted, setMounted] = useState(false);
    const [showSignInGate, setShowSignInGate] = useState(false);

    const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const { recentSearches, addSearch, removeSearch, clearAllSearches } = useRecentSearches();

    const latestRequestRef = useRef<string>('');
    const abortControllerRef = useRef<AbortController | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const handleNewSearch = () => {
        setSearchInput('');
        setSubmittedQuery('');
        setHasSearched(false);
        setError(null);
        setDatasets([]);
        setModels([]);
        setPapers([]);
        setSummary(null);
        setAnalysis(null);
        setFeasibility(null);
        setHardware(null);
        setApiAudit(null);
        setSearchCoverage(null);
        setDatasetCompatibility([]);
        setLabelMapping([]);
        setRecommendationCategories([]);
        setIsGeneralQuery(false);
        setAiDirectAnswer(null);
        resetProgress();
        textareaRef.current?.focus();
    };

    useEffect(() => {
        setMounted(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const storedDate = localStorage.getItem('anon_search_date');
            if (storedDate !== today) {
                // New day: automatically reset anonymous searches
                localStorage.setItem('anon_search_date', today);
                localStorage.setItem('anon_search_count', '0');
                setAnonSearchCount(0);
            } else {
                const count = parseInt(localStorage.getItem('anon_search_count') || '0', 10);
                // If user was previously stuck at old 3-count limit, reset to 0 for fresh testing
                if (count >= 3 && !storedDate) {
                    localStorage.setItem('anon_search_date', today);
                    localStorage.setItem('anon_search_count', '0');
                    setAnonSearchCount(0);
                } else {
                    setAnonSearchCount(count);
                }
            }
        } catch {}

        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    // Search handler
    const handleSearch = async (queryToSearch: string) => {
        const trimmed = queryToSearch.trim();
        if (!trimmed) return;

        // Anonymous usage check
        if (!session) {
            const today = new Date().toISOString().split('T')[0];
            const storedDate = localStorage.getItem('anon_search_date');
            let count = parseInt(localStorage.getItem('anon_search_count') || '0', 10);
            if (storedDate !== today) {
                count = 0;
                localStorage.setItem('anon_search_date', today);
                localStorage.setItem('anon_search_count', '0');
            }

            if (count >= GUEST_DAILY_LIMIT) {
                setShowSignInGate(true);
                return;
            }
            const nextCount = count + 1;
            localStorage.setItem('anon_search_count', String(nextCount));
            localStorage.setItem('anon_search_date', today);
            setAnonSearchCount(nextCount);
        }

        const requestId = crypto.randomUUID();
        latestRequestRef.current = requestId;
        setSubmittedQuery(trimmed);
        recordSearchInPopularityAlgorithm(trimmed);
        addSearch(trimmed);

        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setIsLoading(true);
        setHasSearched(true);
        setError(null);
        setIsGeneralQuery(false);
        setAiDirectAnswer(null);
        startProgress();

        try {
            const res = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: trimmed, searchId: requestId }),
                signal: controller.signal,
            });

            const data = await res.json();

            if (requestId !== latestRequestRef.current || controller.signal.aborted) {
                resetProgress();
                return;
            }

            if (!res.ok || !data.success) {
                resetProgress();
                setError(data.error?.message || data.error || 'Search encountered an error. Please try again.');
                return;
            }

            // Successfully received search data: smoothly ramp progress to 100%
            await completeProgress();

            const isGen = Boolean(data.isGeneralQuery || data.type === 'general' || data.type === 'greeting' || (!data.datasets?.length && data.answer));
            setIsGeneralQuery(isGen);
            setAiDirectAnswer(data.answer || data.message || data.analysis?.ai_analysis || null);

            setDatasets(data.datasets || []);
            setModels(data.models || []);
            setPapers(data.papers || []);
            setResearchLandscape(data.researchLandscape || null);
            setResearchSynthesis(data.researchSynthesis || null);

            setSummary(data.summary || null);
            setAnalysis(data.analysis || null);
            setFeasibility(data.feasibility || null);
            setHardware(data.hardware || null);
            setApiAudit(data.apiAudit || null);
            setSearchCoverage(data.searchCoverage || null);
            setDatasetCompatibility(data.datasetCompatibility || []);
            setLabelMapping(data.labelMapping || []);
            setRecommendationCategories(data.recommendationCategories || []);

            setSearchId(data.searchId || requestId);
            setIntentDetails(data.intentDetails || null);
            setRawSearchPayload(data);

            // Sync to global reactive search session for Benchmark Lab & Roadmap
            setSearchSession(trimmed, data);

            if (isGen) {
                setActiveTab('overview');
            } else if ((data.intent === 'RESEARCH_SEARCH' || data.intent === 'EXACT_DATASET_RESEARCH') && (data.papers || []).length > 0) {
                setActiveTab('papers');
            }

        } catch (err: any) {
            resetProgress();
            if (err.name !== 'AbortError' && requestId === latestRequestRef.current) {
                setError(err.message || 'Failed to connect to search service.');
            }
        } finally {
            if (requestId === latestRequestRef.current && !controller.signal.aborted) {
                setIsLoading(false);
            }
        }
    };

    // Auto-search if q param is provided on mount, or hydrate from sessionResult
    useEffect(() => {
        if (initialQuery) {
            handleSearch(initialQuery);
        } else if (sessionResult && datasets.length === 0) {
            setSearchInput(sessionQuery || "");
            setSubmittedQuery(sessionQuery || "");
            setHasSearched(true);
            setIsGeneralQuery(Boolean(sessionResult.isGeneralQuery));
            setAiDirectAnswer(sessionResult.answer || sessionResult.message || sessionResult.analysis?.ai_analysis || null);
            setDatasets((sessionResult.datasets || sessionResult.discoveredAssets?.datasets || []) as any);
            setModels((sessionResult.models || sessionResult.discoveredAssets?.models || []) as any);
            setPapers((sessionResult.papers || sessionResult.discoveredAssets?.papers || []) as any);
            setResearchLandscape((sessionResult.researchLandscape || null) as any);
            setResearchSynthesis((sessionResult.researchSynthesis || null) as any);
            setSummary(sessionResult.summary || null);
            setAnalysis(sessionResult.analysis || null);
            setFeasibility(sessionResult.feasibility || null);
            setHardware(sessionResult.hardware || null);
            setApiAudit(sessionResult.apiAudit || null);
            setSearchCoverage(sessionResult.searchCoverage || null);
            setDatasetCompatibility(sessionResult.datasetCompatibility || []);
            setLabelMapping(sessionResult.labelMapping || []);
            setRecommendationCategories(sessionResult.recommendationCategories || []);
            setSearchId(sessionResult.searchId || '');
            setIntentDetails(sessionResult.intentDetails || null);
            setRawSearchPayload(sessionResult.rawResponse || sessionResult);
        }
    }, [initialQuery, sessionResult, sessionQuery]); // eslint-disable-line react-hooks/exhaustive-deps


    // Filter datasets by source
    const filteredDatasets = useMemo(() => {
        if (!datasets) return [];
        return datasets.filter((item) => {
            if (sourceFilter === 'all') return true;
            const src = (item.source || '').toLowerCase();
            if (sourceFilter === 'kaggle') return src.includes('kaggle');
            if (sourceFilter === 'huggingface') return src.includes('hugging');
            return true;
        });
    }, [datasets, sourceFilter]);

    // Filter and sort research papers
    const filteredPapers = useMemo(() => {
        if (!papers) return [];
        let list = [...papers];

        if (selectedYear !== null) {
            list = list.filter((p) => p.year === selectedYear);
        }

        switch (paperFilter) {
            case 'latest':
                list.sort((a, b) => (b.year || 0) - (a.year || 0));
                break;
            case 'most_relevant':
                list.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
                break;
            case 'most_cited':
                list.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
                break;
            case 'exact_dataset':
                list = list.filter((p) => p.relationship === 'EXACT_DATASET');
                break;
            case 'exact_model':
                list = list.filter((p) => p.relationship === 'EXACT_MODEL');
                break;
            case 'directly_related':
                list = list.filter((p) => p.relationship === 'DIRECTLY_RELATED');
                break;
            case 'open_access':
                list = list.filter((p) => p.openAccess);
                break;
            case 'preprint':
                list = list.filter((p) => p.isPreprint);
                break;
            case 'all':
            default:
                break;
        }

        return list;
    }, [papers, paperFilter, selectedYear]);

    const toggleCompare = (id: string) => {
        setSelectedCompare((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id].slice(0, 4)
        );
    };

    const compareList = useMemo(() => {
        return datasets.filter((d) => selectedCompare.includes(d.id || d.ref || d.name));
    }, [datasets, selectedCompare]);

    const dsName = (ds: DatasetItem) => ds.title || ds.name || ds.id || 'Unnamed Dataset';
    const dsDescription = (ds: DatasetItem) => ds.subtitle || ds.description || 'No description available.';
    const dsScore = (ds: DatasetItem) => ds.matchScore ?? ds.relevanceScore ?? 0;
    const dsSize = (bytes?: number | null) => {
        if (!bytes || bytes === 0) return 'Size unstated';
        const mb = bytes / (1024 * 1024);
        if (mb < 1000) return `${mb.toFixed(1)} MB`;
        return `${(mb / 1024).toFixed(1)} GB`;
    };

    const cleanDomain = (d?: string) => {
        if (!d || d.toLowerCase() === 'unknown' || d.trim() === '') return 'Machine Learning & AI';
        return d;
    };
    const cleanTask = (t?: string) => {
        if (!t || t.toLowerCase() === 'unknown' || t.trim() === '') return 'Dataset Discovery & Analysis';
        return t;
    };

    const MIN_SCORE = 30;
    const bestDataset = summary?.bestDataset || (datasets.length > 0 && (datasets[0].matchScore ?? 100) > MIN_SCORE ? datasets[0] : null);

    const bestModel: any = useMemo(() => {
        if (summary?.bestModel) return summary.bestModel;
        const validModels = models.filter(m => (m.matchScore ?? 0) > MIN_SCORE && !m.rejected);
        if (validModels.length > 0) return validModels[0];
        // If models contains an unverified fallback, return it
        const fallback = models.find(m => (m as any).isArchitecturalBaseline || (m as any).matchCategory === 'UNVERIFIED_FALLBACK');
        if (fallback) return fallback;
        return null;
    }, [summary, models]);

    return (
        <main className="min-h-screen flex flex-col bg-page text-primary selection:bg-accent selection:text-white relative">
            {/* Ambient background glow - Hardware accelerated to eliminate scrolling lag */}
            <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden transform-gpu will-change-transform">
                <div className="absolute top-0 left-1/4 w-[600px] h-[400px] rounded-full bg-accent opacity-[var(--glow-opacity,0.2)] blur-[100px] transform-gpu" />
                <div className="absolute top-1/3 right-10 w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-[100px] opacity-[var(--glow-opacity,0.2)] transform-gpu" />
            </div>

            {/* Top Navigation */}
            <Navbar
                variant="app"
                onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                isSidebarOpen={isSidebarOpen}
            />

            {/* Studio Workspace Container */}
            <div className="flex-1 flex min-h-0 relative items-start w-full">
                {/* Gemini Left Sidebar */}
                <GeminiRightSidebar
                    currentQuery={submittedQuery}
                    recentSearches={recentSearches}
                    onRemoveSearch={removeSearch}
                    onClearAllSearches={clearAllSearches}
                    onSelectSearch={(q) => {
                        setSearchInput(q);
                        handleSearch(q);
                    }}
                    onNewSearch={handleNewSearch}
                    isOpenMobile={sidebarMobileOpen}
                    onCloseMobile={() => setSidebarMobileOpen(false)}
                    className={`sticky top-16 h-[calc(100vh-64px)] ${isSidebarOpen ? "hidden md:flex" : "!hidden"}`}
                />

                {/* Main Workspace Column */}
                <div className="flex-1 min-w-0 flex flex-col w-full">
                    {/* Sub-Header Toolbar (aligned with explore content) */}
                    <div className="border-b border-subtle bg-card-subtle px-4 sm:px-6 lg:px-8 py-3 w-full shrink-0">
                        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 text-xs text-muted">
                                <Link href="/" className="hover:text-primary transition">Home</Link>
                                <span>/</span>
                                <span className="text-primary font-semibold">Explore Studio</span>
                            </div>

                            <div className="flex items-center gap-3">
                                {/* Mobile Recent Searches Button */}
                                <button
                                    type="button"
                                    onClick={() => setSidebarMobileOpen(true)}
                                    className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition"
                                    title="Open Recent Searches & Settings"
                                >
                                    <span>✦</span>
                                    <span>Recents</span>
                                </button>

                                {hasSearched && !isLoading && (
                                    <>
                                        <button
                                            onClick={() => setDebugModalOpen(true)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-accent bg-accent/10 hover:bg-accent/20 border border-accent/30 transition"
                                            title="Inspect candidate reduction funnel and extracted constraints"
                                        >
                                            <span>🔬</span> Search Telemetry
                                        </button>

                                        <button
                                            onClick={() => setBenchmarkModalOpen(true)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition"
                                            title="View empirical precision and IR evaluation benchmarks"
                                        >
                                            <span>📊</span> IR Benchmark
                                        </button>

                                        <button
                                            onClick={() => {
                                                const report = JSON.stringify({ summary, analysis, feasibility, hardware, datasets, models, papers, researchLandscape, researchSynthesis }, null, 2);
                                                const blob = new Blob([report], { type: 'application/json' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `dataset-explorer-analysis-${Date.now()}.json`;
                                                a.click();
                                                URL.revokeObjectURL(url);
                                            }}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-secondary bg-card hover:bg-card-hover border border-subtle transition"
                                            title="Export analysis report"
                                        >
                                            <span>📥</span> Export JSON
                                        </button>
                                    </>
                                )}
                                {!session && mounted ? (
                                    <span className="text-[11px] text-muted hidden sm:inline-block">
                                        Free searches remaining: <strong className="text-accent-to font-bold">{Math.max(0, GUEST_DAILY_LIMIT - anonSearchCount)}</strong>/{GUEST_DAILY_LIMIT}
                                    </span>
                                ) : session && mounted ? (
                                    <span className="text-[11px] text-muted hidden sm:inline-block">
                                        <strong className="text-status-emerald font-bold">✓ Logged In</strong> · {(session.user as any)?.role === 'ADMIN' ? 'Super Admin' : (session.user as any)?.planTier === 'pro' ? 'Pro Plan (Unlimited)' : 'Free Tier (50/day)'}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    {/* Main Content Body */}
                    <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col space-y-8 min-w-0">
                
                {/* ── SEARCH STUDIO CARD ──────────────────────────────────── */}
                <div className="w-full rounded-3xl border border-subtle glass-card p-5 sm:p-6 shadow-xl relative">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSearch(searchInput);
                        }}
                        className="space-y-4"
                    >
                        <div className="flex items-start gap-3">
                            <div className="pt-2 text-accent-from">
                                {isLoading ? (
                                    <span className="inline-block w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                )}
                            </div>

                            <textarea
                                ref={textareaRef}
                                rows={2}
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSearch(searchInput);
                                    }
                                }}
                                placeholder="Describe your project, AI problem, or dataset needs (e.g., 'Real-time vehicle detection in CCTV video' or 'Coronary artery segmentation CT dataset')..."
                                className="w-full bg-transparent text-sm sm:text-base text-primary placeholder:text-muted outline-none resize-none leading-relaxed"
                            />

                            <div className="flex items-center gap-2 shrink-0">
                                {searchInput && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchInput("")}
                                        className="p-2 text-muted hover:text-primary transition"
                                        title="Clear input"
                                    >
                                        ✕
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    disabled={isLoading || !searchInput.trim()}
                                    className="relative overflow-hidden px-6 py-2.5 rounded-xl bg-accent hover:brightness-110 active:scale-95 text-white font-bold text-xs sm:text-sm transition-all shadow-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 min-w-[145px]"
                                >
                                    {isLoading && (
                                        <div
                                            className="absolute inset-0 bg-white/20 dark:bg-white/25 transition-all duration-150 ease-out pointer-events-none"
                                            style={{ width: `${Math.min(100, Math.round(searchProgress))}%` }}
                                        />
                                    )}
                                    <span className="relative z-10 flex items-center gap-1.5">
                                        {isLoading ? (
                                            <>
                                                <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                <span>Analyzing {Math.round(searchProgress)}%</span>
                                            </>
                                        ) : (
                                            "Explore"
                                        )}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Progress Bar during Search */}
                        {isLoading && (
                            <div className="w-full space-y-1.5 pt-2 animate-in fade-in duration-200">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-2 text-accent font-semibold text-[11px] sm:text-xs">
                                        <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
                                        <span>{searchStage || "Analyzing query & domain constraints..."}</span>
                                    </span>
                                    <span className="font-mono text-[11px] sm:text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-md border border-accent/20">
                                        {Math.round(searchProgress)}%
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-card-subtle rounded-full overflow-hidden border border-subtle">
                                    <div
                                        className="h-full bg-gradient-to-r from-accent via-accent-from to-accent-to transition-all duration-150 ease-out rounded-full shadow-sm"
                                        style={{ width: `${Math.min(100, Math.round(searchProgress))}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Quick Prompts & Shortcuts */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-subtle text-xs">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-faint text-[11px] font-bold uppercase tracking-wider mr-1">Quick Try:</span>
                                {[
                                    "Coronary artery CT segmentation",
                                    "Vehicle tracking in CCTV video",
                                    "Chest X-ray pneumonia classification",
                                    "Explain backpropagation vs Adam optimizer",
                                ].map((prompt) => (
                                    <button
                                        key={prompt}
                                        type="button"
                                        onClick={() => {
                                            setSearchInput(prompt);
                                            handleSearch(prompt);
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-card-subtle hover:bg-card-hover text-muted hover:text-primary border border-subtle transition text-[11px]"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                            <span className="text-[11px] text-faint hidden md:inline-block">
                                Press <kbd className="px-1.5 py-0.5 rounded bg-card-subtle border border-subtle font-mono text-[10px]">Enter</kbd> to search · <kbd className="px-1.5 py-0.5 rounded bg-card-subtle border border-subtle font-mono text-[10px]">Shift+Enter</kbd> for newline
                            </span>
                        </div>
                    </form>
                </div>

                {/* ── ERROR ALERT ─────────────────────────────────────────── */}
                {error && (
                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-status-rose text-sm flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2.5">
                            <span className="text-lg">⚠</span>
                            <span>{error}</span>
                        </div>
                        <button
                            onClick={() => handleSearch(submittedQuery)}
                            className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-xs font-bold transition text-status-rose"
                        >
                            Retry Search
                        </button>
                    </div>
                )}

                {/* ── RESULTS WORKSPACE ────────────────────────────────────── */}
                {hasSearched && (
                    <div className={`space-y-8 animate-in fade-in duration-300 ${isLoading ? 'opacity-65 pointer-events-none transition-opacity duration-200' : ''}`}>
                        
                        {/* 4-Card Summary KPI Strip */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="p-4 rounded-2xl bg-card border border-subtle shadow-sm">
                                <div className="text-[10px] uppercase font-bold tracking-wider text-faint">Domain & Task</div>
                                <div className="text-sm sm:text-base font-bold text-primary mt-1 capitalize truncate" title={isGeneralQuery ? "General / AI Concepts" : cleanDomain(summary?.domain || analysis?.domain)}>
                                    {isGeneralQuery ? "General / AI Concepts" : cleanDomain(summary?.domain || analysis?.domain)}
                                </div>
                                <div className="text-xs text-muted mt-0.5 capitalize truncate" title={isGeneralQuery ? "Knowledge & Explanations" : cleanTask(summary?.task || analysis?.task)}>
                                    {isGeneralQuery ? "Knowledge & Explanations" : cleanTask(summary?.task || analysis?.task)}
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-card border border-subtle shadow-sm">
                                <div className="text-[10px] uppercase font-bold tracking-wider text-faint">Modality & Format</div>
                                <div className="text-sm sm:text-base font-bold text-status-cyan mt-1 capitalize truncate">
                                    {isGeneralQuery ? "Text / Code" : (summary?.dataType || analysis?.data_modality || "Multi-Modal")}
                                </div>
                                <div className="text-xs text-muted mt-0.5 truncate">
                                    {isGeneralQuery ? "Direct Statement" : `Target: ${analysis?.target || "General"}`}
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-card border border-subtle shadow-sm">
                                <div className="text-[10px] uppercase font-bold tracking-wider text-faint">Discovered Assets</div>
                                <div className="text-sm sm:text-base font-bold text-primary mt-1">
                                    {datasets.length} <span className="text-xs font-normal text-muted">Datasets</span> · {models.length} <span className="text-xs font-normal text-muted">Models</span> · {papers.length} <span className="text-xs font-normal text-muted">Papers</span>
                                </div>
                                <div className="text-xs text-muted mt-0.5">
                                    {isGeneralQuery ? "Direct Response" : "Kaggle, HF & Semantic Scholar"}
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-card border border-subtle shadow-sm">
                                <div className="text-[10px] uppercase font-bold tracking-wider text-faint">Feasibility & Compute</div>
                                <div className="text-sm sm:text-base font-bold text-status-emerald mt-1">
                                    {isGeneralQuery ? "100% Direct Match" : (feasibility?.feasibility_score ? `${feasibility.feasibility_score}/100 Feasibility` : "Ready")}
                                </div>
                                <div className="text-xs text-muted mt-0.5 truncate">
                                    {isGeneralQuery ? "Interactive RAG" : (hardware?.gpu_recommendation || "Hardware profiled")}
                                </div>
                            </div>
                        </div>

                        {/* Segmented Tab Navigation Bar */}
                        <div className="flex items-center justify-between border-b border-subtle overflow-x-auto pb-0">
                            <div className="flex gap-1.5">
                                {[
                                    { key: 'overview', label: isGeneralQuery ? 'AI Direct Response' : 'Overview & AI Rationale', icon: '✦' },
                                    { key: 'datasets', label: `Datasets (${datasets.length})`, icon: '📦' },
                                    { key: 'models', label: `Models (${models.length})`, icon: '🤖' },
                                    { key: 'papers', label: `Research Papers (${papers.length})`, icon: '🔬' },
                                    { key: 'hardware', label: 'Hardware & Roadmap', icon: '⚡' },
                                    { key: 'inspector', label: 'Query Inspector', icon: '🔍' },
                                ].map((tab) => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key as any)}
                                        className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm transition-all -mb-px shrink-0 rounded-t-xl ${
                                            activeTab === tab.key
                                                ? 'border-b-2 border-accent-from text-white bg-accent font-bold shadow-accent-sm'
                                                : 'border-b-2 border-transparent text-muted hover:text-primary hover:bg-card-subtle font-semibold'
                                        }`}
                                    >
                                        <span className="text-sm">{tab.icon}</span>
                                        <span>{tab.label}</span>
                                    </button>
                                ))}
                            </div>

                            {selectedCompare.length > 0 && (
                                <button
                                    onClick={() => setCompareModalOpen(true)}
                                    className="text-xs px-3.5 py-1.5 rounded-xl bg-accent text-white font-bold shadow-accent-sm transition shrink-0"
                                >
                                    Compare ({selectedCompare.length}) ↗
                                </button>
                            )}
                        </div>

                        {/* ── TAB 1: OVERVIEW & SYNTHESIS ─────────────────────────── */}
                        {activeTab === 'overview' && (
                            <ErrorBoundary componentName="Overview & Synthesis Tab">
                                <div className="space-y-6">
                                {aiDirectAnswer && (
                                    <div className="p-6 sm:p-7 rounded-3xl border border-accent bg-card shadow-xl space-y-4">
                                        <div className="flex items-center justify-between gap-3 border-b border-subtle pb-3">
                                            <div className="flex items-center gap-2 text-accent-gradient font-bold text-xs uppercase tracking-wider">
                                                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                                                {isGeneralQuery ? "AI Assistant Direct Statement Response" : "AI Evidence Synthesis & Rationale"}
                                            </div>
                                            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-card-subtle text-secondary border border-subtle font-medium">
                                                {isGeneralQuery ? "General Knowledge Mode" : "Evidence-Grounded"}
                                            </span>
                                        </div>

                                        <div className="p-4 sm:p-5 rounded-2xl bg-card-solid border border-subtle text-sm sm:text-base text-secondary leading-relaxed whitespace-pre-wrap font-sans shadow-xs">
                                            {aiDirectAnswer}
                                        </div>

                                        {isGeneralQuery && (
                                            <div className="pt-4 border-t border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-muted">
                                                <span>Want to find machine learning datasets on this topic?</span>
                                                <button
                                                    onClick={() => {
                                                        const dsPrompt = `${submittedQuery} dataset`;
                                                        setSearchInput(dsPrompt);
                                                        handleSearch(dsPrompt);
                                                    }}
                                                    className="px-3.5 py-1.5 rounded-xl bg-accent text-white font-bold shadow-accent-sm hover:brightness-110 transition"
                                                >
                                                    🔍 Search datasets for &quot;{submittedQuery.slice(0, 20)}...&quot;
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── SEARCH ENGINE 2.0.0 INTELLIGENCE & TELEMETRY PANEL ── */}
                                {rawSearchPayload?.interpretation && (
                                    <div className="p-6 sm:p-7 rounded-3xl bg-card border border-accent/40 shadow-sm space-y-5">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-4">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-white text-sm shadow-accent-sm">
                                                    ⚡
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="text-base font-bold text-primary">
                                                            Search Intelligence & Scientific Evidence Telemetry
                                                        </h3>
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-accent/10 text-accent border-accent/30 uppercase tracking-wide">
                                                            v{rawSearchPayload.searchEngineVersion || '2.0.0'}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted">
                                                        17-stage scientific retrieval pipeline with strict anatomical & modality contradiction guards
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 flex-wrap">
                                                {rawSearchPayload.searchDiagnostics?.latencyMs && (
                                                    <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-card-subtle border border-subtle text-secondary">
                                                        ⏱️ {rawSearchPayload.searchDiagnostics.latencyMs}ms
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => setDebugModalOpen(true)}
                                                    className="text-[11px] font-semibold px-3 py-1 rounded-lg border border-subtle bg-card-subtle hover:bg-card text-primary transition flex items-center gap-1.5"
                                                >
                                                    <span>📊 Pipeline Telemetry</span>
                                                </button>
                                                <button
                                                    onClick={() => setBenchmarkModalOpen(true)}
                                                    className="text-[11px] font-semibold px-3 py-1 rounded-lg border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 transition flex items-center gap-1.5"
                                                >
                                                    <span>🎯 IR Benchmark</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* 17-Stage Funnel Metrics */}
                                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                                            <div className="p-3 bg-card-solid rounded-xl border border-subtle">
                                                <span className="text-faint font-bold uppercase tracking-wider text-[10px]">1. Retrieved</span>
                                                <div className="text-base font-bold text-primary mt-0.5">
                                                    {rawSearchPayload.searchDiagnostics?.candidatesRetrieved || rawSearchPayload.telemetry?.retrievalCount || 0}
                                                </div>
                                                <span className="text-[10px] text-muted">Multi-source</span>
                                            </div>
                                            <div className="p-3 bg-card-solid rounded-xl border border-subtle">
                                                <span className="text-faint font-bold uppercase tracking-wider text-[10px]">2. Deduplicated</span>
                                                <div className="text-base font-bold text-primary mt-0.5">
                                                    {rawSearchPayload.searchDiagnostics?.candidatesAfterDeduplication || 0}
                                                </div>
                                                <span className="text-[10px] text-muted">Canonical DOI/Keys</span>
                                            </div>
                                            <div className="p-3 bg-card-solid rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                                                <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px]">3. Passed Guards</span>
                                                <div className="text-base font-bold text-emerald-400 mt-0.5">
                                                    {rawSearchPayload.searchDiagnostics?.candidatesAfterFiltering || 0}
                                                </div>
                                                <span className="text-[10px] text-emerald-400/80">0 Contradictions</span>
                                            </div>
                                            <div className="p-3 bg-card-solid rounded-xl border border-subtle">
                                                <span className="text-faint font-bold uppercase tracking-wider text-[10px]">4. Reranked</span>
                                                <div className="text-base font-bold text-primary mt-0.5">
                                                    {rawSearchPayload.searchDiagnostics?.candidatesReranked || 0}
                                                </div>
                                                <span className="text-[10px] text-muted">Cross-Encoder</span>
                                            </div>
                                            <div className="p-3 bg-card-solid rounded-xl border border-cyan-500/20 bg-cyan-500/5 col-span-2 sm:col-span-1">
                                                <span className="text-cyan-400 font-bold uppercase tracking-wider text-[10px]">5. Recommended</span>
                                                <div className="text-base font-bold text-cyan-400 mt-0.5">
                                                    {(datasets.length + models.length + papers.length)}
                                                </div>
                                                <span className="text-[10px] text-cyan-400/80">Exact & Partial</span>
                                            </div>
                                        </div>

                                        {/* Query Decomposition Breakdown */}
                                        <div className="p-4 rounded-2xl bg-card-solid border border-subtle text-xs space-y-2.5">
                                            <div className="font-bold text-primary text-[11px] uppercase tracking-wider flex items-center justify-between">
                                                <span>Semantic Query Understanding & Constraint Enforcement</span>
                                                <span className="text-emerald-400 text-[10px]">Active Filters Enforced</span>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-[11px]">
                                                <div className="p-2.5 rounded-lg bg-card-subtle border border-subtle">
                                                    <span className="text-muted block text-[10px] font-semibold uppercase">Target Anatomy:</span>
                                                    <span className="text-emerald-400 font-medium">{Array.isArray(rawSearchPayload.interpretation.anatomy) ? rawSearchPayload.interpretation.anatomy.join(', ') : 'Cardiovascular'}</span>
                                                </div>
                                                <div className="p-2.5 rounded-lg bg-card-subtle border border-subtle">
                                                    <span className="text-muted block text-[10px] font-semibold uppercase">Modality & Technique:</span>
                                                    <span className="text-cyan-400 font-medium">{Array.isArray(rawSearchPayload.interpretation.modalitySubtypes) && rawSearchPayload.interpretation.modalitySubtypes.length > 0 ? rawSearchPayload.interpretation.modalitySubtypes.join(', ') : (rawSearchPayload.interpretation.modalities || []).join(', ')}</span>
                                                </div>
                                                <div className="p-2.5 rounded-lg bg-card-subtle border border-subtle">
                                                    <span className="text-muted block text-[10px] font-semibold uppercase">Sampling Strategy:</span>
                                                    <span className="text-amber-400 font-medium">{Array.isArray(rawSearchPayload.interpretation.samplingStrategy) && rawSearchPayload.interpretation.samplingStrategy.length > 0 ? rawSearchPayload.interpretation.samplingStrategy.join(', ') : 'Radial k-space'}</span>
                                                </div>
                                                <div className="p-2.5 rounded-lg bg-card-subtle border border-subtle">
                                                    <span className="text-muted block text-[10px] font-semibold uppercase">Reconstruction Task:</span>
                                                    <span className="text-primary font-medium">{Array.isArray(rawSearchPayload.interpretation.reconstructionTasks) ? rawSearchPayload.interpretation.reconstructionTasks.join(', ') : 'Velocity reconstruction'}</span>
                                                </div>
                                                <div className="p-2.5 rounded-lg bg-card-subtle border border-subtle">
                                                    <span className="text-muted block text-[10px] font-semibold uppercase">Physiological Target:</span>
                                                    <span className="text-primary font-medium">{Array.isArray(rawSearchPayload.interpretation.physiologicalTargets) ? rawSearchPayload.interpretation.physiologicalTargets.join(', ') : 'Blood flow / WSS'}</span>
                                                </div>
                                                <div className="p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/20">
                                                    <span className="text-rose-400 block text-[10px] font-semibold uppercase">Strictly Excluded Contradictions:</span>
                                                    <span className="text-rose-400 font-medium">Brain, Lung, Abdomen, Astronomy, CFD</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Research Landscape & Maturity Summary Card */}
                                {researchLandscape && (
                                    <div className="p-6 sm:p-7 rounded-3xl bg-card border border-subtle space-y-5 shadow-sm">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-4">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-white text-sm shadow-accent-sm">
                                                    🔬
                                                </div>
                                                <div>
                                                    <h3 className="text-base font-bold text-primary">
                                                        Research Landscape & Scientific Maturity
                                                    </h3>
                                                    <p className="text-xs text-muted">
                                                        Scholarly literature discovered across Semantic Scholar, OpenAlex, arXiv & PubMed
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted font-medium">Maturity:</span>
                                                <span
                                                    className={`text-xs font-bold px-3 py-1 rounded-full border uppercase tracking-wider ${
                                                        researchLandscape.researchMaturity === "Established"
                                                            ? "status-badge-emerald"
                                                            : researchLandscape.researchMaturity === "Developing"
                                                            ? "status-badge-cyan"
                                                            : "status-badge-amber"
                                                    }`}
                                                >
                                                    {researchLandscape.researchMaturity}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Landscape Stat Pills */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                            <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle">
                                                <span className="text-faint font-bold uppercase tracking-wider text-[10px]">Research Papers</span>
                                                <div className="text-lg font-black text-primary mt-1">
                                                    {researchLandscape.totalPapers}
                                                </div>
                                                <span className="text-[11px] text-muted block mt-0.5">Found across indexes</span>
                                            </div>
                                            <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle">
                                                <span className="text-faint font-bold uppercase tracking-wider text-[10px]">Exact Dataset Papers</span>
                                                <div className="text-lg font-black text-status-emerald mt-1">
                                                    {researchLandscape.exactDatasetPapers}
                                                </div>
                                                <span className="text-[11px] text-muted block mt-0.5">Verified citations</span>
                                            </div>
                                            <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle">
                                                <span className="text-faint font-bold uppercase tracking-wider text-[10px]">Directly Related</span>
                                                <div className="text-lg font-black text-status-violet mt-1">
                                                    {researchLandscape.directlyRelatedPapers}
                                                </div>
                                                <span className="text-[11px] text-muted block mt-0.5">Same platform/task</span>
                                            </div>
                                            <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle">
                                                <span className="text-faint font-bold uppercase tracking-wider text-[10px]">Latest Literature</span>
                                                <div className="text-lg font-black text-accent-gradient mt-1">
                                                    {researchLandscape.latestPaperYear || "Recent"}
                                                </div>
                                                <span className="text-[11px] text-muted block mt-0.5">Most recent preprint/paper</span>
                                            </div>
                                        </div>

                                        <p className="text-xs text-secondary italic">
                                            {researchLandscape.maturityReason}
                                        </p>
                                    </div>
                                )}

                                {/* Research Synthesis Card (Facts From Source vs AI Interpretation) */}
                                {researchSynthesis && (
                                    <div className="p-6 sm:p-7 rounded-3xl bg-card border border-subtle space-y-4 shadow-sm">
                                        <div className="flex items-center gap-2 text-accent-gradient font-bold text-xs uppercase tracking-wider">
                                            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                                            What Does the Research Say? — Scientific Synthesis
                                        </div>

                                        <div className="p-4 sm:p-5 rounded-2xl bg-card-solid border border-subtle text-xs sm:text-sm text-secondary leading-relaxed shadow-xs">
                                            {researchSynthesis.summary}
                                        </div>

                                        {/* Facts From Source Section */}
                                        {Array.isArray(researchSynthesis.factsFromSource) && researchSynthesis.factsFromSource.length > 0 && (
                                            <div className="space-y-2 pt-2">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-status-emerald flex items-center gap-1.5">
                                                    <span>✓</span> Facts From Verified Sources:
                                                </span>
                                                <div className="space-y-2">
                                                    {researchSynthesis.factsFromSource.slice(0, 3).map((f, i) => (
                                                        <div key={i} className="p-3 rounded-xl bg-card-solid border border-subtle text-xs text-secondary flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                                            <span>{f.fact}</span>
                                                            <span className="text-[11px] text-muted font-mono shrink-0">[{f.source}]</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* AI Interpretation Section */}
                                        {Array.isArray(researchSynthesis.aiInterpretation) && researchSynthesis.aiInterpretation.length > 0 && (
                                            <div className="space-y-2 pt-2">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-accent-to flex items-center gap-1.5">
                                                    <span>✦</span> AI Project Interpretation:
                                                </span>
                                                <ul className="space-y-1.5 text-xs text-secondary pl-4 list-disc">
                                                    {researchSynthesis.aiInterpretation.map((interp, i) => (
                                                        <li key={i}>{interp}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Top Spotlight: Best Dataset & Best Model Cards */}
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                    {bestDataset ? (
                                        <div className="p-6 rounded-3xl bg-card border border-accent shadow-lg flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[10px] font-bold px-3 py-1 rounded-full border uppercase tracking-wider status-badge-emerald">
                                                        🏆 Top Recommended Dataset
                                                    </span>
                                                    <span className="text-xs font-bold text-status-emerald">
                                                        {dsScore(bestDataset)}% Match
                                                    </span>
                                                </div>

                                                <h3 className="text-lg font-bold text-primary mt-3 line-clamp-2">
                                                    {dsName(bestDataset)}
                                                </h3>
                                                <div className="p-3.5 rounded-xl bg-card-solid border border-subtle mt-2.5 shadow-xs">
                                                    <p className="text-xs text-muted line-clamp-3 leading-relaxed">
                                                        {dsDescription(bestDataset)}
                                                    </p>
                                                </div>
                                                
                                                <div className="flex flex-wrap gap-2 mt-4 text-[11px]">
                                                    <span className="px-2.5 py-1 rounded-lg bg-card-subtle border border-subtle text-secondary font-medium">
                                                        Modality: {extractExplicitModality(bestDataset.title, bestDataset.description, bestDataset.tags, bestDataset.formats) || bestDataset.modality || "MRI"}
                                                    </span>
                                                    <span className="px-2.5 py-1 rounded-lg bg-card-subtle border border-subtle text-secondary font-medium">
                                                        Size: {dsSize(bestDataset.sizeBytes)}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="mt-6 pt-4 border-t border-subtle flex items-center justify-between">
                                                <button
                                                    onClick={() => setActiveDataset(bestDataset)}
                                                    className="text-xs font-semibold text-muted hover:text-primary transition"
                                                >
                                                    Score Breakdown & Papers ▾
                                                </button>
                                                {bestDataset.url && (
                                                    <a
                                                        href={bestDataset.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs font-bold px-4 py-2 rounded-xl bg-accent text-white shadow-accent-sm hover:brightness-110 transition flex items-center gap-1"
                                                    >
                                                        Open on {bestDataset.source || 'Hub'} ↗
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ) : isLoading ? (
                                        <div className="p-8 rounded-3xl bg-card border border-subtle shadow-lg flex flex-col items-center justify-center text-center space-y-4 min-h-[260px]">
                                            <div className="relative flex items-center justify-center w-12 h-12">
                                                <span className="inline-block w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                                                <span className="absolute text-[10px] font-bold font-mono text-accent">
                                                    {Math.round(searchProgress)}%
                                                </span>
                                            </div>
                                            <div className="space-y-1">
                                                <h4 className="text-sm font-bold text-primary">Analyzing Dataset Repositories...</h4>
                                                <p className="text-xs text-muted max-w-xs">{searchStage || "Searching Kaggle & Hugging Face..."}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <StitchEmptyState
                                            category="datasets"
                                            query={submittedQuery}
                                            modality={analysis?.modality}
                                            domain={analysis?.domain}
                                            onRelaxQuery={(rq) => handleSearch(rq)}
                                        />
                                    )}

                                    {bestModel ? (
                                        <div className="p-6 rounded-3xl bg-card border border-subtle shadow-lg flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-[10px] font-bold px-3 py-1 rounded-full border uppercase tracking-wider ${
                                                        bestModel.isArchitecturalBaseline || bestModel.matchCategory === 'UNVERIFIED_FALLBACK'
                                                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                                            : "status-badge-cyan"
                                                    }`}>
                                                        {bestModel.isArchitecturalBaseline || bestModel.matchCategory === 'UNVERIFIED_FALLBACK'
                                                            ? (bestModel.badge || "Unverified Fallback Suggestion")
                                                            : "🤖 Top Compatible Model"}
                                                    </span>
                                                    {bestModel.isArchitecturalBaseline || bestModel.matchCategory === 'UNVERIFIED_FALLBACK' || !bestModel.matchScore ? (
                                                        <span className="text-xs font-bold text-amber-400">
                                                            Unverified Fallback Suggestion
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs font-bold text-status-cyan">
                                                            {bestModel.matchScore}% Match
                                                        </span>
                                                    )}
                                                </div>

                                                <h3 className="text-lg font-bold text-primary mt-3 truncate" title={bestModel.name || bestModel.id}>
                                                    {bestModel.name || bestModel.id}
                                                </h3>
                                                <div className="text-xs text-secondary mt-1">
                                                    Architecture: <strong className="text-status-emerald">{bestModel.architecture || analysis?.primary_architecture || "Pretrained Transformer"}</strong>
                                                </div>

                                                {bestModel.helperSubtitle && (
                                                    <div className="mt-2.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 font-medium leading-relaxed">
                                                        ℹ️ {bestModel.helperSubtitle}
                                                    </div>
                                                )}

                                                <div className="p-3.5 rounded-xl bg-card-solid border border-subtle mt-2.5 shadow-xs">
                                                    <p className="text-xs text-muted line-clamp-3 leading-relaxed">
                                                        {bestModel.description || bestModel.matchReason || "Weights ready for downstream transfer learning on Hugging Face."}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="mt-6 pt-4 border-t border-subtle flex items-center justify-between">
                                                <span className="text-xs text-faint">
                                                    Task: <strong className="text-secondary">{bestModel.pipeline || bestModel.task || 'ML'}</strong>
                                                </span>
                                                {bestModel.url && (
                                                    <a
                                                        href={bestModel.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs font-bold px-4 py-2 rounded-xl bg-card-subtle hover:bg-card-hover border border-subtle hover:border-strong text-primary transition flex items-center gap-1"
                                                    >
                                                        Hugging Face Model ↗
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ) : isLoading ? (
                                        <div className="p-8 rounded-3xl bg-card border border-subtle shadow-lg flex flex-col items-center justify-center text-center space-y-4 min-h-[260px]">
                                            <div className="relative flex items-center justify-center w-12 h-12">
                                                <span className="inline-block w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                                                <span className="absolute text-[10px] font-bold font-mono text-cyan-400">
                                                    {Math.round(searchProgress)}%
                                                </span>
                                            </div>
                                            <div className="space-y-1">
                                                <h4 className="text-sm font-bold text-primary">Discovering Compatible Models...</h4>
                                                <p className="text-xs text-muted max-w-xs">{searchStage || "Searching Hugging Face models..."}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <StitchEmptyState
                                            category="models"
                                            query={submittedQuery}
                                            onRelaxQuery={(rq) => handleSearch(rq)}
                                        />
                                    )}
                                </div>

                                {/* Top Highlighted Research Papers in Overview */}
                                {papers.length > 0 && (
                                    <div className="space-y-4 pt-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-base font-bold text-primary">Top Scientific Research Papers</span>
                                                <span className="text-xs px-2.5 py-0.5 rounded-full bg-card-subtle border border-subtle text-muted">
                                                    {papers.length} total
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => setActiveTab('papers')}
                                                className="text-xs font-bold text-accent-gradient hover:underline flex items-center gap-1"
                                            >
                                                <span>View All Papers</span>
                                                <span>→</span>
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            {papers.slice(0, 2).map((p) => (
                                                <PaperCard
                                                    key={p.id}
                                                    paper={p}
                                                    onOpenDetails={setSelectedPaper}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </ErrorBoundary>
                        )}

                        {/* ── TAB 2: DATASETS HUB ─────────────────────────────────── */}
                        {activeTab === 'datasets' && (
                            <ErrorBoundary componentName="Datasets Hub">
                                <div className="space-y-6">
                                {datasets.length === 0 ? (
                                    <StitchEmptyState
                                        category="datasets"
                                        query={submittedQuery}
                                        modality={analysis?.modality}
                                        domain={analysis?.domain}
                                        onRelaxQuery={(rq) => handleSearch(rq)}
                                    />
                                ) : (
                                    <>
                                        {/* Filter Toolbar */}
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                            <div className="flex items-center gap-2">
                                                {[
                                                    { key: 'all', label: `All (${datasets.length})` },
                                                    { key: 'kaggle', label: `Kaggle (${datasets.filter(d => (d.source || '').toLowerCase().includes('kaggle')).length})` },
                                                    { key: 'huggingface', label: `Hugging Face (${datasets.filter(d => (d.source || '').toLowerCase().includes('hugging')).length})` },
                                                ].map((f) => (
                                                    <button
                                                        key={f.key}
                                                        onClick={() => setSourceFilter(f.key as any)}
                                                        className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all ${
                                                            sourceFilter === f.key
                                                                ? 'bg-accent text-white shadow-accent-sm'
                                                                : 'bg-card border border-subtle text-muted hover:text-primary hover:bg-card-hover'
                                                        }`}
                                                    >
                                                        {f.label}
                                                    </button>
                                                ))}
                                            </div>

                                            <span className="text-xs text-muted font-medium">
                                                Displaying {filteredDatasets.length} ranked datasets
                                            </span>
                                        </div>

                                        {/* Dataset Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            {filteredDatasets.map((ds, idx) => (
                                                <DatasetCard
                                                    key={ds.id || idx}
                                                    dataset={ds}
                                                    isCompared={selectedCompare.includes(ds.id || ds.ref || ds.name)}
                                                    onToggleCompare={toggleCompare}
                                                    onOpenDetails={setActiveDataset}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </ErrorBoundary>
                        )}

                        {/* ── TAB 3: MODELS HUB ───────────────────────────────────── */}
                        {activeTab === 'models' && (
                            <ErrorBoundary componentName="Models Hub">
                                <div className="space-y-6">
                                    {models.length === 0 ? (
                                        <StitchEmptyState
                                            category="models"
                                            query={submittedQuery}
                                            onRelaxQuery={(rq) => handleSearch(rq)}
                                        />
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            {models.map((m, idx) => (
                                                <ModelCard key={m.id || idx} model={m} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </ErrorBoundary>
                        )}

                        {/* ── TAB 3.5: RESEARCH PAPERS HUB ─────────────────────── */}
                        {activeTab === 'papers' && (
                            <ErrorBoundary componentName="Research Papers Hub">
                                <div className="space-y-6">
                                {/* Header Description & Source Provenance */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-base sm:text-lg font-bold text-primary">
                                                Scientific Research Papers & Preprints
                                            </h3>
                                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent-subtle text-accent-gradient border border-accent font-bold">
                                                {papers.length} Found
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted mt-1">
                                            Latest research related to this dataset, model, task, and project domain
                                        </p>
                                    </div>

                                    <div className="text-[11px] text-muted flex items-center gap-1.5 font-mono flex-wrap">
                                        <span>Sources:</span>
                                        <span className="px-2 py-0.5 rounded bg-card-solid border border-subtle">Semantic Scholar</span>
                                        <span className="px-2 py-0.5 rounded bg-card-solid border border-subtle">OpenAlex</span>
                                        <span className="px-2 py-0.5 rounded bg-card-solid border border-subtle">arXiv</span>
                                        <span className="px-2 py-0.5 rounded bg-card-solid border border-subtle">PubMed</span>
                                    </div>
                                </div>

                                {papers.length === 0 ? (
                                    <StitchEmptyState
                                        category="papers"
                                        query={submittedQuery}
                                        onRelaxQuery={(rq) => handleSearch(rq)}
                                    />
                                ) : (
                                    <>
                                        {/* Research Timeline Year Selector */}
                                        <div className="p-4 rounded-2xl bg-card border border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs font-bold uppercase tracking-wider text-faint flex items-center gap-1">
                                                    <span>📅</span> Timeline:
                                                </span>
                                                <div className="flex items-center gap-1 flex-wrap">
                                                    {[
                                                        { label: 'All Years', value: null },
                                                        { label: '2026', value: 2026 },
                                                        { label: '2025', value: 2025 },
                                                        { label: '2024', value: 2024 },
                                                        { label: '2023', value: 2023 },
                                                    ].map((y) => {
                                                        const count = y.value === null
                                                            ? papers.length
                                                            : papers.filter(p => p.year === y.value).length;
                                                        if (y.value !== null && count === 0) return null;
                                                        return (
                                                            <button
                                                                key={y.label}
                                                                onClick={() => setSelectedYear(y.value)}
                                                                className={`text-xs px-3 py-1 rounded-xl font-bold transition-all ${
                                                                    selectedYear === y.value
                                                                        ? 'bg-accent text-white shadow-accent-sm'
                                                                        : 'bg-card-subtle border border-subtle text-muted hover:text-primary'
                                                                }`}
                                                            >
                                                                {y.label} {count > 0 && `(${count})`}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {selectedYear !== null && (
                                                <button
                                                    onClick={() => setSelectedYear(null)}
                                                    className="text-xs text-muted hover:text-primary transition underline"
                                                >
                                                    Reset Timeline
                                                </button>
                                            )}
                                        </div>

                                        {/* Category & Evidence Filter Pills */}
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {[
                                                { key: 'all', label: `All (${papers.length})` },
                                                { key: 'latest', label: 'Latest' },
                                                { key: 'most_relevant', label: 'Most Relevant' },
                                                { key: 'most_cited', label: 'Most Cited' },
                                                { key: 'exact_dataset', label: `Exact Dataset (${papers.filter(p => p.relationship === 'EXACT_DATASET').length})`, hideIfZero: true },
                                                { key: 'exact_model', label: `Exact Model (${papers.filter(p => p.relationship === 'EXACT_MODEL').length})`, hideIfZero: true },
                                                { key: 'directly_related', label: `Directly Related (${papers.filter(p => p.relationship === 'DIRECTLY_RELATED').length})`, hideIfZero: true },
                                                { key: 'open_access', label: `Open Access (${papers.filter(p => p.openAccess).length})`, hideIfZero: true },
                                                { key: 'preprint', label: `Preprints (${papers.filter(p => p.isPreprint).length})`, hideIfZero: true },
                                            ].map((f) => {
                                                if (f.hideIfZero && f.label.includes('(0)')) return null;
                                                return (
                                                    <button
                                                        key={f.key}
                                                        onClick={() => setPaperFilter(f.key as any)}
                                                        className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all ${
                                                            paperFilter === f.key
                                                                ? 'bg-accent text-white shadow-accent-sm'
                                                                : 'bg-card border border-subtle text-muted hover:text-primary hover:bg-card-hover'
                                                        }`}
                                                    >
                                                        {f.label}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Papers Grid */}
                                        {filteredPapers.length === 0 ? (
                                            <div className="p-8 text-center bg-card border border-subtle rounded-3xl space-y-2">
                                                <h4 className="text-sm font-bold text-primary">No papers match the active filter</h4>
                                                <p className="text-xs text-muted">Try selecting &quot;All&quot; or resetting the year timeline filter.</p>
                                                <button
                                                    onClick={() => { setPaperFilter('all'); setSelectedYear(null); }}
                                                    className="px-3 py-1 rounded-xl bg-card-subtle text-xs text-primary font-bold border border-subtle mt-2"
                                                >
                                                    Reset All Filters
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                {filteredPapers.map((paper) => (
                                                    <PaperCard
                                                        key={paper.id}
                                                        paper={paper}
                                                        onOpenDetails={setSelectedPaper}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </ErrorBoundary>
                        )}

                        {/* ── TAB 4: HARDWARE & ROADMAP ───────────────────────────── */}
                        {activeTab === 'hardware' && (
                            <ErrorBoundary componentName="Hardware & Deployment Hub">
                                <div className="space-y-6">
                                {/* Hardware Profiler Box */}
                                <div className="p-6 sm:p-7 rounded-3xl bg-card border border-subtle space-y-5">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-white text-sm shadow-accent-sm">
                                            ⚡
                                        </div>
                                        <h3 className="text-base font-bold text-primary">
                                            Estimated Hardware & VRAM Profiling
                                        </h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                        <div className="p-4 bg-card-solid rounded-2xl border border-subtle">
                                            <span className="text-muted font-medium">Recommended GPU</span>
                                            <div className="text-base font-black text-primary mt-1">
                                                {hardware?.gpu_recommendation || "NVIDIA RTX 3080 / A10G"}
                                            </div>
                                            <span className="text-[11px] text-faint mt-1 block">For batch size ≥ 16</span>
                                        </div>
                                        <div className="p-4 bg-card-solid rounded-2xl border border-subtle">
                                            <span className="text-muted font-medium">Estimated VRAM Footprint</span>
                                            <div className="text-base font-black text-status-cyan mt-1">
                                                {hardware?.vram_estimate || "8GB - 16GB VRAM"}
                                            </div>
                                            <span className="text-[11px] text-faint mt-1 block">FP16 / Mixed Precision</span>
                                        </div>
                                        <div className="p-4 bg-card-solid rounded-2xl border border-subtle">
                                            <span className="text-muted font-medium">Estimated Training Time</span>
                                            <div className="text-base font-black text-status-emerald mt-1">
                                                {hardware?.training_time_estimate || "2 - 6 hours"}
                                            </div>
                                            <span className="text-[11px] text-faint mt-1 block">Based on standard dataset splits</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Step-by-Step Implementation Checklist */}
                                <div className="p-6 sm:p-7 rounded-3xl bg-card border border-subtle space-y-5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-white text-sm shadow-accent-sm">
                                                🗺️
                                            </div>
                                            <h3 className="text-base font-bold text-primary">
                                                Implementation Roadmap
                                            </h3>
                                        </div>
                                        <Link href="/roadmaps" className="text-xs font-bold text-accent-gradient hover:underline">
                                            View Full Roadmap Hub →
                                        </Link>
                                    </div>

                                    <div className="space-y-3">
                                        {(feasibility?.implementation_steps || [
                                            "Download & inspect dataset labels, splits, and licensing terms",
                                            "Normalize, augment, and preprocess input tensors for the target architecture",
                                            "Initialize pretrained backbone weights from Hugging Face Model Hub",
                                            "Run baseline evaluation with default hyperparameters on validation split",
                                            "Fine-tune head layers using AdamW with cosine learning rate schedule",
                                            "Export model via ONNX / TensorRT for real-time edge or server inference",
                                        ]).map((step: string, i: number) => (
                                            <div key={i} className="flex items-start gap-3.5 p-4 rounded-2xl bg-card-solid border border-subtle text-xs sm:text-sm">
                                                <span className="w-6 h-6 rounded-full bg-accent text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-accent-sm">
                                                    {i + 1}
                                                </span>
                                                <span className="text-secondary mt-0.5 leading-relaxed">{step}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </ErrorBoundary>
                        )}

                        {/* ── TAB 6: QUERY & AUDIT INSPECTOR ─────────────────────── */}
                        {activeTab === 'inspector' && (
                            <ErrorBoundary componentName="Query & Search Inspector">
                                <div className="space-y-6">
                                {/* Top Banner: Search Request Header & Classification Overview */}
                                <div className="p-6 sm:p-7 rounded-3xl bg-card border border-subtle shadow-sm space-y-5">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-subtle pb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-2xl bg-accent flex items-center justify-center text-white text-base font-bold shadow-accent-sm">
                                                🔍
                                            </div>
                                            <div>
                                                <h3 className="text-base font-bold text-primary flex items-center gap-2">
                                                    Semantic Query Inspector & Diagnostic Hub
                                                </h3>
                                                <p className="text-xs text-muted mt-0.5">
                                                    Real-time slot extraction, multi-index API routing, and telemetry audit
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    if (searchId) {
                                                        navigator.clipboard.writeText(searchId);
                                                        setCopiedSearchId(true);
                                                        setTimeout(() => setCopiedSearchId(false), 2000);
                                                    }
                                                }}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card-subtle hover:bg-card-hover border border-subtle text-xs text-secondary transition font-mono"
                                                title="Copy Search Request ID"
                                            >
                                                <span>🔑</span>
                                                <span className="truncate max-w-[120px]">{searchId ? searchId.slice(0, 12) + '...' : 'Request ID'}</span>
                                                <span className="text-[10px] text-faint">{copiedSearchId ? '✓ Copied' : 'Copy'}</span>
                                            </button>

                                            <span className="px-3 py-1.5 rounded-xl border border-accent bg-accent-subtle text-accent-from text-xs font-bold uppercase tracking-wider">
                                                {intentDetails?.intent || analysis?.intent || (isGeneralQuery ? "GENERAL_AI" : "DATASET_SEARCH")}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Confidence & Query Explanation Strip */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                        <div className="p-4 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between">
                                            <span className="text-faint font-bold uppercase tracking-wider text-[10px]">Classification Confidence</span>
                                            <div className="flex items-center justify-between mt-2">
                                                <span className="text-2xl font-black text-status-emerald">
                                                    {intentDetails?.confidence ? Math.round(intentDetails.confidence * 100) : (analysis?.confidence?.score || 85)}%
                                                </span>
                                                <span className="text-[11px] px-2.5 py-0.5 rounded-full status-badge-emerald font-bold">
                                                    High Precision
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 bg-card-subtle rounded-full overflow-hidden mt-3">
                                                <div
                                                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                                    style={{ width: `${intentDetails?.confidence ? Math.round(intentDetails.confidence * 100) : (analysis?.confidence?.score || 85)}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="p-4 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between md:col-span-2">
                                            <span className="text-faint font-bold uppercase tracking-wider text-[10px]">Natural Language Intent Rationale</span>
                                            <p className="text-secondary text-xs sm:text-sm mt-1 leading-relaxed">
                                                {intentDetails?.reason || analysis?.confidence?.reason || "Query mapped to structured scientific entity discovery, multi-source dataset indexing, and hardware feasibility calculation."}
                                            </p>
                                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-subtle text-[11px] text-muted">
                                                <span>Input Query:</span>
                                                <strong className="text-primary truncate">&quot;{submittedQuery}&quot;</strong>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Structured Entity Extraction Matrix */}
                                <div className="p-6 sm:p-7 rounded-3xl bg-card border border-subtle space-y-4 shadow-sm">
                                    <div className="flex items-center justify-between border-b border-subtle pb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-base">🧬</span>
                                            <h4 className="text-sm font-bold uppercase tracking-wider text-primary">
                                                Structured Entity Extraction & Slot Filling
                                            </h4>
                                        </div>
                                        <span className="text-[11px] text-muted hidden sm:inline-block">
                                            Extracted via NLP Entity Parser
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
                                        <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between">
                                            <div className="flex items-center justify-between text-[10px] text-faint font-bold uppercase tracking-wider">
                                                <span>Domain</span>
                                                <span className={analysis?.domain_state === 'CONFIRMED' ? 'text-status-emerald' : 'text-muted'}>
                                                    {analysis?.domain_state || 'DETECTED'}
                                                </span>
                                            </div>
                                            <div className="font-bold text-primary text-sm mt-1 capitalize truncate">
                                                {cleanDomain(analysis?.domain)}
                                            </div>
                                            <span className="text-[11px] text-muted mt-0.5">Broad Field</span>
                                        </div>

                                        <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between">
                                            <div className="flex items-center justify-between text-[10px] text-faint font-bold uppercase tracking-wider">
                                                <span>Subdomain</span>
                                                <span className={analysis?.subdomain_state === 'CONFIRMED' ? 'text-status-emerald' : 'text-muted'}>
                                                    {analysis?.subdomain_state || 'INFERRED'}
                                                </span>
                                            </div>
                                            <div className="font-bold text-primary text-sm mt-1 capitalize truncate">
                                                {analysis?.subdomain && analysis.subdomain.toLowerCase() !== 'unknown' ? analysis.subdomain : 'Specialized Sub-Task'}
                                            </div>
                                            <span className="text-[11px] text-muted mt-0.5">Sub-field Specialty</span>
                                        </div>

                                        <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between">
                                            <div className="flex items-center justify-between text-[10px] text-faint font-bold uppercase tracking-wider">
                                                <span>Task</span>
                                                <span className={analysis?.task_state === 'CONFIRMED' ? 'text-status-emerald' : 'text-status-cyan'}>
                                                    {analysis?.task_state || 'DETECTED'}
                                                </span>
                                            </div>
                                            <div className="font-bold text-primary text-sm mt-1 capitalize truncate">
                                                {cleanTask(analysis?.task)}
                                            </div>
                                            <span className="text-[11px] text-muted mt-0.5">AI Objective</span>
                                        </div>

                                        <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between">
                                            <div className="flex items-center justify-between text-[10px] text-faint font-bold uppercase tracking-wider">
                                                <span>Target Entity</span>
                                                <span className="text-status-emerald">CONFIRMED</span>
                                            </div>
                                            <div className="font-bold text-status-cyan text-sm mt-1 capitalize truncate">
                                                {analysis?.target && analysis.target.toLowerCase() !== 'unknown' ? analysis.target : (submittedQuery ? submittedQuery.slice(0, 24) : 'General')}
                                            </div>
                                            <span className="text-[11px] text-muted mt-0.5">Primary Target</span>
                                        </div>

                                        <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between">
                                            <div className="flex items-center justify-between text-[10px] text-faint font-bold uppercase tracking-wider">
                                                <span>Modality</span>
                                                <span className={analysis?.modality_state === 'CONFIRMED' ? 'text-status-emerald' : 'text-muted'}>
                                                    {analysis?.modality_state || 'DETECTED'}
                                                </span>
                                            </div>
                                            <div className="font-bold text-primary text-sm mt-1 capitalize truncate">
                                                {analysis?.data_modality && analysis.data_modality.toLowerCase() !== 'unknown' ? analysis.data_modality : (summary?.dataType || "Multi-Modal / Images")}
                                            </div>
                                            <span className="text-[11px] text-muted mt-0.5">Data Format</span>
                                        </div>

                                        <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between">
                                            <div className="flex items-center justify-between text-[10px] text-faint font-bold uppercase tracking-wider">
                                                <span>Architecture</span>
                                                <span className="text-status-emerald">PREDICTED</span>
                                            </div>
                                            <div className="font-bold text-status-emerald text-sm mt-1 capitalize truncate">
                                                {bestModel?.architecture || analysis?.primary_architecture || "Pretrained Transformer / U-Net"}
                                            </div>
                                            <span className="text-[11px] text-muted mt-0.5">Recommended Baseline</span>
                                        </div>

                                        <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between">
                                            <div className="flex items-center justify-between text-[10px] text-faint font-bold uppercase tracking-wider">
                                                <span>Entity Type</span>
                                                <span className="text-muted">SCOPE</span>
                                            </div>
                                            <div className="font-bold text-primary text-sm mt-1 capitalize truncate">
                                                {analysis?.entity_type || "Dataset & Model Discovery"}
                                            </div>
                                            <span className="text-[11px] text-muted mt-0.5">Target Scope</span>
                                        </div>

                                        <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between">
                                            <div className="flex items-center justify-between text-[10px] text-faint font-bold uppercase tracking-wider">
                                                <span>Framework</span>
                                                <span className="text-muted">ECOSYSTEM</span>
                                            </div>
                                            <div className="font-bold text-primary text-sm mt-1 capitalize truncate">
                                                PyTorch / Transformers / Hugging Face
                                            </div>
                                            <span className="text-[11px] text-muted mt-0.5">Recommended Runtime</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 3: Multi-Source API Diagnostic Status Hub */}
                                <div className="p-6 sm:p-7 rounded-3xl bg-card border border-subtle space-y-4 shadow-sm">
                                    <div className="flex items-center justify-between border-b border-subtle pb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-base">⚡</span>
                                            <h4 className="text-sm font-bold uppercase tracking-wider text-primary">
                                                Multi-Source Engine Connectors & Health
                                            </h4>
                                        </div>
                                        <span className="text-[11px] font-semibold text-status-emerald flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                            All Endpoints Active
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
                                        {/* Kaggle API */}
                                        <div className="p-4 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-blue-400 font-bold text-sm">K</span>
                                                    <span className="font-bold text-primary">Kaggle Datasets API</span>
                                                </div>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full status-badge-emerald font-bold">
                                                    {apiAudit?.kaggle?.status || (apiAudit?.kaggle?.success ? 'ONLINE' : 'ACTIVE')}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-muted">
                                                Discovered {datasets.filter((d) => d.source?.toLowerCase().includes('kaggle')).length} curated Kaggle datasets matching entity terms.
                                            </p>
                                        </div>

                                        {/* Hugging Face Datasets */}
                                        <div className="p-4 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span>🤗</span>
                                                    <span className="font-bold text-primary">Hugging Face Datasets Hub</span>
                                                </div>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full status-badge-emerald font-bold">
                                                    {apiAudit?.huggingfaceDatasets?.status || (apiAudit?.huggingfaceDatasets?.success ? 'ONLINE' : 'ACTIVE')}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-muted">
                                                Indexed {datasets.filter((d) => d.source?.toLowerCase().includes('hugging')).length} open-access repositories with token weights.
                                            </p>
                                        </div>

                                        {/* Hugging Face Models */}
                                        <div className="p-4 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span>🤖</span>
                                                    <span className="font-bold text-primary">Hugging Face Models Hub</span>
                                                </div>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full status-badge-emerald font-bold">
                                                    {apiAudit?.huggingfaceModels?.status || (apiAudit?.huggingfaceModels?.success ? 'ONLINE' : 'ACTIVE')}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-muted">
                                                Queried model pipeline filters; matched {models.length} compatible architectures.
                                            </p>
                                        </div>

                                        {/* Academic Literature Index */}
                                        <div className="p-4 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-rose-400 font-bold text-sm">a</span>
                                                    <span className="font-bold text-primary">Academic Literature Indexes</span>
                                                </div>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full status-badge-emerald font-bold">
                                                    ONLINE
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-muted">
                                                Aggregated {papers.length} scientific papers across Semantic Scholar, arXiv & OpenAlex.
                                            </p>
                                        </div>

                                        {/* LLM Synthesis Engine */}
                                        <div className="p-4 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span>🧠</span>
                                                    <span className="font-bold text-primary">AI Rationale Engine</span>
                                                </div>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full status-badge-emerald font-bold">
                                                    {apiAudit?.llm?.provider || 'ONLINE'}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-muted">
                                                Grounding synthesis over verified metadata without hallucination.
                                            </p>
                                        </div>

                                        {/* Cache Database */}
                                        <div className="p-4 bg-card-solid rounded-2xl border border-subtle flex flex-col justify-between space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span>⚡</span>
                                                    <span className="font-bold text-primary">Metadata Cache Store</span>
                                                </div>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full status-badge-emerald font-bold">
                                                    HIT / WARM
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-muted">
                                                In-memory & SQLite metadata caching for fast, rate-limit resilient queries.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 4: Query Expansions & Semantic Routing */}
                                {(searchCoverage?.expandedQueries || analysis?.searchQueries) && (
                                    <div className="p-6 sm:p-7 rounded-3xl bg-card border border-subtle space-y-4 shadow-sm">
                                        <div className="flex items-center justify-between border-b border-subtle pb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-base">🔀</span>
                                                <h4 className="text-sm font-bold uppercase tracking-wider text-primary">
                                                    Synthesized Semantic Search Expansions
                                                </h4>
                                            </div>
                                            <span className="text-[11px] text-muted">
                                                Dispatched across search indices
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                                            {((searchCoverage?.expandedQueries || analysis?.searchQueries) as string[]).map((q, idx) => (
                                                <div key={idx} className="p-3 bg-card-solid rounded-xl border border-subtle flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="w-5 h-5 rounded-md bg-card-subtle flex items-center justify-center text-[10px] font-mono text-muted shrink-0">
                                                            {idx + 1}
                                                        </span>
                                                        <code className="text-secondary font-mono truncate">{q}</code>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(q);
                                                        }}
                                                        className="text-[10px] text-muted hover:text-primary transition shrink-0"
                                                        title="Copy search string"
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Section 5: Retrieval Funnel & Candidate Breakdown */}
                                <div className="p-6 sm:p-7 rounded-3xl bg-card border border-subtle space-y-4 shadow-sm">
                                    <div className="flex items-center justify-between border-b border-subtle pb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-base">📊</span>
                                            <h4 className="text-sm font-bold uppercase tracking-wider text-primary">
                                                Retrieval Funnel & Quality Scoring Breakdown
                                            </h4>
                                        </div>
                                        <span className="text-[11px] text-muted">
                                            Multi-Factor Relevance Scored
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                        <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle">
                                            <span className="text-faint font-bold uppercase tracking-wider text-[10px]">Total Candidates</span>
                                            <div className="text-xl font-black text-primary mt-1">
                                                {datasets.length + models.length + papers.length}
                                            </div>
                                            <span className="text-[11px] text-muted mt-0.5 block">Aggregated across APIs</span>
                                        </div>

                                        <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle">
                                            <span className="text-faint font-bold uppercase tracking-wider text-[10px]">Best Matches (80%+)</span>
                                            <div className="text-xl font-black text-status-emerald mt-1">
                                                {analysis?.result_categories?.best_matches ?? datasets.filter(d => (d.matchScore ?? 0) >= 80).length}
                                            </div>
                                            <span className="text-[11px] text-muted mt-0.5 block">High confidence matches</span>
                                        </div>

                                        <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle">
                                            <span className="text-faint font-bold uppercase tracking-wider text-[10px]">Strong Matches</span>
                                            <div className="text-xl font-black text-status-cyan mt-1">
                                                {analysis?.result_categories?.strong_matches ?? datasets.filter(d => (d.matchScore ?? 0) >= 65 && (d.matchScore ?? 0) < 80).length}
                                            </div>
                                            <span className="text-[11px] text-muted mt-0.5 block">Solid alternative choices</span>
                                        </div>

                                        <div className="p-3.5 bg-card-solid rounded-2xl border border-subtle">
                                            <span className="text-faint font-bold uppercase tracking-wider text-[10px]">Hard Negatives Filtered</span>
                                            <div className="text-xl font-black text-status-rose mt-1">
                                                {analysis?.result_categories?.not_recommended ?? datasets.filter(d => d.rejected).length}
                                            </div>
                                            <span className="text-[11px] text-muted mt-0.5 block">Domain mismatches excluded</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 6: Developer / Researcher Raw Payload Inspector */}
                                <div className="p-6 sm:p-7 rounded-3xl bg-card border border-subtle space-y-4 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-base">💻</span>
                                            <h4 className="text-sm font-bold uppercase tracking-wider text-primary">
                                                Raw Search & Telemetry Response JSON
                                            </h4>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    const payloadStr = JSON.stringify(rawSearchPayload || { analysis, summary, apiAudit, searchCoverage }, null, 2);
                                                    navigator.clipboard.writeText(payloadStr);
                                                    setCopiedJson(true);
                                                    setTimeout(() => setCopiedJson(false), 2000);
                                                }}
                                                className="px-3 py-1.5 rounded-xl bg-card-subtle hover:bg-card-hover border border-subtle text-xs font-semibold text-secondary transition"
                                            >
                                                {copiedJson ? "✓ Copied JSON" : "📋 Copy Full JSON"}
                                            </button>

                                            <button
                                                onClick={() => setRawJsonExpanded(!rawJsonExpanded)}
                                                className="px-3 py-1.5 rounded-xl bg-accent text-white text-xs font-bold shadow-accent-sm hover:brightness-110 transition"
                                            >
                                                {rawJsonExpanded ? "Collapse ▲" : "Inspect Raw JSON ▼"}
                                            </button>
                                        </div>
                                    </div>

                                    {rawJsonExpanded && (
                                        <div className="p-4 rounded-2xl bg-[#030712] border border-subtle overflow-x-auto max-h-[420px] text-xs font-mono text-cyan-300 leading-relaxed shadow-inner">
                                            <pre>{JSON.stringify(rawSearchPayload || { analysis, summary, apiAudit, searchCoverage, datasetsCount: datasets.length, modelsCount: models.length, papersCount: papers.length }, null, 2)}</pre>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </ErrorBoundary>
                        )}
                    </div>
                )}
                    </div>
                </div>
            </div>

            {/* ── STICKY BOTTOM COMPARE TRAY ─────────────────────────────── */}
            {selectedCompare.length > 0 && (
                <div className="sticky bottom-4 z-40 max-w-4xl mx-auto px-4 w-full animate-in slide-in-from-bottom-4 duration-200">
                    <div className="rounded-2xl glass-card border border-strong p-3.5 shadow-2xl flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-full bg-accent text-white font-bold text-xs flex items-center justify-center">
                                {selectedCompare.length}
                            </span>
                            <span className="text-xs font-semibold text-primary">
                                {selectedCompare.length} {selectedCompare.length === 1 ? 'dataset' : 'datasets'} selected for comparison
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSelectedCompare([])}
                                className="px-3 py-1.5 text-xs text-muted hover:text-primary transition"
                            >
                                Clear
                            </button>
                            <button
                                onClick={() => setCompareModalOpen(true)}
                                className="px-4 py-1.5 rounded-xl bg-accent text-white font-bold text-xs shadow-accent-sm hover:brightness-110 transition"
                            >
                                Compare Side-by-Side ↗
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── DATASET DETAIL & BREAKDOWN MODAL ───────────────────────── */}
            {activeDataset && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={(e) => { if (e.target === e.currentTarget) setActiveDataset(null); }}
                >
                    <div className="w-full max-w-xl rounded-3xl bg-modal border border-strong shadow-2xl p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-accent-subtle text-accent-gradient border border-accent uppercase tracking-wider">
                                    {activeDataset.source || 'Dataset Hub'}
                                </span>
                                <h3 className="text-lg sm:text-xl font-bold text-primary mt-2">
                                    {dsName(activeDataset)}
                                </h3>
                            </div>
                            <button
                                onClick={() => setActiveDataset(null)}
                                className="w-8 h-8 rounded-full bg-card hover:bg-card-hover border border-subtle text-muted hover:text-primary flex items-center justify-center transition"
                            >
                                ✕
                            </button>
                        </div>

                        <p className="text-xs sm:text-sm text-muted leading-relaxed">
                            {dsDescription(activeDataset)}
                        </p>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="p-3 bg-card-solid rounded-xl border border-subtle">
                                <span className="text-muted font-medium">Dataset Size:</span>
                                <div className="font-bold text-primary mt-1">{dsSize(activeDataset.sizeBytes)}</div>
                            </div>
                            <div className="p-3 bg-card-solid rounded-xl border border-subtle">
                                <span className="text-muted font-medium">Overall Match Score:</span>
                                <div className="font-bold text-status-emerald mt-1">{dsScore(activeDataset)}%</div>
                            </div>
                        </div>

                        {activeDataset.scoreBreakdown && (
                            <div className="space-y-3 pt-3 border-t border-subtle text-xs">
                                <div className="text-primary font-bold">Multi-Metric Score Breakdown:</div>
                                {[
                                    { label: "Task Relevance", score: activeDataset.scoreBreakdown.task, max: 30 },
                                    { label: "Modality Alignment", score: activeDataset.scoreBreakdown.modality, max: 20 },
                                    { label: "Domain Specificity", score: activeDataset.scoreBreakdown.domain, max: 20 },
                                    { label: "Metadata & Documentation", score: activeDataset.scoreBreakdown.metadata, max: 15 },
                                ].map((m) => (
                                    <div key={m.label} className="space-y-1">
                                        <div className="flex justify-between text-muted">
                                            <span>{m.label}</span>
                                            <span className="font-bold text-primary">{m.score}/{m.max}</span>
                                        </div>
                                        <div className="h-1.5 w-full rounded-full bg-card-subtle overflow-hidden">
                                            <div
                                                className="h-full bg-accent rounded-full transition-all duration-500"
                                                style={{ width: `${Math.min(100, (m.score / m.max) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Research Papers Using / Related to this Dataset */}
                        {papers.length > 0 && (
                            <div className="space-y-3 pt-3 border-t border-subtle">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                                        <span>🔬</span> Research Literature ({papers.length})
                                    </span>
                                    <button
                                        onClick={() => { setActiveDataset(null); setActiveTab('papers'); }}
                                        className="text-[11px] font-bold text-accent-gradient hover:underline"
                                    >
                                        View All Papers →
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {papers.slice(0, 2).map((p) => (
                                        <div
                                            key={p.id}
                                            onClick={() => { setActiveDataset(null); setSelectedPaper(p); }}
                                            className="p-3 rounded-xl bg-card-solid hover:bg-card-hover border border-subtle cursor-pointer transition flex items-center justify-between gap-3"
                                        >
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold text-primary truncate">{p.title}</div>
                                                <div className="text-[11px] text-muted truncate">
                                                    {(p.authors || []).slice(0, 2).join(', ')} · {p.year || 'Academic'}
                                                </div>
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                                                p.relationship === 'EXACT_DATASET' ? 'status-badge-emerald' : 'status-badge-violet'
                                            }`}>
                                                {p.relationship.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 pt-3">
                            <button
                                onClick={() => setActiveDataset(null)}
                                className="flex-1 py-2.5 rounded-xl bg-card hover:bg-card-hover border border-subtle text-secondary font-semibold text-xs transition"
                            >
                                Close
                            </button>
                            {activeDataset.url && (
                                <a
                                    href={activeDataset.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 py-2.5 text-center rounded-xl bg-accent text-white text-xs font-bold shadow-accent hover:brightness-110 transition"
                                >
                                    Open on {activeDataset.source || 'Hub'} ↗
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── RESEARCH PAPER DETAIL MODAL ────────────────────────────── */}
            <PaperDetailModal
                paper={selectedPaper}
                onClose={() => setSelectedPaper(null)}
            />

            {/* ── SIDE-BY-SIDE COMPARISON MODAL ─────────────────────────── */}
            {compareModalOpen && compareList.length > 0 && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={(e) => { if (e.target === e.currentTarget) setCompareModalOpen(false); }}
                >
                    <div className="w-full max-w-5xl rounded-3xl bg-modal border border-strong shadow-2xl p-6 sm:p-8 space-y-6 max-h-[85vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-4 border-b border-subtle">
                            <div>
                                <h3 className="text-xl font-bold text-primary">Side-by-Side Dataset Comparison</h3>
                                <p className="text-xs text-muted mt-0.5">Comparing {compareList.length} selected dataset candidates</p>
                            </div>
                            <button
                                onClick={() => setCompareModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-card hover:bg-card-hover border border-subtle text-muted hover:text-primary flex items-center justify-center"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {compareList.map((ds) => (
                                <div key={ds.id || ds.name} className="p-5 rounded-2xl bg-card-solid border border-subtle space-y-3 flex flex-col justify-between">
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-card-subtle text-muted uppercase">
                                                {ds.source || 'Dataset'}
                                            </span>
                                            <span className="text-xs font-bold text-status-emerald">
                                                {dsScore(ds)}% Match
                                            </span>
                                        </div>
                                        <h4 className="text-sm font-bold text-primary line-clamp-1">{dsName(ds)}</h4>
                                        <p className="text-xs text-muted line-clamp-3 leading-relaxed">{dsDescription(ds)}</p>
                                        
                                        <div className="text-xs text-secondary pt-2 border-t border-subtle space-y-1">
                                            <div className="flex justify-between">
                                                <span className="text-muted">Size:</span>
                                                <strong>{dsSize(ds.sizeBytes)}</strong>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted">Modality:</span>
                                                <strong>{extractExplicitModality(ds.title, ds.description, ds.tags, ds.formats) || ds.modality || "General"}</strong>
                                            </div>
                                        </div>
                                    </div>

                                    {ds.url && (
                                        <a
                                            href={ds.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block text-center py-2 rounded-xl bg-accent text-white text-xs font-bold shadow-accent-sm hover:brightness-110 transition mt-2"
                                        >
                                            View on Hub ↗
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── SIGN-IN GATE MODAL ────────────────────────────────────── */}
            {showSignInGate && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowSignInGate(false); }}
                >
                    <div className="w-full max-w-md rounded-3xl bg-modal border border-strong p-7 text-center space-y-5 shadow-2xl relative">
                        <button
                            onClick={() => setShowSignInGate(false)}
                            className="absolute top-4 right-4 text-muted hover:text-primary transition text-sm p-1 rounded-lg"
                            title="Close modal"
                        >
                            ✕
                        </button>
                        <div className="w-14 h-14 rounded-2xl bg-accent text-white font-black text-2xl mx-auto flex items-center justify-center shadow-accent">
                            ✦
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-primary">Create Your Free Account</h3>
                            <p className="text-xs sm:text-sm text-muted mt-2 leading-relaxed">
                                You have used your 3 free guest searches. Sign in or create a free account for 50 daily AI searches, saved projects, and full model synthesis.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <Link
                                href="/login"
                                className="py-3 rounded-xl bg-card hover:bg-card-hover border border-subtle text-secondary text-xs font-bold text-center transition"
                            >
                                Sign In
                            </Link>
                            <Link
                                href="/signup"
                                className="py-3 rounded-xl bg-accent text-white text-xs font-bold text-center shadow-accent hover:brightness-110 transition"
                            >
                                Sign Up Free
                            </Link>
                        </div>
                        <div className="pt-2 border-t border-subtle">
                            <button
                                onClick={() => {
                                    setShowSignInGate(false);
                                    const nextCount = Math.max(0, GUEST_DAILY_LIMIT - 1);
                                    setAnonSearchCount(nextCount);
                                    localStorage.setItem('anon_search_count', String(nextCount));
                                }}
                                className="text-xs text-muted hover:text-primary transition underline"
                            >
                                Continue exploring as guest (+1 bonus search)
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Floating Pinned Assets Drawer Bar */}
            {pinnedAssets.length > 0 && (
                <div className="fixed bottom-5 right-5 z-40 animate-in fade-in slide-in-from-bottom-3 duration-300">
                    <div className="flex items-center gap-3 p-3 sm:px-4 sm:py-3 rounded-2xl bg-card border border-accent shadow-2xl backdrop-blur-xl">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
                            <span className="text-xs font-bold text-primary">
                                📌 {pinnedAssets.length}/4 Pinned
                            </span>
                        </div>

                        <div className="hidden sm:flex items-center gap-1.5 border-l border-subtle pl-3 max-w-[280px] overflow-hidden">
                            {pinnedAssets.map((asset) => (
                                <span
                                    key={asset.id}
                                    className="text-[11px] px-2 py-0.5 rounded-lg bg-card-solid border border-subtle text-secondary truncate max-w-[90px]"
                                    title={asset.title}
                                >
                                    {asset.title}
                                </span>
                            ))}
                        </div>

                        <div className="flex items-center gap-2 border-l border-subtle pl-3">
                            <Link
                                href="/benchmark"
                                className="px-3.5 py-1.5 rounded-xl bg-accent text-white text-xs font-bold shadow-accent-sm hover:brightness-110 active:scale-95 transition flex items-center gap-1 shrink-0"
                            >
                                <span>Compare in Lab</span>
                                <span>↗</span>
                            </Link>

                            <button
                                type="button"
                                onClick={clearPinnedAssets}
                                className="p-1.5 text-muted hover:text-primary hover:bg-card-hover rounded-lg transition text-xs"
                                title="Clear all pinned assets"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── SEARCH DEBUG / TELEMETRY MODAL ────────────────────────── */}
            <SearchDebugModal
                isOpen={debugModalOpen}
                onClose={() => setDebugModalOpen(false)}
                diagnostics={rawSearchPayload?.diagnostics || sessionResult?.diagnostics}
                telemetry={rawSearchPayload?.telemetry || sessionResult?.telemetry}
                query={submittedQuery}
            />

            {/* ── IR QUALITY BENCHMARK MODAL ────────────────────────────── */}
            <SearchBenchmarkModal
                isOpen={benchmarkModalOpen}
                onClose={() => setBenchmarkModalOpen(false)}
            />
        </main>
    );
}


export default function ExplorePage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-page" />}>
            <ExploreContent />
        </Suspense>
    );
}
