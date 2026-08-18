"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import ChatWidget from "@/components/ChatWidget";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

type DatasetItem = {
    // API response fields (NormalizedDataset)
    id: string;
    name: string;
    title?: string;       // present in fallback datasets
    subtitle?: string;    // present in fallback datasets
    description?: string;
    url: string;
    creator?: string;
    creatorName?: string; // legacy alias
    ref?: string;
    matchScore?: number;
    relevanceScore?: number; // legacy alias
    scoreBreakdown?: {
        task: number;
        modality: number;
        domain: number;
        subdomain: number;
        target: number;
        metadata: number;
    };
    license?: string;
    sizeBytes?: number;
    datasetSize?: number; // legacy alias
    source?: string;
    matchReason?: string;
    rejected?: boolean;
    rejectionReason?: string;
};

type ModelItem = {
    id: string;
    pipeline?: string;
    url: string;
    matchScore?: number;
    difficulty?: string;
    recommendation?: string;
    description?: string;
};

export default function ExplorePage() {
    const { data: session } = useSession();
    const [searchInput, setSearchInput] = useState("");
    const [submittedQuery, setSubmittedQuery] = useState("");
    const [searchId, setSearchId] = useState<string | null>(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    // Search states
    const [isLoading, setIsLoading] = useState(false);
    const [intent, setIntent] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<any>(null);
    const [recommendationKeywords, setRecommendationKeywords] = useState<string[]>([]);
    const [kaggleResults, setKaggleResults] = useState<any[]>([]);
    const [hfModels, setHfModels] = useState<any[]>([]);
    const [hfDatasets, setHfDatasets] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [feasibility, setFeasibility] = useState<any>(null);
    const [hardware, setHardware] = useState<any>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [conversationMessage, setConversationMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedCompare, setSelectedCompare] = useState<string[]>([]);
    const [compareModalOpen, setCompareModalOpen] = useState(false);
    const [activeDataset, setActiveDataset] = useState<DatasetItem | null>(null);
    const [sourceFilters, setSourceFilters] = useState<string[]>(['kaggle', 'huggingface']);
    const [taskFilters, setTaskFilters] = useState<string[]>([]);
    const [dataTypeFilters, setDataTypeFilters] = useState<string[]>([]);
    const [difficultyFilters, setDifficultyFilters] = useState<string[]>([]);
    const [aiMode, setAiMode] = useState<'LIVE' | 'MOCK' | null>(null);
    const [aiError, setAiError] = useState<{ type: string; message: string; hint?: string } | null>(null);
    const [usingFallbackDatasets, setUsingFallbackDatasets] = useState(false);
    const [apiAudit, setApiAudit] = useState<any>(null);
    const [apiPanelExpanded, setApiPanelExpanded] = useState(false);
    const [compactFocused, setCompactFocused] = useState(false);
    const [searchCoverage, setSearchCoverage] = useState<any>(null);
    const [datasetCompatibility, setDatasetCompatibility] = useState<any[]>([]);
    const [labelMapping, setLabelMapping] = useState<any[]>([]);
    const [recommendationCategories, setRecommendationCategories] = useState<any[]>([]);
    const [smartRecommendation, setSmartRecommendation] = useState<any>(null);
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
    const toggleCard = (id: string) => setExpandedCards(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    const [anonSearchCount, setAnonSearchCount] = useState<number>(() => {
        if (typeof window === 'undefined') return 0;
        return parseInt(localStorage.getItem('anon_search_count') || '0', 10);
    });
    const [showSignInGate, setShowSignInGate] = useState(false);

    const latestRequestRef = useRef<string>('');
    const abortControllerRef = useRef<AbortController | null>(null);
    const heroTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const compactTextareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    // Resize helper — only expands hero textarea freely;
    // compact textarea stays collapsed unless focused (controlled by onFocus/onBlur)
    const resizeTextareas = () => {
        // Hero textarea: always auto-expand
        if (heroTextareaRef.current) {
            const el = heroTextareaRef.current;
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        }
        // Compact textarea: only expand if currently focused; otherwise keep at 1 line
        if (compactTextareaRef.current && !compactTextareaRef.current.matches(':focus')) {
            compactTextareaRef.current.style.height = '38px';
            compactTextareaRef.current.style.overflow = 'hidden';
        }
    };

    // Run after every render to keep hero textarea sized correctly
    useEffect(() => {
        resizeTextareas();
    }); // no dependency array = runs after every render

    const bestDataset = summary?.bestDataset;
    const bestModel = summary?.bestModel;

    const compareDatasets = useMemo(() => {
        const allDs = [...kaggleResults, ...hfDatasets];
        return allDs.filter((item: any) => selectedCompare.includes(item.ref || item.id));
    }, [kaggleResults, hfDatasets, selectedCompare]);

    const filteredDatasets = useMemo(() => {
        if (!kaggleResults) return [];
        return kaggleResults.filter((item: any) => {
            if (sourceFilters.length && !sourceFilters.includes(item.source || 'kaggle')) return false;
            if (taskFilters.length && item.taskTags && !item.taskTags.some((tag: string) => taskFilters.includes(tag))) return false;
            if (dataTypeFilters.length && item.dataTypeTags && !item.dataTypeTags.some((tag: string) => dataTypeFilters.includes(tag))) return false;
            return true;
        });
    }, [kaggleResults, sourceFilters, taskFilters, dataTypeFilters]);

    const filteredModels = useMemo(() => {
        if (!hfModels) return [];
        return hfModels.filter((item: any) => {
            if (sourceFilters.length && !sourceFilters.includes(item.source || 'huggingface')) return false;
            if (difficultyFilters.length && item.difficulty && !difficultyFilters.includes(item.difficulty)) return false;
            return true;
        });
    }, [hfModels, sourceFilters, difficultyFilters]);

    const toggleFilter = (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
        setter((current) =>
            current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
        );
    };

    const formatBytes = (bytes?: number) => {
        if (!bytes || bytes === 0) return 'Information unavailable';
        const gb = bytes / 1024 / 1024 / 1024;
        return `${gb < 1 ? (bytes / 1024 / 1024).toFixed(1) : gb.toFixed(1)} ${gb < 1 ? 'MB' : 'GB'}`;
    };

    // Normalise dataset fields — API uses NormalizedDataset shape, fallback data has legacy aliases
    const dsName = (ds: DatasetItem) => ds.title || ds.name || ds.id || 'Unnamed Dataset';
    const dsSubtitle = (ds: DatasetItem) => ds.subtitle || ds.description || '';
    const dsCreator = (ds: DatasetItem) => ds.creator || ds.creatorName || 'Unknown';
    const dsSize = (ds: DatasetItem) => ds.sizeBytes ?? ds.datasetSize;
    const dsScore = (ds: DatasetItem) => ds.matchScore ?? ds.relevanceScore ?? 0;
    const dsBreakdown = (ds: DatasetItem) => ds.scoreBreakdown;
    const dsRef = (ds: DatasetItem) => ds.ref || ds.id || '';

    const normalizeTaskText = (value: unknown): string => {
        if (Array.isArray(value)) return value.filter(Boolean).map(String).join(', ');
        return String(value ?? '').trim();
    };

    const taskDisplay = normalizeTaskText(analysis?.task || summary?.task || 'project');
    const projectTitle = analysis?.title || summary?.projectTitle || 'AI Project Analysis';
    const projectDomain = analysis?.domain || summary?.domain || 'General';
    const projectSubdomain = analysis?.subdomain || summary?.subdomain || 'General';
    const projectModality = analysis?.data_modality || analysis?.data_type || summary?.dataType || 'Text';
    const projectTargetLabels = Array.isArray(analysis?.target_labels) ? analysis.target_labels : [];
    const projectArchitecture = analysis?.primary_architecture || 'Custom model';
    const projectTask = taskDisplay || 'N/A';

    const recommendationText = bestDataset && bestModel
        ? `Start with the ${bestDataset.title} dataset and apply ${bestModel.id} as a transfer-learning baseline for your ${taskDisplay.toLowerCase() || 'project'}. Focus on data preprocessing first to match the model input shape.`
        : 'Select a project idea to surface the best dataset and model recommendations.';

    const roadmapSteps = [
        { title: 'Define Project', description: `Clarify the goal: ${analysis?.project_title || 'your AI task'}.` },
        { title: 'Analyze Data', description: `Review the dataset details and ensure the task and modality match ${analysis?.data_type || 'your data type'}.` },
        { title: 'Prepare Data', description: `Clean, normalize, and organize the input data for ${analysis?.task || 'your task'}.` },
        { title: 'Train Baseline Model', description: `Start with ${bestModel?.id || 'a recommended model'} for initial evaluation.` },
        { title: 'Evaluate & Iterate', description: `Measure performance, tune hyperparameters, and improve the model.` },
        { title: 'Compare Results', description: 'Use dataset and model comparisons to choose the strongest path.' },
        { title: 'Deploy Prototype', description: 'Prepare a minimal deployment or demo to validate your solution.' },
    ];

    const toggleCompare = (ref: string) => {
        setSelectedCompare((current) =>
            current.includes(ref) ? current.filter((item) => item !== ref) : [...current, ref].slice(0, 4)
        );
    };

    const handleSearch = async (submitQuery: string) => {
        const trimmed = submitQuery.trim();
        if (!trimmed) return;

        // Anonymous search gate — only applies to unauthenticated users
        if (!session) {
            const count = parseInt(localStorage.getItem('anon_search_count') || '0', 10);
            if (count >= 2) {
                setShowSignInGate(true);
                return;
            }
            const newCount = count + 1;
            localStorage.setItem('anon_search_count', String(newCount));
            setAnonSearchCount(newCount);
        }

        // Client-side: require at least 20 chars to describe a meaningful ML project
        if (trimmed.length < 20) {
            setHasSearched(true);
            setError('Please describe your ML project in more detail. For example: "I want to classify customer reviews as positive or negative."');
            setAiError({ type: 'QUERY_TOO_SHORT', message: 'Your description is too short to analyze. Please provide more context about your project goal, data type, and desired output.', hint: 'Good example: "I want to detect brain tumors from MRI scans using deep learning."' });
            return;
        }

        const requestId = crypto.randomUUID();
        latestRequestRef.current = requestId;
        setSearchId(requestId);
        setSubmittedQuery(submitQuery.trim());

        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        console.log("CURRENT QUERY:", submitQuery.trim());
        console.log("SEARCH ID:", requestId);

        setIsLoading(true);
        setHasSearched(true);
        setIntent(null);
        setAnalysis(null);
        setRecommendationKeywords([]);
        setKaggleResults([]);
        setHfModels([]);
        setHfDatasets([]);
        setSummary(null);
        setFeasibility(null);
        setHardware(null);
        setConversationMessage(null);
        setError(null);
        setAiError(null);
        setAiMode(null);
        setUsingFallbackDatasets(false);
        setSelectedCompare([]);
        setCompareModalOpen(false);
        setActiveDataset(null);
        setApiAudit(null);
        setSearchCoverage(null);
        setDatasetCompatibility([]);
        setLabelMapping([]);
        setRecommendationCategories([]);
        setSmartRecommendation(null);
        setExpandedCards(new Set());

        try {
            const response = await fetch("/api/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: submitQuery.trim(), searchId: requestId }),
                cache: 'no-store',
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = 'Search failed. Please try again.';
                let structuredError: { type: string; message: string; hint?: string } | null = null;
                try {
                    const errorJson: any = JSON.parse(errorText);
                    const errObj = errorJson?.error;
                    if (errObj && typeof errObj === 'object') {
                        structuredError = { type: errObj.type ?? 'ERROR', message: errObj.message ?? errorMessage, hint: errObj.hint };
                        errorMessage = errObj.message || errorMessage;
                    } else {
                        errorMessage = errorJson?.message || errorMessage;
                    }
                    if (response.status === 401) structuredError = { type: 'AUTH_INVALID', message: 'Authentication failed. Check your API key.' };
                    if (response.status === 403) structuredError = { type: 'PERMISSION_DENIED', message: structuredError?.message ?? 'Permission denied by OpenRouter API. Check your key and model access.', hint: 'Verify your OPENROUTER_API_KEY and selected model.' };
                    if (response.status === 404) structuredError = { type: 'MODEL_NOT_FOUND', message: structuredError?.message ?? 'Model not found.', hint: 'Set OPENROUTER_MODEL to a valid OpenRouter model.' };
                    if (response.status === 429) structuredError = { type: 'RATE_LIMITED', message: 'Rate limit exceeded. Please wait and retry.', hint: 'Consider switching to a different API key.' };
                } catch {
                    errorMessage = errorText;
                }
                console.warn("Search failed with status:", response.status, '→', errorMessage);
                if (requestId === latestRequestRef.current) {
                    setError(errorMessage);
                    setAiError(structuredError);
                    setIsLoading(false);
                }
                return;
            }

            const data = await response.json();

            if (requestId !== latestRequestRef.current || controller.signal.aborted) {
                console.log("Ignoring stale response for earlier request", { requestId, latestRequestId: latestRequestRef.current });
                return;
            }

            const currentKeywords = data?.recommendationKeywords || data?.analysis?.keywords || [];
            console.log("GENERATED KEYWORDS:", currentKeywords);
            console.log("DATASET SEARCH QUERY:", data?.analysis?.dataset_queries || []);
            console.log("MODEL SEARCH QUERY:", data?.analysis?.model_queries || []);

            setIntent(data?.intent || null);
            setAnalysis(data?.analysis || null);
            setAiMode(data?.ai_mode ?? null);
            setUsingFallbackDatasets(data?.using_fallback_datasets ?? false);
            setRecommendationKeywords(currentKeywords);
            setKaggleResults(data?.results?.kaggle || []);
            setHfModels(data?.results?.hfModels || []);
            setHfDatasets(data?.results?.hfDatasets || []);
            setSummary(data?.summary || null);
            setFeasibility(data?.feasibility || null);
            setHardware(data?.hardware || null);
            setApiAudit(data?.apiAudit || null);
            setSearchCoverage(data?.searchCoverage ?? null);
            setDatasetCompatibility(data?.datasetCompatibility ?? []);
            setLabelMapping(data?.labelMapping ?? []);
            setRecommendationCategories(data?.recommendationCategories ?? []);
            setSmartRecommendation(data?.smartRecommendation ?? null);

            if (data?.intent && data.intent !== 'PROJECT_REQUEST') {
                setConversationMessage(data.message || 'I can help with that. Tell me more about your idea.');
            } else {
                setConversationMessage(null);
            }
        } catch (error) {
            if (controller.signal.aborted) {
                console.log("Request aborted because a newer Explore request started", { requestId });
                return;
            }
            console.warn("Search error:", error);
            if (requestId === latestRequestRef.current) {
                setError('Search failed. Please try again.');
                setIsLoading(false);
            }
        } finally {
            if (requestId === latestRequestRef.current && !controller.signal.aborted) {
                setIsLoading(false);
            }
        }
    };

    // ── Helper components ─────────────────────────────────────────────────────
    const ScoreBar = ({ value, max, label }: { value: number; max: number; label: string }) => {
        const pct = max > 0 ? (value / max) * 100 : 0;
        const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500';
        return (
            <div className="space-y-1">
                <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-500 font-mono">
                    <span>{label}</span><span className="text-white">{value}/{max}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
            </div>
        );
    };

    const MatchCircle = ({ score }: { score: number }) => {
        const color = score >= 70 ? 'text-emerald-400 ring-emerald-500/40' : score >= 40 ? 'text-amber-400 ring-amber-500/40' : 'text-rose-400 ring-rose-500/40';
        return (
            <div className={`flex flex-col items-center justify-center w-16 h-16 rounded-full bg-black/30 ring-2 shrink-0 ${color}`}>
                <span className="text-xl font-black">{score}</span>
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">match</span>
            </div>
        );
    };

    // ── JSX ───────────────────────────────────────────────────────────────────
    return (
        <main className="min-h-screen bg-[#050508] relative flex flex-col items-center">

            {/* Aurora background */}
            <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
                <div className="absolute -top-40 left-[10%] w-[700px] h-[700px] rounded-full opacity-[0.18]" style={{ background: 'radial-gradient(ellipse,rgba(139,92,246,0.5),transparent 65%)' }} />
                <div className="absolute top-[5%] right-[5%] w-[500px] h-[500px] rounded-full opacity-[0.12]" style={{ background: 'radial-gradient(ellipse,rgba(6,182,212,0.5),transparent 65%)' }} />
                <div className="absolute bottom-[5%] left-[35%] w-[600px] h-[400px] rounded-full opacity-[0.08]" style={{ background: 'radial-gradient(ellipse,rgba(16,185,129,0.5),transparent 65%)' }} />
                <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.015) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
            </div>

            {/* Navbar */}
            <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between bg-black/50 backdrop-blur-xl border-b border-white/[0.05]">
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shadow-[0_0_25px_rgba(139,92,246,0.5)] group-hover:shadow-[0_0_35px_rgba(139,92,246,0.7)] transition-shadow" style={{ background: 'linear-gradient(135deg,#8B5CF6,#06B6D4)' }}>✦</div>
                    <span className="hidden sm:block text-sm font-semibold tracking-tight" style={{ background: 'linear-gradient(90deg,#c4b5fd,#67e8f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AI Dataset Explorer</span>
                </Link>

                {session?.user ? (
                    <div className="relative">
                        <button
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            className="flex items-center gap-3 bg-white/[0.03] border border-white/10 hover:border-white/20 hover:bg-white/[0.06] transition rounded-full pl-3 pr-4 py-2"
                        >
                            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-violet-500 to-cyan-400 flex items-center justify-center text-white font-semibold text-sm">
                                {session.user.name?.charAt(0) || session.user.email?.charAt(0) || 'U'}
                            </div>
                            <span className="text-sm font-medium text-slate-200">{session.user.name || session.user.email}</span>
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {isProfileOpen && (
                            <div className="absolute right-0 mt-3 w-56 rounded-2xl border border-white/10 bg-[#0a0a0f]/90 backdrop-blur-xl shadow-2xl py-2 animate-in fade-in slide-in-from-top-2 origin-top-right z-50">
                                <div className="px-4 py-3 border-b border-white/5">
                                    <p className="text-sm font-medium text-white truncate">{session.user.name}</p>
                                    <p className="text-xs text-slate-400 truncate mt-0.5">{session.user.email}</p>
                                </div>
                                <div className="p-2">
                                    <Link href="/settings" className="block w-full text-left px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition">
                                        Settings
                                    </Link>
                                    <button onClick={() => signOut({ callbackUrl: '/login' })} className="w-full text-left px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 rounded-xl transition mt-1">
                                        Sign out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex gap-4 items-center">
                        <Link href="/login" className="text-sm font-medium text-slate-300 hover:text-white transition">Sign in</Link>
                    </div>
                )}
            </header>

            {/* Hero — pre-search */}
            {!hasSearched && (
                <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-xs font-bold mb-8 uppercase tracking-widest" style={{ color: '#c4b5fd', WebkitTextFillColor: '#c4b5fd' }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" style={{ WebkitTextFillColor: 'initial' }} />
                        <span style={{ color: '#c4b5fd', WebkitTextFillColor: '#c4b5fd' }}>OpenRouter &middot; Kaggle &middot; Hugging Face</span>
                    </div>
                    <h1 className="text-6xl md:text-8xl font-black leading-[0.95] tracking-tight mb-6" style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>
                        <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>Find the</span><br />
                        <span style={{ background: 'linear-gradient(135deg,#8B5CF6 0%,#06B6D4 50%,#10B981 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            perfect dataset.
                        </span>
                    </h1>
                    <p className="text-xl max-w-2xl mb-12 leading-relaxed" style={{ color: '#94a3b8', WebkitTextFillColor: '#94a3b8' }}>
                        Describe your ML project in plain language. Get AI-powered dataset discovery, model recommendations, and feasibility analysis.
                    </p>
                    {/* Search form — hero */}
                    <div className="relative group max-w-3xl w-full mx-auto mb-10">
                        <div className="absolute -inset-px rounded-3xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.6),rgba(6,182,212,0.6))' }} />
                        <form className="relative flex items-end bg-[#0d0d15]/95 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-2 shadow-[0_0_60px_rgba(0,0,0,0.6)]" onSubmit={e => { e.preventDefault(); handleSearch(searchInput); }}>
                            <div className="pl-5 pr-3 text-slate-400 pointer-events-none shrink-0">
                                {isLoading ? (<svg className="w-5 h-5 animate-spin text-violet-400" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                ) : (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>)}
                            </div>
                            <textarea
                                ref={heroTextareaRef}
                                rows={1}
                                className="w-full bg-transparent text-lg text-slate-200 placeholder-slate-600 outline-none py-4 px-2 resize-none overflow-hidden leading-relaxed"
                                placeholder="I want to detect brain tumors from MRI images..."
                                value={searchInput}
                                disabled={isLoading}
                                onChange={e => {
                                    setSearchInput(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                onFocus={e => {
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (searchInput.trim()) handleSearch(searchInput);
                                    }
                                }}
                                style={{ minHeight: '56px', maxHeight: '240px' }}
                            />
                            <button type="submit" disabled={isLoading} className="shrink-0 text-white font-bold rounded-2xl px-7 py-4 transition hover:brightness-110 active:scale-95 shadow-[0_0_30px_rgba(124,58,237,0.4)]" style={{ background: 'linear-gradient(135deg,#7C3AED,#0891B2)', opacity: isLoading ? 0.5 : 1 }}>
                                Explore
                            </button>
                        </form>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3 max-w-2xl mx-auto">
                        {/* Anonymous usage hint */}
                        {!session && anonSearchCount > 0 && anonSearchCount < 2 && (
                            <p className="text-xs text-slate-600 mb-6">
                                {2 - anonSearchCount} free {2 - anonSearchCount === 1 ? 'search' : 'searches'} remaining — <a href="/signup" className="text-violet-400 hover:text-violet-300 transition">create a free account</a> for unlimited access.
                            </p>
                        )}
                        <span className="text-sm text-slate-600 mr-1">Try:</span>
                        {["Medical Image Classification", "Real-time Object Tracking", "Natural Language Chatbot"].map((s, i) => (
                            <button key={i} onClick={() => { setSearchInput(s); handleSearch(s); }} className="text-sm px-4 py-2 rounded-full border border-white/[0.07] bg-white/[0.02] text-slate-300 hover:text-white hover:bg-white/[0.06] hover:border-violet-500/30 hover:shadow-[0_0_15px_rgba(139,92,246,0.15)] transition">{s}</button>
                        ))}
                    </div>
                </div>
            )}

            {/* Compact search — post-search */}
            {hasSearched && (
                <div className="fixed top-[65px] left-0 right-0 z-40 flex justify-center px-4 py-2 bg-black/60 backdrop-blur-xl border-b border-white/[0.05]">
                    <div className="relative group max-w-2xl w-full">
                        <form className="relative flex items-end bg-[#0d0d15]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-1.5 shadow-lg" onSubmit={e => { e.preventDefault(); handleSearch(searchInput); }}>
                            <div className="pl-4 pr-2 text-slate-500 pointer-events-none shrink-0">
                                {isLoading ? (<svg className="w-4 h-4 animate-spin text-violet-400" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                ) : (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>)}
                            </div>
                            <textarea
                                ref={compactTextareaRef}
                                rows={1}
                                className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none py-2.5 px-2 resize-none leading-relaxed transition-all duration-200"
                                placeholder="New search..."
                                value={searchInput}
                                disabled={isLoading}
                                onChange={e => {
                                    setSearchInput(e.target.value);
                                    if (compactFocused) {
                                        e.target.style.height = 'auto';
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                    }
                                }}
                                onFocus={e => {
                                    setCompactFocused(true);
                                    // expand to show full text
                                    e.target.style.height = 'auto';
                                    e.target.style.height = Math.min(e.target.scrollHeight, 240) + 'px';
                                    e.target.style.overflow = 'hidden';
                                }}
                                onBlur={e => {
                                    setCompactFocused(false);
                                    // collapse to single line
                                    e.target.style.height = '38px';
                                    e.target.style.overflow = 'hidden';
                                }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (searchInput.trim()) {
                                            e.currentTarget.blur();
                                            handleSearch(searchInput);
                                        }
                                    }
                                }}
                                style={{ minHeight: '38px', maxHeight: '240px', height: '38px', overflow: 'hidden' }}
                            />
                            <button type="submit" disabled={isLoading} className="shrink-0 text-white text-sm font-bold rounded-xl px-5 py-2.5 transition hover:brightness-110 active:scale-95" style={{ background: 'linear-gradient(135deg,#7C3AED,#0891B2)', opacity: isLoading ? 0.5 : 1 }}>
                                Search
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Results area */}
            {hasSearched && (
                <div className="w-full max-w-7xl mx-auto px-4 pt-28 pb-28 space-y-6">

                    {/* Banners */}
                    <div className="flex flex-wrap gap-3 items-center">
                        {aiMode && (
                            <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold border ${aiMode === 'MOCK' ? 'bg-amber-500/10 border-amber-500/25 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.1)]'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${aiMode === 'MOCK' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                {aiMode === 'LIVE' ? '⚡ LIVE AI MODE' : '🟡 MOCK MODE'}
                            </span>
                        )}
                        {usingFallbackDatasets && (
                            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold border bg-amber-500/10 border-amber-500/25 text-amber-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                Kaggle credentials not configured — showing illustrative datasets
                            </span>
                        )}
                    </div>

                    {/* Export button */}
                    {!isLoading && analysis && (
                        <div className="flex justify-end">
                            <button
                                onClick={() => {
                                    const content = [
                                        '# AI Dataset Explorer — Project Analysis Report',
                                        '',
                                        '## Project',
                                        'Title: ' + (analysis?.title || 'N/A'),
                                        'Domain: ' + (analysis?.domain || 'N/A'),
                                        'Subdomain: ' + (analysis?.subdomain || 'N/A'),
                                        'Task: ' + (analysis?.task || 'N/A'),
                                        'Modality: ' + (analysis?.data_modality || 'N/A'),
                                        '',
                                        '## Confidence',
                                        'Project Understanding: ' + (analysis?.confidence?.score || 0) + '%',
                                        'Reason: ' + (analysis?.confidence?.reason || 'N/A'),
                                        '',
                                        '## Best Dataset',
                                        'Name: ' + (summary?.bestDataset ? (summary.bestDataset.name || summary.bestDataset.title || 'N/A') : 'N/A'),
                                        'Match Score: ' + (summary?.bestDataset?.matchScore || 0) + '%',
                                        'Source: ' + (summary?.bestDataset?.source || 'N/A'),
                                        'URL: ' + (summary?.bestDataset?.url || 'Not available'),
                                        '',
                                        '## Recommended Model',
                                        'Model: ' + (summary?.bestModel?.name || summary?.bestModel?.id || 'N/A'),
                                        '',
                                        '## Hardware (Estimated)',
                                        'GPU: ' + (hardware?.gpu?.recommendedClass || 'N/A'),
                                        'RAM: ' + (hardware?.ram?.recommended || 'N/A'),
                                        'Storage: ' + (hardware?.storage?.dataset || 'N/A'),
                                        'Cloud: ' + (hardware?.cloudAlternative || 'N/A'),
                                        '',
                                        '## Next Steps',
                                        ...(smartRecommendation?.nextSteps || []).map((s: string, i: number) => `${i + 1}. ${s}`),
                                        '',
                                        '---',
                                        'Generated by AI Dataset Explorer',
                                        'Date: ' + new Date().toISOString(),
                                    ].join('\n');
                                    const blob = new Blob([content], { type: 'text/plain' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = 'ai-dataset-explorer-report.txt';
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.07] transition"
                            >
                                <span>📄</span> Export Report
                            </button>
                        </div>
                    )}

                    {/* ── Search Coverage ─────────────────────────────────────────────── */}
                    {searchCoverage && !isLoading && (
                        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Dataset Search Coverage</span>
                                <div className="flex items-center gap-3"><span className="text-xs text-slate-400 font-semibold">{searchCoverage.total} unique datasets retrieved</span>{searchCoverage.note && <span className="text-[10px] text-slate-600 italic">({searchCoverage.note})</span>}</div>
                            </div>
                            <div className="space-y-2">
                                {searchCoverage.bySource.map((src: any, index: number) => (
                                    <div key={`${src.source}-${index}`} className="flex items-center gap-3">
                                        <span className="text-xs text-slate-400 w-48 shrink-0">{src.label || src.source}{src.type && <span className="ml-1.5 text-[9px] text-slate-600 uppercase">({src.type})</span>}</span>
                                        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                            <div className="h-full rounded-full bg-violet-500" style={{ width: searchCoverage.total > 0 ? `${(src.count / Math.max(searchCoverage.total, 1)) * 100}%` : '0%' }} />
                                        </div>
                                        <span className="text-xs font-bold text-white w-16 text-right">{src.searched ? src.count + ' found' : 'Not searched'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* API Status Strip */}
                    {apiAudit && !isLoading && (
                        <div className="space-y-3">
                            <button onClick={() => setApiPanelExpanded(v => !v)} className="flex flex-wrap items-center gap-4 px-5 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.05] transition w-full text-left">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">API Status</span>
                                {(['openrouter', 'kaggle', 'huggingfaceModels', 'huggingfaceDatasets'] as const).map(k => {
                                    const e = (apiAudit as any)[k]; if (!e) return null;
                                    const ok = e.status === 'CALLED_SUCCESSFULLY', mocked = e.status === 'MOCKED';
                                    const labels: { [key: string]: string } = { openrouter: 'OpenRouter', kaggle: 'Kaggle', huggingfaceModels: 'HF Models', huggingfaceDatasets: 'HF Datasets' };
                                    return (<span key={k} className="flex items-center gap-1.5 text-xs">
                                        <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : mocked ? 'bg-amber-400' : e.status === 'NOT_CONFIGURED' || e.status === 'NOT_CALLED' ? 'bg-slate-600' : 'bg-rose-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]'}`} />
                                        <span className="text-slate-400">{labels[k]}</span>
                                        {ok && <span className="text-emerald-700 text-[10px]">{e.responseTimeMs}ms</span>}
                                    </span>);
                                })}
                                <svg className={`w-4 h-4 text-slate-600 ml-auto transition-transform ${apiPanelExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {apiPanelExpanded && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {(['openrouter', 'kaggle', 'huggingfaceModels', 'huggingfaceDatasets'] as const).map(k => {
                                        const e = (apiAudit as any)[k]; if (!e) return null;
                                        const ok = e.status === 'CALLED_SUCCESSFULLY', mocked = e.status === 'MOCKED', nc = e.status === 'NOT_CONFIGURED' || e.status === 'NOT_CALLED';
                                        const labels: { [key: string]: string } = { openrouter: 'OpenRouter', kaggle: 'Kaggle', huggingfaceModels: 'HF Models', huggingfaceDatasets: 'HF Datasets' };
                                        const icons: { [key: string]: string } = { openrouter: '✨', kaggle: '📦', huggingfaceModels: '🤗', huggingfaceDatasets: '🤗' };
                                        return (<div key={k} className={`rounded-xl p-3 border text-xs ${ok ? 'border-emerald-500/20 bg-emerald-950/20' : mocked ? 'border-amber-500/20 bg-amber-950/20' : nc ? 'border-white/5 bg-white/[0.02]' : 'border-rose-500/20 bg-rose-950/20'}`}>
                                            <div className="flex items-center gap-2 mb-2 font-bold text-white"><span>{icons[k]}</span>{labels[k]}</div>
                                            <div className={`font-mono text-[10px] mb-1 ${ok ? 'text-emerald-400' : mocked ? 'text-amber-400' : nc ? 'text-slate-500' : 'text-rose-400'}`}>{e.status}</div>
                                            {e.httpStatus && <div className="text-slate-500 text-[10px]">HTTP {e.httpStatus}</div>}
                                            {e.responseTimeMs != null && <div className="text-slate-500 text-[10px]">{e.responseTimeMs}ms</div>}
                                            {e.resultsReturned != null && <div className="text-slate-400 text-[10px] font-bold">{e.resultsReturned} results</div>}
                                            {e.error && <div className="text-rose-400 text-[10px] mt-1 break-words">{String(e.error).slice(0, 60)}</div>}
                                        </div>);
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Loading */}
                    {isLoading && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="flex items-center gap-3">
                                <div className="h-3 w-3 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="h-3 w-3 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="h-3 w-3 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                                <span className="text-slate-500 text-sm ml-2">Analyzing your project with AI...</span>
                            </div>
                            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 space-y-4 animate-pulse">
                                <div className="h-7 w-56 rounded-full bg-white/10" />
                                <div className="grid grid-cols-2 gap-4">{[1, 2, 3, 4].map(i => <div key={i} className="h-5 rounded-full bg-white/[0.06]" />)}</div>
                                <div className="grid grid-cols-2 gap-4">{[1, 2].map(i => <div key={i} className="h-10 rounded-xl bg-white/[0.04]" />)}</div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {[1, 2].map(i => (<div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 space-y-4 animate-pulse">
                                    <div className="h-5 w-36 rounded-full bg-white/10" />
                                    {[1, 2, 3].map(j => <div key={j} className="h-20 rounded-xl bg-white/[0.04]" />)}
                                </div>))}
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {!isLoading && error && (
                        <div className="rounded-2xl border border-rose-500/25 p-8 animate-in fade-in zoom-in-95" style={{ background: 'rgba(220,38,38,0.07)' }}>
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 flex items-center justify-center text-2xl shrink-0">⚠</div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-lg font-bold text-rose-400">Search Failed</h3>
                                        {aiError?.type && <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/20">{aiError.type}</span>}
                                    </div>
                                    <p className="text-slate-300 text-sm mb-3">{aiError?.message || error}</p>
                                    {aiError?.hint && <p className="text-xs text-slate-400 bg-white/5 border border-white/10 rounded-xl px-4 py-2">💡 {aiError.hint}</p>}
                                </div>
                            </div>
                            <div className="mt-5 flex gap-3">
                                <button onClick={() => handleSearch(submittedQuery)} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-rose-300 border border-rose-500/30 hover:border-rose-500/50 transition" style={{ background: 'rgba(220,38,38,0.1)' }}>Try Again</button>
                            </div>
                        </div>
                    )}

                    {/* Main results */}
                    {!isLoading && !error && (analysis || intent) && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                            {/* Conversation intent */}
                            {intent && intent !== 'PROJECT_REQUEST' ? (
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
                                    <div className="text-4xl mb-4">🤖</div>
                                    <h3 className="text-2xl font-bold text-white mb-3">{conversationMessage || 'I can help with that.'}</h3>
                                    <p className="text-slate-400">Share your AI/ML idea or problem statement to get dataset and model recommendations.</p>
                                </div>
                            ) : (<>

                                {/* ── AI Project Analysis ─────────────────────── */}
                                <div className="rounded-2xl border border-white/[0.07] border-l-4 border-l-violet-500 p-7" style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.06) 0%,rgba(5,5,8,0.4) 100%)' }}>
                                    <div className="flex items-center justify-between gap-4 mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.5)]" style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}><span className="text-white">✦</span></div>
                                            <div>
                                                <h2 className="text-xl font-bold text-white">AI Project Analysis</h2>
                                                <p className="text-xs text-violet-400">via OpenRouter</p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className={`text-4xl font-black ${(analysis?.confidence?.score ?? 0) >= 70 ? 'text-emerald-400' : (analysis?.confidence?.score ?? 0) >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>{analysis?.confidence?.score ?? 0}%</div>
                                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Confidence</div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mb-6">
                                        {[
                                            { label: 'Title', value: projectTitle },
                                            { label: 'Domain', value: `${projectDomain} / ${projectSubdomain}` },
                                            { label: 'Task', value: projectTask },
                                            { label: 'Data Modality', value: projectModality },
                                            { label: 'Target Type', value: analysis?.target_type || '—' },
                                            { label: 'Target Labels', value: projectTargetLabels.join(', ') || '—' },
                                            { label: '# Classes', value: (analysis as any)?.num_classes != null ? String((analysis as any).num_classes) : 'Not specified' },
                                            { label: 'Language', value: (analysis as any)?.preferred_language || 'Not specified' },
                                            { label: 'Deployment', value: (analysis as any)?.deployment_requirement || 'Not specified' },
                                            { label: 'Privacy Sensitivity', value: (analysis as any)?.privacy_sensitivity || 'Not specified' },
                                        ].map(({ label, value }) => (
                                            <div key={label}>
                                                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-0.5">{label}</div>
                                                <div className="text-sm font-semibold text-white">{value}</div>
                                            </div>
                                        ))}
                                        {analysis?.expected_output && (<div className="sm:col-span-2"><div className="text-[10px] uppercase tracking-widest text-slate-500 mb-0.5">Expected Output</div><div className="text-sm font-semibold text-white">{analysis.expected_output}</div></div>)}
                                    </div>
                                    <div className="rounded-xl p-4 border border-violet-500/20 mb-4" style={{ background: 'rgba(139,92,246,0.07)' }}>
                                        <div className="text-[10px] uppercase tracking-widest text-violet-400 mb-2">Primary Architecture</div>
                                        <code className="text-violet-200 font-mono font-bold">{projectArchitecture}</code>
                                        {analysis?.architecture_reasoning && <p className="text-slate-400 text-xs mt-2">{analysis.architecture_reasoning}</p>}
                                        {analysis?.alternative_architectures?.length > 0 && (<div className="flex flex-wrap gap-2 mt-3">{analysis.alternative_architectures.map((a: string, i: number) => (<span key={i} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-400 font-mono text-xs">{a}</span>))}</div>)}
                                    </div>
                                    {analysis?.confidence?.reason && (<div className="rounded-xl p-4 border border-emerald-500/20 mb-4" style={{ background: 'rgba(16,185,129,0.05)' }}><div className="text-[10px] uppercase tracking-widest text-emerald-500 mb-2">Confidence Explanation</div><p className="text-sm text-slate-300">{analysis.confidence.reason}</p></div>)}
                                    {/* Dataset recommendation confidence (separate from project understanding) */}
                                    {analysis?.confidence && (
                                        <div className="mt-2 grid grid-cols-2 gap-3 mb-4">
                                            <div className="rounded-lg p-3 bg-white/[0.03] border border-white/[0.06]">
                                                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Project Understanding</div>
                                                <div className={`text-xl font-black ${(analysis.confidence.score || 0) >= 70 ? 'text-emerald-400' : (analysis.confidence.score || 0) >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>{analysis.confidence.score || 0}%</div>
                                                <div className="text-[10px] text-slate-600">Calculated</div>
                                            </div>
                                            <div className="rounded-lg p-3 bg-white/[0.03] border border-white/[0.06]">
                                                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Dataset Rec. Confidence</div>
                                                <div className={`text-xl font-black ${summary?.datasetsFound > 3 ? 'text-emerald-400' : summary?.datasetsFound > 0 ? 'text-amber-400' : 'text-rose-400'}`}>{summary?.datasetsFound > 3 ? 'High' : summary?.datasetsFound > 0 ? 'Medium' : 'Low'}</div>
                                                <div className="text-[10px] text-slate-600">Based on {summary?.datasetsFound || 0} datasets found</div>
                                            </div>
                                        </div>
                                    )}
                                    {/* Missing information warning */}
                                    {analysis?.unknown_facts?.length > 0 && (
                                        <div className="mt-3 rounded-xl p-4 border border-amber-500/20 mb-4" style={{ background: 'rgba(245,158,11,0.05)' }}>
                                            <div className="text-[10px] uppercase tracking-widest text-amber-500 mb-2 font-bold">⚠ Missing Information</div>
                                            <p className="text-xs text-slate-400 mb-2">Your problem statement is missing details that could improve recommendations:</p>
                                            <ul className="space-y-1">
                                                {analysis.unknown_facts.slice(0, 5).map((fact: string, i: number) => (
                                                    <li key={i} className="text-xs text-amber-200/70 flex gap-2"><span className="text-amber-500">·</span>{fact}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {analysis?.ambiguity_notes?.length > 0 && (<div className="rounded-xl p-4 border border-amber-500/20 mb-4" style={{ background: 'rgba(245,158,11,0.05)' }}><div className="text-[10px] uppercase tracking-widest text-amber-500 mb-2">⚠ Ambiguities</div><ul className="space-y-1">{analysis.ambiguity_notes.map((n: string, i: number) => (<li key={i} className="text-xs text-amber-200/80 flex gap-2"><span className="text-amber-500">·</span>{n}</li>))}</ul></div>)}
                                    {((analysis?.keywords?.length ?? 0) > 0 || recommendationKeywords.length > 0) && (<div className="flex flex-wrap gap-2 mt-2">{(analysis?.keywords || recommendationKeywords).map((kw: string, i: number) => (<span key={i} className="px-3 py-1 rounded-full text-xs border border-violet-500/20 text-violet-300" style={{ background: 'rgba(139,92,246,0.08)' }}>{kw}</span>))}</div>)}
                                </div>
                                {/* ── Summary + Best Dataset ──────────────────── */}
                                <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
                                    <div className="rounded-2xl border border-white/[0.07] border-l-4 border-l-cyan-500 p-6" style={{ background: 'linear-gradient(135deg,rgba(6,182,212,0.05),rgba(5,5,8,0.5))' }}>
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-5">Project Summary</div>
                                        <div className="space-y-4">
                                            {[{ label: 'Project', value: summary?.projectTitle || projectTitle }, { label: 'Domain', value: summary?.domain || projectDomain }, { label: 'Subdomain', value: summary?.subdomain || projectSubdomain }, { label: 'Task', value: summary?.task || projectTask }, { label: 'Modality', value: summary?.dataType || projectModality }].map(({ label, value }) => (
                                                <div key={label}><div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</div><div className="text-sm font-semibold text-white leading-tight">{value || '—'}</div></div>
                                            ))}
                                            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/[0.06]">
                                                <div className="text-center"><div className="text-3xl font-black text-cyan-400">{summary?.datasetsFound ?? kaggleResults.length}</div><div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">Datasets</div></div>
                                                <div className="text-center"><div className="text-3xl font-black text-violet-400">{summary?.modelsFound ?? hfModels.length}</div><div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">Models</div></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-white/[0.07] border-l-4 border-l-emerald-500 p-6" style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.05),rgba(5,5,8,0.5))' }}>
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2">🏆 Best Dataset Match</div>
                                        {bestDataset ? (
                                            <>
                                                <div className="flex items-start justify-between gap-4 mb-4">
                                                    <div className="min-w-0"><h3 className="text-2xl font-black text-white leading-tight">{dsName(bestDataset)}</h3>{dsSubtitle(bestDataset) && <p className="text-slate-400 text-sm mt-1 line-clamp-2">{dsSubtitle(bestDataset)}</p>}</div>
                                                    <MatchCircle score={dsScore(bestDataset)} />
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                                                    {[{ label: 'Source', value: bestDataset.source || 'Kaggle' }, { label: 'License', value: bestDataset.license || '—' }, { label: 'Creator', value: dsCreator(bestDataset) }, { label: 'Size', value: formatBytes(dsSize(bestDataset)) }].map(({ label, value }) => (
                                                        <div key={label} className="rounded-xl p-3 bg-white/[0.03] border border-white/[0.06]"><div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div><div className="text-xs font-bold text-white truncate">{value}</div></div>
                                                    ))}
                                                </div>
                                                {dsBreakdown(bestDataset) && (<div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5"><ScoreBar value={dsBreakdown(bestDataset)!.task} max={30} label="Task" /><ScoreBar value={dsBreakdown(bestDataset)!.modality} max={20} label="Modality" /><ScoreBar value={dsBreakdown(bestDataset)!.domain} max={20} label="Domain" /><ScoreBar value={dsBreakdown(bestDataset)!.subdomain} max={15} label="Subdomain" /><ScoreBar value={dsBreakdown(bestDataset)!.target} max={10} label="Target" /><ScoreBar value={dsBreakdown(bestDataset)!.metadata} max={5} label="Metadata" /></div>)}
                                                {(bestDataset as any)?.targetCompatibility?.requestedCount > 0 && (
                                                    <div className="mb-4 rounded-xl p-4 border border-white/[0.07] bg-white/[0.02]">
                                                        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-3 font-bold">Label Compatibility</div>
                                                        <div className="grid grid-cols-4 gap-2 text-center text-xs mb-3">
                                                            {[{ v: (bestDataset as any).targetCompatibility.exactMatches, l: 'Exact', c: 'text-emerald-400' }, { v: (bestDataset as any).targetCompatibility.relatedMatches, l: 'Related', c: 'text-cyan-400' }, { v: (bestDataset as any).targetCompatibility.missingLabels.length, l: 'Missing', c: 'text-rose-400' }, { v: (bestDataset as any).targetCompatibility.compatibilityScore + '%', l: 'Score', c: 'text-white' }].map(({ v, l, c }) => (<div key={l}><div className={`text-xl font-black ${c}`}>{v}</div><div className="text-slate-500 text-[10px]">{l}</div></div>))}
                                                        </div>
                                                        {(bestDataset as any).targetCompatibility.missingLabels.length > 0 && (<div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">⚠ Labels not confirmed in metadata: {(bestDataset as any).targetCompatibility.missingLabels.join(', ')} — verify on the dataset page</div>)}
                                                        {(bestDataset as any).targetCompatibility.missingLabels.length === 0 && (bestDataset as any).targetCompatibility.exactMatches > 0 && (<div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">All requested labels confirmed in dataset metadata</div>)}
                                                    </div>
                                                )}
                                                {/* Label Compatibility */}
                                                {bestDataset?.targetCompatibility && bestDataset.targetCompatibility.requestedCount > 0 && (
                                                    <div className="mb-4 rounded-xl p-4 border border-white/[0.07] bg-white/[0.02]">
                                                        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-3 font-bold">Label Compatibility</div>
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                                                            <div className="text-center"><div className="text-2xl font-black text-emerald-400">{bestDataset.targetCompatibility.exactMatches}/{bestDataset.targetCompatibility.requestedCount}</div><div className="text-slate-500 text-[10px]">Exact</div></div>
                                                            <div className="text-center"><div className="text-2xl font-black text-cyan-400">{bestDataset.targetCompatibility.relatedMatches}</div><div className="text-slate-500 text-[10px]">Related</div></div>
                                                            <div className="text-center"><div className="text-2xl font-black text-rose-400">{bestDataset.targetCompatibility.missingLabels.length}</div><div className="text-slate-500 text-[10px]">Missing</div></div>
                                                            <div className="text-center"><div className="text-2xl font-black text-white">{bestDataset.targetCompatibility.compatibilityScore}%</div><div className="text-slate-500 text-[10px]">Compat.</div></div>
                                                        </div>
                                                        {bestDataset.targetCompatibility.missingLabels.length > 0 && (
                                                            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                                                                ⚠ Labels not found in metadata: {bestDataset.targetCompatibility.missingLabels.join(', ')} — verify manually on the dataset page
                                                            </div>
                                                        )}
                                                        {bestDataset.targetCompatibility.exactMatches > 0 && bestDataset.targetCompatibility.missingLabels.length === 0 && (
                                                            <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                                                                All requested labels confirmed in dataset metadata
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="flex gap-3">
                                                    <a href={bestDataset.url} target="_blank" rel="noreferrer" className="flex-1 text-center py-2.5 rounded-xl text-sm font-bold text-white hover:brightness-110 transition" style={{ background: 'linear-gradient(135deg,#059669,#0891B2)' }}>Open Dataset ↗</a>
                                                    <button onClick={() => setActiveDataset(bestDataset)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-300 bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition">View Details</button>
                                                </div>
                                            </>
                                        ) : (<div className="text-slate-500 text-sm">No dataset could be selected automatically.</div>)}
                                    </div>
                                </div>
                                {/* ── Recommendation Categories ────────────────────────────────────── */}
                                {recommendationCategories.length > 0 && (
                                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">Dataset Recommendation Categories</div>
                                        <div className="flex flex-wrap gap-3">
                                            {recommendationCategories.map((cat: any, i: number) => (
                                                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-xs">
                                                    <span>{cat.emoji}</span>
                                                    <span className="font-semibold text-white">{cat.category}</span>
                                                    <span className="text-slate-500">·</span>
                                                    <span className="text-slate-400 truncate max-w-[140px]">{cat.datasetId}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ── Datasets + Models Grid ───────────────────── */}                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    {/* Kaggle Datasets */}
                                    <div>
                                        <div className="flex items-center gap-3 mb-5">
                                            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center"><span className="text-cyan-400 font-black text-sm">K</span></div>
                                            <h3 className="text-lg font-bold text-white">Kaggle Datasets</h3>
                                            <span className="ml-auto text-xs text-slate-600">{kaggleResults.length} found</span>
                                        </div>
                                        <div className="space-y-4">
                                            {kaggleResults.length > 0 ? kaggleResults.slice(0, 3).map((ds: any, idx: number) => (
                                                <div key={idx} className={`rounded-2xl p-5 border transition-all duration-200 ${ds.rejected ? 'border-rose-500/20 bg-rose-950/10 opacity-70' : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05] hover:border-violet-500/20 hover:shadow-[0_0_20px_rgba(139,92,246,0.08)]'}`}>
                                                    <div className="flex items-start gap-3">
                                                        <MatchCircle score={dsScore(ds)} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <h4 className={`font-bold truncate text-sm ${ds.rejected ? 'line-through text-slate-500' : 'text-white'}`}>{dsName(ds)}</h4>
                                                                {ds.rejected && <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/20 text-rose-400 border border-rose-500/20 uppercase tracking-wider">Hard Negative</span>}
                                                            </div>
                                                            <p className="text-slate-500 text-xs line-clamp-2">{dsSubtitle(ds) || 'No description'}</p>
                                                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400">{ds.source || 'Kaggle'}</span>
                                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400">{ds.license || 'License unknown'}</span>
                                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400">{formatBytes(dsSize(ds))}</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => toggleCompare(dsRef(ds))}
                                                            className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition ${selectedCompare.includes(dsRef(ds))
                                                                ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                                                                : 'bg-white/[0.04] border-white/[0.08] text-slate-500 hover:text-violet-300 hover:border-violet-500/30'
                                                                }`}
                                                        >
                                                            {selectedCompare.includes(dsRef(ds)) ? '✓ Added' : '+ Compare'}
                                                        </button>
                                                    </div>
                                                    {!ds.rejected && dsBreakdown(ds) && (
                                                        <div className="mt-4 space-y-2">
                                                            <ScoreBar value={dsBreakdown(ds)!.task} max={30} label="Task" />
                                                            <ScoreBar value={dsBreakdown(ds)!.modality} max={20} label="Modality" />
                                                            <ScoreBar value={dsBreakdown(ds)!.domain} max={20} label="Domain" />
                                                            <ScoreBar value={dsBreakdown(ds)!.subdomain} max={15} label="Subdomain" />
                                                        </div>
                                                    )}
                                                    {!ds.rejected && (
                                                        <>
                                                            {ds.downloads != null && ds.downloads > 0 && (
                                                                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
                                                                    <span>⬇</span><span className="font-semibold text-slate-400">{Number(ds.downloads).toLocaleString()}</span><span>downloads</span>
                                                                    {ds.tags && ds.tags.length > 0 && <>
                                                                        <span className="mx-1 text-slate-700">·</span>
                                                                        {ds.tags.slice(0, 3).map((t: string, i: number) => (
                                                                            <span key={i} className="px-1.5 py-0.5 rounded bg-white/5 text-slate-500 text-[9px]">{t}</span>
                                                                        ))}
                                                                    </>}
                                                                </div>
                                                            )}
                                                            {ds.matchReason && (
                                                                <p className="mt-2 text-[10px] text-slate-600 leading-relaxed line-clamp-2">{ds.matchReason}</p>
                                                            )}
                                                            <div className="flex gap-2 mt-3">
                                                                <a href={ds.url} target="_blank" rel="noreferrer" className="px-4 py-1.5 rounded-lg text-xs font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/15 transition">Open ↗</a>
                                                                <button onClick={() => setActiveDataset(ds)} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-white/5 border border-white/10 hover:bg-white/[0.08] transition">Details</button>
                                                            </div>

                                                            {/* Expandable enrichment section */}
                                                            {(ds as any)._enriched && expandedCards.has(dsRef(ds)) && (
                                                                <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-4 animate-in fade-in duration-200">

                                                                    {/* Risk */}
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Dataset Risk</span>
                                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${(ds as any)._enriched.risk.level === 'Low' ? 'bg-emerald-500/15 text-emerald-400' : (ds as any)._enriched.risk.level === 'Medium' ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                                                                {(ds as any)._enriched.risk.level === 'Low' ? '🟢' : (ds as any)._enriched.risk.level === 'Medium' ? '🟡' : '🔴'} {(ds as any)._enriched.risk.level} Risk
                                                                            </span>
                                                                        </div>
                                                                        {(ds as any)._enriched.risk.warnings.length > 0 ? (
                                                                            <div className="space-y-1.5">
                                                                                {(ds as any)._enriched.risk.warnings.map((w: any, wi: number) => (
                                                                                    <div key={wi} className="flex gap-2 text-xs">
                                                                                        <span className="text-amber-400 shrink-0">⚠</span>
                                                                                        <div>
                                                                                            <span className="text-slate-300 font-semibold">{w.message}</span>
                                                                                            {w.details && <span className="text-slate-500 ml-1">— {w.details}</span>}
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        ) : (
                                                                            <p className="text-xs text-emerald-400">No significant risks detected.</p>
                                                                        )}
                                                                    </div>

                                                                    {/* Quality Analysis */}
                                                                    <div>
                                                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Dataset Quality</div>
                                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                                            {[
                                                                                ['Data Diversity', (ds as any)._enriched.quality.dataDiversity],
                                                                                ['Metadata Quality', (ds as any)._enriched.quality.metadataQuality],
                                                                                ['Documentation', (ds as any)._enriched.quality.documentationQuality],
                                                                                ['License Access', (ds as any)._enriched.quality.licenseAccessibility],
                                                                            ].map(([label, val]: any) => (
                                                                                <div key={label} className="flex items-center justify-between">
                                                                                    <span className="text-slate-500">{label}</span>
                                                                                    <span className={`font-semibold ${val === 'Excellent' ? 'text-emerald-400' : val === 'Good' ? 'text-cyan-400' : val === 'Fair' ? 'text-amber-400' : val === 'Poor' ? 'text-rose-400' : 'text-slate-500'}`}>{val}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                        <div className="mt-2 flex items-center justify-between text-xs">
                                                                            <span className="text-slate-500">Overall Quality Score</span>
                                                                            <span className="font-bold text-white">{(ds as any)._enriched.quality.overallQuality}/100 <span className="text-slate-600 font-normal">(Calculated)</span></span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Accessibility */}
                                                                    <div>
                                                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Accessibility</div>
                                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                                            {[
                                                                                ['Download', (ds as any)._enriched.accessibility.downloadAvailable],
                                                                                ['Commercial Use', (ds as any)._enriched.accessibility.commercialUse],
                                                                                ['Registration', (ds as any)._enriched.accessibility.registrationRequired],
                                                                                ['Access Type', (ds as any)._enriched.accessibility.directAccess],
                                                                            ].map(([label, val]: any) => (
                                                                                <div key={label} className="flex items-center justify-between">
                                                                                    <span className="text-slate-500">{label}</span>
                                                                                    <span className={`font-semibold ${val === 'Available' || val === 'Allowed' || val === 'Open' || val === 'No' ? 'text-emerald-400' : val === 'Yes' || val === 'Restricted' ? 'text-amber-400' : 'text-slate-400'}`}>{val}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>

                                                                    {/* Can I Train This? */}
                                                                    <div>
                                                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Can I Train This? <span className="text-slate-600 font-normal">(Estimated)</span></div>
                                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                                            {[
                                                                                ['CPU Training', (ds as any)._enriched.trainability.cpuTraining],
                                                                                ['Google Colab Free', (ds as any)._enriched.trainability.colabFree],
                                                                                ['Google Colab Pro', (ds as any)._enriched.trainability.colabPro],
                                                                                ['Local Training', (ds as any)._enriched.trainability.localTraining],
                                                                            ].map(([label, val]: any) => (
                                                                                <div key={label} className="flex items-center justify-between">
                                                                                    <span className="text-slate-500">{label}</span>
                                                                                    <span className={`font-semibold ${val === 'Yes' || val === 'Possible' ? 'text-emerald-400' : val === 'Maybe' || val === 'Recommended' ? 'text-amber-400' : 'text-rose-400'}`}>{val === 'Recommended' ? '⭐ Recommended' : val}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-400">
                                                                            <div>Min RAM: <span className="text-white font-semibold">{(ds as any)._enriched.trainability.minimumRam}</span></div>
                                                                            <div>Rec. RAM: <span className="text-white font-semibold">{(ds as any)._enriched.trainability.recommendedRam}</span></div>
                                                                            <div className="col-span-2">GPU: <span className="text-white font-semibold">{(ds as any)._enriched.trainability.recommendedGpu}</span></div>
                                                                            {(ds as any)._enriched.trainability.estimatedStorageGB && (
                                                                                <div className="col-span-2">Est. Storage: <span className="text-white font-semibold">{(ds as any)._enriched.trainability.estimatedStorageGB} GB</span></div>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Difficulty */}
                                                                    <div className="flex items-center justify-between text-xs">
                                                                        <span className="text-slate-500">Project Difficulty</span>
                                                                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${(ds as any)._enriched.difficulty.level === 'Beginner' ? 'bg-emerald-500/15 text-emerald-400' : (ds as any)._enriched.difficulty.level.includes('Intermediate') ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                                                            {(ds as any)._enriched.difficulty.level}
                                                                        </span>
                                                                    </div>
                                                                    {(ds as any)._enriched.difficulty.explanation && (
                                                                        <p className="text-[10px] text-slate-600">{(ds as any)._enriched.difficulty.explanation}</p>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Toggle expand button */}
                                                            {(ds as any)._enriched && !ds.rejected && (
                                                                <button
                                                                    onClick={() => toggleCard(dsRef(ds))}
                                                                    className="w-full mt-2 flex items-center justify-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition py-1"
                                                                >
                                                                    <span>{expandedCards.has(dsRef(ds)) ? '▲ Less info' : '▼ More info (risk, quality, trainability)'}</span>
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )) : (<div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-600 text-sm">No Kaggle datasets found.</div>)}
                                        </div>
                                    </div>
                                    {/* HF Models */}
                                    <div>
                                        <div className="flex items-center gap-3 mb-5">
                                            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-lg">🤗</div>
                                            <h3 className="text-lg font-bold text-white">Recommended Models</h3>
                                            <span className="ml-auto text-xs text-slate-600">{hfModels.length} found</span>
                                        </div>
                                        <div className="space-y-4">
                                            {hfModels.length > 0 ? hfModels.slice(0, 3).map((md: any, idx: number) => (
                                                <div key={idx} className="rounded-2xl p-5 border border-white/[0.07] bg-white/[0.03] hover:border-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.08)] transition-all duration-200">
                                                    <div className="flex items-center justify-between gap-3 mb-3">
                                                        <div className="min-w-0">
                                                            <code className="text-amber-200 font-mono text-sm font-bold truncate block">{md.id}</code>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">{md.task || md.pipeline || 'Unknown task'}</span>
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0 text-right">
                                                            <div className={`text-2xl font-black ${(md.matchScore ?? 0) >= 70 ? 'text-emerald-400' : (md.matchScore ?? 0) >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>{md.matchScore ?? 0}%</div>
                                                            <div className="text-[9px] text-slate-500 uppercase">match</div>
                                                        </div>
                                                    </div>
                                                    <a href={md.url} target="_blank" rel="noreferrer" className="inline-flex px-4 py-1.5 rounded-lg text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 transition">View Model →</a>
                                                </div>
                                            )) : (<div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-600 text-sm">No models found.</div>)}
                                        </div>
                                        {hfModels.length > 1 && (<div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">Model Comparison</h4>
                                            <div className="overflow-x-auto"><table className="w-full text-xs text-slate-300">
                                                <thead><tr className="border-b border-white/10"><th className="pb-3 pr-4 text-left text-slate-500 uppercase tracking-wider text-[10px]">Model</th><th className="pb-3 pr-4 text-left text-slate-500 uppercase tracking-wider text-[10px]">Task</th><th className="pb-3 pr-4 text-left text-slate-500 uppercase tracking-wider text-[10px]">Match</th><th className="pb-3 text-left text-slate-500 uppercase tracking-wider text-[10px]">Rec.</th></tr></thead>
                                                <tbody>{hfModels.slice(0, 4).map((md: any) => (<tr key={md.id} className="border-b border-white/[0.05] hover:bg-white/[0.02] transition"><td className="py-3 pr-4 font-mono text-amber-300 truncate max-w-[140px]">{md.id}</td><td className="py-3 pr-4 text-slate-400">{md.task || md.pipeline || '—'}</td><td className="py-3 pr-4"><span className={`font-bold ${(md.matchScore ?? 0) >= 70 ? 'text-emerald-400' : (md.matchScore ?? 0) >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>{md.matchScore ?? 0}%</span></td><td className="py-3 text-slate-400">{md.recommendation || 'Good'}</td></tr>))}</tbody>
                                            </table></div>
                                        </div>)}
                                    </div>
                                </div>
                                {/* ── Compare Datasets Banner ───────────────── */}
                                {selectedCompare.length > 0 && (
                                    <div className="rounded-2xl border border-violet-500/20 p-4 flex flex-wrap items-center gap-4" style={{ background: 'rgba(139,92,246,0.07)' }}>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[10px] uppercase tracking-widest text-violet-400 mb-2 font-bold">Compare Queue ({selectedCompare.length}/4)</div>
                                            <div className="flex flex-wrap gap-2">
                                                {compareDatasets.map(ds => (
                                                    <span key={dsRef(ds)} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-violet-500/15 border border-violet-500/25 text-violet-300 font-medium max-w-[200px]">
                                                        <span className="truncate">{dsName(ds).slice(0, 22)}</span>
                                                        <button onClick={() => toggleCompare(dsRef(ds))} className="text-violet-400/60 hover:text-rose-400 transition shrink-0 ml-0.5 font-bold">✕</button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {selectedCompare.length >= 2 ? (
                                                <button
                                                    onClick={() => setCompareModalOpen(true)}
                                                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition hover:brightness-110 active:scale-95"
                                                    style={{ background: 'linear-gradient(135deg,#7C3AED,#06B6D4)' }}
                                                >
                                                    Compare {selectedCompare.length} Datasets →
                                                </button>
                                            ) : (
                                                <span className="px-4 py-2.5 rounded-xl text-xs text-slate-500 border border-white/[0.07] bg-white/[0.02]">
                                                    Add {2 - selectedCompare.length} more to compare
                                                </span>
                                            )}
                                            <button
                                                onClick={() => setSelectedCompare([])}
                                                className="px-3 py-2.5 rounded-xl text-xs text-slate-500 hover:text-rose-400 border border-white/[0.07] bg-white/[0.02] transition"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── Smart Final Recommendation ───────────────────────────────────── */}
                                {smartRecommendation && !isLoading && (
                                    <div className="rounded-2xl border border-emerald-500/20 border-l-4 border-l-emerald-500 p-6" style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.05),rgba(5,5,8,0.5))' }}>
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-4">🎯 Recommended Starting Point</div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                                            {[
                                                { label: 'Dataset', value: smartRecommendation.datasets.join(' + ') },
                                                { label: 'Model', value: smartRecommendation.model },
                                                { label: 'Hardware', value: smartRecommendation.hardware },
                                                { label: 'Difficulty', value: smartRecommendation.difficulty },
                                            ].map(({ label, value }) => (
                                                <div key={label}>
                                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</div>
                                                    <div className="text-sm font-semibold text-white">{value}</div>
                                                </div>
                                            ))}
                                        </div>
                                        {smartRecommendation.expectedChallenge && (
                                            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
                                                ⚠ Expected challenge: {smartRecommendation.expectedChallenge}
                                            </div>
                                        )}
                                        {smartRecommendation.why && (
                                            <p className="text-xs text-slate-400 mb-4">{smartRecommendation.why}</p>
                                        )}
                                        {smartRecommendation.nextSteps?.length > 0 && (
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Next Steps</div>
                                                <ol className="space-y-1">
                                                    {smartRecommendation.nextSteps.map((step: string, i: number) => (
                                                        <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                                                            <span className="shrink-0 w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] text-slate-400 font-bold">{i + 1}</span>
                                                            {step}
                                                        </li>
                                                    ))}
                                                </ol>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── Feasibility + Hardware ───────────────────── */}
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                    <div className="rounded-2xl border border-white/[0.07] border-l-4 border-l-cyan-500 p-6" style={{ background: 'linear-gradient(135deg,rgba(6,182,212,0.04),rgba(5,5,8,0.5))' }}>
                                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-6">Project Feasibility</h3>
                                        <div className="space-y-5">
                                            {[
                                                { label: 'Dataset Availability', value: feasibility?.datasetAvailability ?? 0 },
                                                { label: 'Model Availability', value: feasibility?.modelAvailability ?? 0 },
                                                { label: 'Computational Feasibility', value: feasibility?.computationalFeasibility ?? (feasibility as any)?.computationalDifficulty ?? 0 },
                                                { label: 'Documentation', value: feasibility?.documentation ?? 0 },
                                                { label: 'Dataset Quality', value: feasibility?.datasetQuality ?? 0 },
                                            ].map(({ label, value }) => (
                                                <div key={label}>
                                                    <div className="flex justify-between text-sm mb-1.5"><span className="text-slate-300">{label}</span><span className={`font-bold ${value >= 70 ? 'text-emerald-400' : value >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>{value}</span></div>
                                                    <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className={`h-full rounded-full transition-all duration-700 ${value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${value}%` }} /></div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-6 p-4 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                                            <div><div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Overall Score</div><div className={`text-4xl font-black ${(feasibility?.overallScore ?? 0) >= 70 ? 'text-emerald-400' : (feasibility?.overallScore ?? 0) >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>{feasibility?.overallScore ?? 0}<span className="text-lg text-slate-500">/100</span></div></div>
                                            <span className={`px-4 py-2 rounded-xl text-sm font-bold border ${(feasibility?.overallScore ?? 0) >= 70 ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : (feasibility?.overallScore ?? 0) >= 40 ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-rose-500/15 border-rose-500/30 text-rose-300'}`}>{feasibility?.level || 'Unknown'}</span>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-white/[0.07] border-l-4 border-l-indigo-500 p-6" style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.04),rgba(5,5,8,0.5))' }}>
                                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-6">Recommended Hardware</h3>
                                        <div className="space-y-4">
                                            {[
                                                { icon: '🖥️', label: 'GPU', value: hardware?.gpu?.recommendedClass || 'Estimated', sub: hardware?.gpu?.vramRequirement ? `VRAM: ${hardware.gpu.vramRequirement}` : null, badge: 'Recommended' },
                                                { icon: '💾', label: 'RAM', value: hardware?.ram?.recommended || 'Estimated', sub: hardware?.ram?.minimum ? `Min: ${hardware.ram.minimum}` : null, badge: undefined },
                                                { icon: '📦', label: 'Storage', value: hardware?.storage?.dataset || 'Estimated', sub: hardware?.storage?.workingSpace ? `Working: ${hardware.storage.workingSpace}` : null, badge: undefined },
                                                { icon: '☁️', label: 'Cloud', value: hardware?.cloudAlternative || 'Estimated', sub: null, badge: undefined },
                                            ].map(({ icon, label, value, sub, badge }) => (
                                                <div key={label} className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/5">
                                                    <span className="text-2xl">{icon}</span>
                                                    <div className="flex-1 min-w-0"><div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</div><div className="text-white font-semibold text-sm">{value}</div>{sub && <div className="text-slate-500 text-xs mt-0.5">{sub}</div>}</div>
                                                    {badge && <span className="shrink-0 px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">{badge}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                            </>)}
                        </div>
                    )}

                </div>
            )}
            {/* ── Dataset Detail Modal ─────────────────────────────────────── */}
            {activeDataset && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={e => { if (e.target === e.currentTarget) setActiveDataset(null); }}>
                    <div className="w-full max-w-2xl rounded-2xl bg-[#0a0a0f] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.9)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-start justify-between gap-4 p-6 border-b border-white/[0.07]">
                            <div>
                                <div className="text-xs uppercase tracking-widest text-violet-400 mb-1">{activeDataset.source || 'Dataset'}</div>
                                <h3 className="text-xl font-bold text-white">{dsName(activeDataset)}</h3>
                                {dsSubtitle(activeDataset) && <p className="text-slate-400 text-sm mt-1">{dsSubtitle(activeDataset)}</p>}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <MatchCircle score={dsScore(activeDataset)} />
                                <button onClick={() => setActiveDataset(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-slate-400 transition text-lg">✕</button>
                            </div>
                        </div>
                        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-3">
                                {[{ label: 'Creator', value: dsCreator(activeDataset) }, { label: 'License', value: activeDataset.license || '—' }, { label: 'Size', value: formatBytes(dsSize(activeDataset)) }, { label: 'Source', value: activeDataset.source || '—' }].map(({ label, value }) => (
                                    <div key={label} className="p-3 rounded-xl bg-white/[0.03] border border-white/5"><div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div><div className="text-sm font-semibold text-white">{value}</div></div>
                                ))}
                            </div>
                            {dsBreakdown(activeDataset) && (
                                <div><div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Score Breakdown</div>
                                    <div className="grid grid-cols-2 gap-3"><ScoreBar value={dsBreakdown(activeDataset)!.task} max={30} label="Task Match" /><ScoreBar value={dsBreakdown(activeDataset)!.modality} max={20} label="Modality" /><ScoreBar value={dsBreakdown(activeDataset)!.domain} max={20} label="Domain" /><ScoreBar value={dsBreakdown(activeDataset)!.subdomain} max={15} label="Subdomain" /><ScoreBar value={dsBreakdown(activeDataset)!.target} max={10} label="Target Labels" /><ScoreBar value={dsBreakdown(activeDataset)!.metadata} max={5} label="Metadata" /></div></div>
                            )}
                            {activeDataset.matchReason && (<div className="p-4 rounded-xl border border-violet-500/20" style={{ background: 'rgba(139,92,246,0.07)' }}><div className="text-[10px] uppercase tracking-wider text-violet-400 mb-2">Match Reason</div><p className="text-sm text-slate-300">{activeDataset.matchReason}</p></div>)}
                        </div>
                        <div className="p-6 border-t border-white/[0.07] flex gap-3">
                            <a href={activeDataset.url} target="_blank" rel="noreferrer" className="flex-1 text-center py-2.5 rounded-xl text-sm font-bold text-white hover:brightness-110 transition" style={{ background: 'linear-gradient(135deg,#8B5CF6,#06B6D4)' }}>Open Dataset ↗</a>
                            <button onClick={() => setActiveDataset(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-300 bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Dataset Comparison Modal ───────────────────────────── */}
            {compareModalOpen && compareDatasets.length >= 2 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={e => { if (e.target === e.currentTarget) setCompareModalOpen(false); }}>
                    <div className="w-full max-w-5xl rounded-2xl bg-[#0a0a0f] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.9)] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

                        {/* Modal header */}
                        <div className="flex items-center justify-between gap-4 p-6 border-b border-white/[0.07] shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-white">Dataset Comparison</h2>
                                <p className="text-xs text-slate-500 mt-0.5">Comparing {compareDatasets.length} datasets side by side</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => { setSelectedCompare([]); setCompareModalOpen(false); }} className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-rose-400 border border-white/[0.07] transition">Clear all</button>
                                <button onClick={() => setCompareModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-slate-400 transition text-lg">✕</button>
                            </div>
                        </div>

                        {/* Modal body — scrollable */}
                        <div className="overflow-y-auto flex-1 p-6">

                            {/* Dataset name headers */}
                            <div className={`grid gap-4 mb-6`} style={{ gridTemplateColumns: `160px repeat(${compareDatasets.length}, 1fr)` }}>
                                <div />
                                {compareDatasets.map(ds => (
                                    <div key={dsRef(ds)} className="rounded-xl p-4 border border-white/[0.07] bg-white/[0.03]">
                                        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{ds.source || 'Dataset'}</div>
                                        <h3 className="text-sm font-bold text-white leading-tight line-clamp-2">{dsName(ds)}</h3>
                                        <div className="mt-2 flex items-center justify-between">
                                            <MatchCircle score={dsScore(ds)} />
                                            <button onClick={() => toggleCompare(dsRef(ds))} className="text-[10px] text-slate-600 hover:text-rose-400 transition">Remove</button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Score breakdown bars */}
                            <div className="mb-8">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">Match Score Breakdown</div>
                                {(['task', 'modality', 'domain', 'subdomain', 'target', 'metadata'] as const).map(field => {
                                    const maxMap = { task: 30, modality: 20, domain: 20, subdomain: 15, target: 10, metadata: 5 };
                                    const max = maxMap[field];
                                    return (
                                        <div key={field} className={`grid gap-4 mb-3 items-center`} style={{ gridTemplateColumns: `160px repeat(${compareDatasets.length}, 1fr)` }}>
                                            <div className="text-[10px] uppercase tracking-wider text-slate-500 text-right pr-4">{field}<span className="text-slate-600 ml-1">/{max}</span></div>
                                            {compareDatasets.map(ds => {
                                                const val = dsBreakdown(ds)?.[field] ?? 0;
                                                const pct = max > 0 ? (val / max) * 100 : 0;
                                                const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500';
                                                return (
                                                    <div key={dsRef(ds)} className="space-y-1">
                                                        <div className="flex justify-between text-[10px]">
                                                            <span className={pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-rose-400'}>{val}</span>
                                                            <span className="text-slate-600">{Math.round(pct)}%</span>
                                                        </div>
                                                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Metadata comparison table */}
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">Dataset Metadata</div>
                                {[
                                    { label: 'Description', fn: (ds: any) => dsSubtitle(ds) || '—' },
                                    { label: 'License', fn: (ds: any) => ds.license || '—' },
                                    { label: 'Size', fn: (ds: any) => formatBytes(dsSize(ds)) },
                                    { label: 'Creator', fn: (ds: any) => dsCreator(ds) },
                                    { label: 'Downloads', fn: (ds: any) => ds.downloads ? ds.downloads.toLocaleString() : '—' },
                                    { label: 'Tags', fn: (ds: any) => (ds.tags || []).slice(0, 4).join(', ') || '—' },
                                ].map(({ label, fn }) => (
                                    <div key={label} className={`grid gap-4 py-3 border-b border-white/[0.05]`} style={{ gridTemplateColumns: `160px repeat(${compareDatasets.length}, 1fr)` }}>
                                        <div className="text-[10px] uppercase tracking-wider text-slate-500 text-right pr-4 self-center">{label}</div>
                                        {compareDatasets.map(ds => (
                                            <div key={dsRef(ds)} className="text-sm text-slate-300 leading-relaxed">{fn(ds)}</div>
                                        ))}
                                    </div>
                                ))}
                            </div>

                            {/* Winner highlight */}
                            {(() => {
                                const winner = [...compareDatasets].sort((a, b) => dsScore(b) - dsScore(a))[0];
                                return winner ? (
                                    <div className="mt-8 rounded-xl p-5 border border-emerald-500/20" style={{ background: 'rgba(16,185,129,0.07)' }}>
                                        <div className="text-[10px] uppercase tracking-widest text-emerald-500 mb-2 font-bold">🏆 Recommended Choice</div>
                                        <div className="flex items-center gap-3">
                                            <MatchCircle score={dsScore(winner)} />
                                            <div>
                                                <div className="text-white font-bold">{dsName(winner)}</div>
                                                <div className="text-slate-400 text-sm mt-0.5">Highest overall match score among compared datasets</div>
                                                {winner.matchReason && <div className="text-slate-500 text-xs mt-1">{winner.matchReason}</div>}
                                            </div>
                                            <a href={winner.url} target="_blank" rel="noreferrer" className="ml-auto shrink-0 px-4 py-2 rounded-xl text-sm font-bold text-white hover:brightness-110 transition" style={{ background: 'linear-gradient(135deg,#059669,#0891B2)' }}>Open ↗</a>
                                        </div>
                                    </div>
                                ) : null;
                            })()}

                            {/* Compatibility analysis */}
                            {datasetCompatibility.length > 0 && (
                                <div className="mt-4">
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Dataset Compatibility</div>
                                    <div className="space-y-2">
                                        {datasetCompatibility.filter(c => compareDatasets.some((d: any) => (d.name || d.id) === c.pair[0] || (d.name || d.id) === c.pair[1])).map((c: any, i: number) => (
                                            <div key={i} className="rounded-xl p-3 border border-white/[0.07] bg-white/[0.02]">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs text-slate-300">{c.pair[0].slice(0, 20)} + {c.pair[1].slice(0, 20)}</span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.compatibility === 'High' ? 'bg-emerald-500/15 text-emerald-400' : c.compatibility === 'Medium' ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>{c.compatibility}</span>
                                                </div>
                                                <p className="text-[10px] text-slate-500">{c.reason}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Label mapping */}
                            {labelMapping.length > 0 && (
                                <div className="mt-4">
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Suggested Label Mapping <span className="text-slate-600 font-normal">(review before use)</span></div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {labelMapping.map((m: any, i: number) => (
                                            <div key={i} className="flex items-center gap-2 text-xs bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                                                <code className="text-amber-300">{m.from}</code>
                                                <span className="text-slate-500">→</span>
                                                <code className="text-emerald-300">{m.to}</code>
                                                <span className="ml-auto text-[9px] text-slate-600">{m.dataset.slice(0, 15)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal footer */}
                        <div className="p-6 border-t border-white/[0.07] flex gap-3 shrink-0">
                            <button onClick={() => setCompareModalOpen(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-300 bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Anonymous Search Gate Modal ──────────────────────────── */}
            {showSignInGate && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    onClick={e => { if (e.target === e.currentTarget) setShowSignInGate(false); }}
                >
                    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0d0d15] shadow-[0_0_100px_rgba(0,0,0,0.9)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Top gradient bar */}
                        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#8B5CF6,#06B6D4,#10B981)' }} />

                        <div className="p-8 text-center">
                            {/* Icon */}
                            <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-[0_0_40px_rgba(139,92,246,0.4)]" style={{ background: 'linear-gradient(135deg,#8B5CF6,#06B6D4)' }}>
                                <span className="text-3xl">✦</span>
                            </div>

                            <h2 className="text-2xl font-black text-white mb-2">You&apos;ve used your free searches</h2>
                            <p className="text-slate-400 text-sm leading-relaxed mb-6">
                                You&apos;ve used <span className="text-white font-semibold">2 free searches</span>. Create a free account to get unlimited dataset discovery, AI-powered analysis, and model recommendations.
                            </p>

                            {/* Benefits list */}
                            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 mb-6 text-left space-y-2">
                                {[
                                    { icon: '🔍', text: 'Unlimited AI-powered dataset searches' },
                                    { icon: '🤗', text: 'Hugging Face & Kaggle dataset discovery' },
                                    { icon: '🧠', text: 'Full project feasibility analysis' },
                                    { icon: '⚡', text: 'Model recommendations & comparisons' },
                                ].map(({ icon, text }) => (
                                    <div key={text} className="flex items-center gap-3 text-sm">
                                        <span className="text-lg">{icon}</span>
                                        <span className="text-slate-300">{text}</span>
                                    </div>
                                ))}
                            </div>

                            {/* CTA buttons */}
                            <div className="space-y-3">
                                <a
                                    href="/signup"
                                    className="block w-full py-3.5 rounded-2xl text-sm font-bold text-white transition hover:brightness-110 active:scale-95 shadow-[0_0_30px_rgba(139,92,246,0.3)]"
                                    style={{ background: 'linear-gradient(135deg,#8B5CF6,#06B6D4)' }}
                                >
                                    Create Free Account →
                                </a>
                                <a
                                    href="/login"
                                    className="block w-full py-3.5 rounded-2xl text-sm font-semibold text-slate-300 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition"
                                >
                                    Sign In to Existing Account
                                </a>
                            </div>

                            <button
                                onClick={() => setShowSignInGate(false)}
                                className="mt-4 text-xs text-slate-600 hover:text-slate-400 transition"
                            >
                                Maybe later
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ChatWidget />
        </main>
    );
}
