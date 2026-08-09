"use client";

import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

type DatasetItem = {
    title: string;
    subtitle?: string;
    url: string;
    creatorName: string;
    ref: string;
    relevanceScore?: number;
    license?: string;
    datasetSize?: number;
    source?: string;
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
    const [query, setQuery] = useState("");
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    // Search states
    const [isLoading, setIsLoading] = useState(false);
    const [showRegistrationPrompt, setShowRegistrationPrompt] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [conversationMessage, setConversationMessage] = useState<string | null>(null);
    const [selectedCompare, setSelectedCompare] = useState<string[]>([]);
    const [activeDataset, setActiveDataset] = useState<DatasetItem | null>(null);
    const [sourceFilters, setSourceFilters] = useState<string[]>(['kaggle', 'huggingface']);
    const [taskFilters, setTaskFilters] = useState<string[]>([]);
    const [dataTypeFilters, setDataTypeFilters] = useState<string[]>([]);
    const [difficultyFilters, setDifficultyFilters] = useState<string[]>([]);

    const activeRequestRef = useRef<AbortController | null>(null);
    const latestRequestIdRef = useRef(0);

    const summary = results?.summary;
    const feasibility = results?.feasibility;
    const hardware = results?.hardware;
    const bestDataset = summary?.bestDataset;
    const bestModel = summary?.bestModel;

    const compareDatasets = useMemo(() => {
        if (!results?.results?.kaggle) return [];
        return results.results.kaggle.filter((item: any) => selectedCompare.includes(item.ref));
    }, [results, selectedCompare]);

    const filteredDatasets = useMemo(() => {
        if (!results?.results?.kaggle) return [];
        return results.results.kaggle.filter((item: any) => {
            if (sourceFilters.length && !sourceFilters.includes(item.source || 'kaggle')) return false;
            if (taskFilters.length && item.taskTags && !item.taskTags.some((tag: string) => taskFilters.includes(tag))) return false;
            if (dataTypeFilters.length && item.dataTypeTags && !item.dataTypeTags.some((tag: string) => dataTypeFilters.includes(tag))) return false;
            return true;
        });
    }, [results, sourceFilters, taskFilters, dataTypeFilters]);

    const filteredModels = useMemo(() => {
        if (!results?.results?.hfModels) return [];
        return results.results.hfModels.filter((item: any) => {
            if (sourceFilters.length && !sourceFilters.includes(item.source || 'huggingface')) return false;
            if (difficultyFilters.length && item.difficulty && !difficultyFilters.includes(item.difficulty)) return false;
            return true;
        });
    }, [results, sourceFilters, difficultyFilters]);

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

    const recommendationText = bestDataset && bestModel
        ? `Start with the ${bestDataset.title} dataset and apply ${bestModel.id} as a transfer-learning baseline for your ${results?.analysis?.task?.toLowerCase() || 'project'}. Focus on data preprocessing first to match the model input shape.`
        : 'Select a project idea to surface the best dataset and model recommendations.';

    const roadmapSteps = [
        { title: 'Define Project', description: `Clarify the goal: ${results?.analysis?.project_title || 'your AI task'}.` },
        { title: 'Analyze Data', description: `Review the dataset details and ensure the task and modality match ${results?.analysis?.data_type || 'your data type'}.` },
        { title: 'Prepare Data', description: `Clean, normalize, and organize the input data for ${results?.analysis?.task || 'your task'}.` },
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
        if (!submitQuery.trim()) return;

        if (!session?.user) {
            const searchCount = parseInt(localStorage.getItem('anonymous_search_count') || '0');
            if (searchCount >= 2) {
                setShowRegistrationPrompt(true);
                return;
            }
            localStorage.setItem('anonymous_search_count', (searchCount + 1).toString());
        }

        const requestId = latestRequestIdRef.current + 1;
        latestRequestIdRef.current = requestId;

        activeRequestRef.current?.abort();
        const controller = new AbortController();
        activeRequestRef.current = controller;

        console.log("CURRENT USER PROMPT:", submitQuery);
        setIsLoading(true);
        setHasSearched(true);
        setResults(null);
        setConversationMessage(null);
        setSelectedCompare([]);
        setActiveDataset(null);
        setSourceFilters(['kaggle', 'huggingface']);
        setTaskFilters([]);
        setDataTypeFilters([]);
        setDifficultyFilters([]);

        try {
            const response = await fetch("/api/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: submitQuery }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Search failed with status: ${response.status}`);
            }

            const data = await response.json();

            if (requestId !== latestRequestIdRef.current || controller.signal.aborted) {
                return;
            }

            setResults(data);
            if (data?.intent && data.intent !== 'PROJECT_REQUEST') {
                setConversationMessage(data.message || 'I can help with that. Tell me more about your idea.');
            } else {
                setConversationMessage(null);
            }
        } catch (error) {
            if (requestId === latestRequestIdRef.current && !controller.signal.aborted) {
                console.error("Search error:", error);
            }
        } finally {
            if (requestId === latestRequestIdRef.current && !controller.signal.aborted) {
                setIsLoading(false);
            }
        }
    };

    return (
        <main className={`min-h-screen bg-[#0c0a09] relative flex flex-col items-center p-4 transition-all duration-700 ease-in-out ${hasSearched ? "pt-24 justify-start" : "justify-center"}`}>

            {/* Top Navigation - Profile Section */}
            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
                <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight transition-transform hover:scale-105">
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-amber-300 via-orange-400 to-rose-500 text-slate-950 shadow-[0_0_20px_rgba(249,115,22,0.35)] text-sm">
                        ✦
                    </div>
                </Link>

                {session?.user ? (
                    <div className="relative">
                        <button
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            className="flex items-center gap-3 bg-white/[0.03] border border-white/10 hover:border-white/20 hover:bg-white/[0.06] transition rounded-full pl-3 pr-4 py-2"
                        >
                            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-rose-500 to-orange-400 flex items-center justify-center text-white font-semibold text-sm">
                                {session.user.name?.charAt(0) || session.user.email?.charAt(0) || 'U'}
                            </div>
                            <span className="text-sm font-medium text-slate-200">{session.user.name || session.user.email}</span>
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {isProfileOpen && (
                            <div className="absolute right-0 mt-3 w-56 rounded-2xl border border-white/10 bg-[#1c1917]/90 backdrop-blur-xl shadow-2xl py-2 animate-in fade-in slide-in-from-top-2 origin-top-right z-50">
                                <div className="px-4 py-3 border-b border-white/5">
                                    <p className="text-sm font-medium text-white truncate">{session.user.name}</p>
                                    <p className="text-xs text-slate-400 truncate mt-0.5">{session.user.email}</p>
                                </div>
                                <div className="p-2">
                                    <Link
                                        href="/settings"
                                        className="block w-full text-left px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition"
                                    >
                                        Settings
                                    </Link>
                                    <button
                                        onClick={() => signOut({ callbackUrl: '/login' })}
                                        className="w-full text-left px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 rounded-xl transition mt-1"
                                    >
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

            {/* Background glowing gradients */}
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-gradient-to-br from-rose-500/10 via-orange-500/5 to-amber-400/10 blur-3xl h-[600px] w-[600px] -z-10 pointer-events-none transition-all duration-1000 ${hasSearched ? "opacity-30 top-1/4 scale-150" : "opacity-100"}`} />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:28px_28px] opacity-15 pointer-events-none" />

            <div className={`w-full max-w-4xl text-center z-10 relative transition-all duration-700 ease-in-out`}>
                <div className={`space-y-4 transition-all duration-700 ${hasSearched ? "opacity-0 h-0 overflow-hidden mb-0" : "opacity-100 h-auto mb-8"}`}>
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
                        What's your <span className="bg-clip-text text-transparent bg-gradient-to-r from-rose-400 via-orange-400 to-amber-300">idea?</span>
                    </h1>
                    <p className="text-lg text-slate-400">
                        Enter your concept and we'll help you find the best datasets, models, and roadmaps to build it.
                    </p>
                </div>

                <div className="relative group max-w-2xl mx-auto w-full">
                    {/* Glowing effect behind input - less intense when searched */}
                    <div className={`absolute -inset-1 bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400 rounded-3xl blur transition duration-500 ${hasSearched ? "opacity-10" : "opacity-25 group-focus-within:opacity-50"}`}></div>

                    <form
                        className="relative flex items-center bg-[#1c1917]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-2 shadow-2xl transition hover:border-white/20"
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSearch(query);
                        }}
                    >
                        <div className="pl-6 pr-4 text-slate-400 pointer-events-none">
                            {isLoading ? (
                                <svg className="w-6 h-6 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                </svg>
                            )}
                        </div>

                        <input
                            type="text"
                            className="w-full bg-transparent text-lg text-slate-200 placeholder-slate-500 outline-none py-4 px-2"
                            placeholder="I want to detect brain tumors from MRI images using deep learning..."
                            value={query}
                            disabled={isLoading}
                            onChange={(e) => setQuery(e.target.value)}
                        />

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`bg-gradient-to-r from-rose-500 to-orange-400 text-white font-medium rounded-2xl px-6 py-4 shadow-[0_10px_30px_rgba(244,63,94,0.3)] transition shrink-0 transform active:scale-95 ${isLoading ? "opacity-50 cursor-not-allowed" : "hover:brightness-110"}`}
                        >
                            Explore
                        </button>
                    </form>
                </div>

                {!hasSearched && (
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-6 max-w-2xl mx-auto w-full">
                        <span className="text-sm text-slate-500 font-medium mr-2">Try:</span>
                        {[
                            "Medical Image Classification",
                            "Real-time Object Tracking",
                            "Natural Language Chatbot"
                        ].map((suggestion, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    setQuery(suggestion);
                                    handleSearch(suggestion);
                                }}
                                className="text-sm px-4 py-2 rounded-full border border-white/5 bg-white/[0.02] text-slate-300 hover:text-white hover:bg-white/[0.06] hover:border-white/10 transition"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Results Area */}
            {hasSearched && (
                <div className="w-full max-w-6xl mt-12 mb-20 animate-in fade-in slide-in-from-bottom-5 duration-700">
                    {isLoading ? (
                        <div className="space-y-8">
                            {/* Gemini Skeleton */}
                            <div className="w-full p-6 bg-white/[0.02] border border-white/10 rounded-3xl animate-pulse">
                                <div className="h-6 bg-white/10 rounded w-1/4 mb-4"></div>
                                <div className="space-y-3">
                                    <div className="h-4 bg-white/5 rounded w-full"></div>
                                    <div className="h-4 bg-white/5 rounded w-5/6"></div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Kaggle Skeleton */}
                                <div className="space-y-4">
                                    <div className="h-6 bg-white/10 rounded w-1/3 mb-6"></div>
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="h-24 bg-white/[0.02] border border-white/5 rounded-2xl animate-pulse"></div>
                                    ))}
                                </div>
                                {/* HF Skeleton */}
                                <div className="space-y-4">
                                    <div className="h-6 bg-white/10 rounded w-1/3 mb-6"></div>
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="h-24 bg-white/[0.02] border border-white/5 rounded-2xl animate-pulse"></div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : results ? (
                        <div className="space-y-8 text-left">
                            {results.intent && results.intent !== 'PROJECT_REQUEST' ? (
                                <div className="rounded-3xl border border-white/10 bg-[#1c1917]/80 p-8 text-center text-slate-200">
                                    <h3 className="text-2xl font-semibold text-white mb-3">{conversationMessage || 'I can help with that.'}</h3>
                                    <p className="text-slate-400">Share your AI/ML idea or problem statement, and I’ll suggest datasets, models, preprocessing steps, and a roadmap.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Gemini Analysis Panel */}
                                    <div className="relative group overflow-hidden rounded-3xl">
                                        <div className="absolute inset-0 bg-gradient-to-r from-rose-500/10 via-orange-500/10 to-amber-500/10 opacity-50 group-hover:opacity-100 transition duration-500"></div>
                                        <div className="relative bg-[#1c1917]/80 backdrop-blur-md border border-amber-500/30 p-8">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="h-8 w-8 flex items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]">
                                                    <span className="text-sm">✨</span>
                                                </div>
                                                <h3 className="text-xl font-semibold text-white">AI Project Analysis</h3>
                                            </div>
                                            <div className="text-slate-300 text-lg leading-relaxed mb-6">
                                                {typeof results.analysis === 'string' ? (
                                                    <p>{results.analysis}</p>
                                                ) : results.analysis ? (
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div><strong className="text-amber-200">Title:</strong> {results.analysis.project_title || 'N/A'}</div>
                                                        <div><strong className="text-amber-200">Domain:</strong> {results.analysis.domain || 'N/A'}</div>
                                                        <div><strong className="text-amber-200">Task:</strong> {results.analysis.task || 'N/A'}</div>
                                                        {results.analysis.secondary_task && (
                                                            <div><strong className="text-amber-200">Secondary Task:</strong> {results.analysis.secondary_task}</div>
                                                        )}
                                                        <div><strong className="text-amber-200">Data Type:</strong> {results.analysis.data_type || 'N/A'}</div>
                                                        {results.analysis.models?.length > 0 && (
                                                            <div className="col-span-2"><strong className="text-amber-200">Suggested Architecture:</strong> {results.analysis.models.join(", ")}</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p>Project analysis is unavailable for this search.</p>
                                                )}
                                            </div>

                                            {((results.analysis?.keywords?.length ?? 0) > 0 || (results.recommendationKeywords?.length ?? 0) > 0) && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm text-slate-500 mr-2">Keywords suggested:</span>
                                                    {(results.analysis?.keywords || results.recommendationKeywords || []).map((tag: string, i: number) => (
                                                        <span key={i} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-amber-200">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                        <div className="rounded-3xl bg-[#1c1917]/80 border border-white/10 p-6">
                                            <h3 className="text-lg font-semibold text-white mb-4">Project Summary</h3>
                                            <div className="space-y-3 text-slate-300 text-sm">
                                                <div><span className="text-slate-400">Project:</span> <span className="text-white">{summary?.projectTitle || results.analysis?.project_title}</span></div>
                                                <div><span className="text-slate-400">Domain:</span> <span className="text-white">{summary?.domain || results.analysis?.domain}</span></div>
                                                <div><span className="text-slate-400">Task:</span> <span className="text-white">{summary?.task || `${results.analysis?.task || 'N/A'}${results.analysis?.secondary_task ? ` + ${results.analysis.secondary_task}` : ''}`}</span></div>
                                                <div><span className="text-slate-400">Data:</span> <span className="text-white">{summary?.dataType || results.analysis?.data_type || 'N/A'}</span></div>
                                                <div><span className="text-slate-400">Datasets found:</span> <span className="text-white">{summary?.datasetsFound ?? results.results?.kaggle?.length ?? 0}</span></div>
                                                <div><span className="text-slate-400">Models found:</span> <span className="text-white">{summary?.modelsFound ?? results.results?.hfModels?.length ?? 0}</span></div>
                                            </div>
                                        </div>

                                        <div className="lg:col-span-2 rounded-3xl bg-[#1c1917]/80 border border-white/10 p-6">
                                            <div className="flex items-center justify-between gap-4 mb-4">
                                                <div>
                                                    <h3 className="text-2xl font-semibold text-white">🏆 Best Dataset for Your Project</h3>
                                                    <p className="text-sm text-slate-400 mt-1">Recommended from Kaggle based on relevance, task match, and metadata.</p>
                                                </div>
                                                <span className="text-sm font-semibold text-emerald-300">{bestDataset?.relevanceScore ?? 0}% Match</span>
                                            </div>
                                            {bestDataset ? (
                                                <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                                                    <div className="space-y-2">
                                                        <h4 className="text-xl font-semibold text-slate-100">{bestDataset.title}</h4>
                                                        <p className="text-slate-400 text-sm">{bestDataset.subtitle || 'Dataset details unavailable'}</p>
                                                        <div className="grid gap-3 sm:grid-cols-2 mt-3 text-sm text-slate-300">
                                                            <div><span className="text-slate-400">Source:</span> Kaggle</div>
                                                            <div><span className="text-slate-400">License:</span> {bestDataset.license || 'Information unavailable'}</div>
                                                            <div><span className="text-slate-400">Creator:</span> {bestDataset.creatorName || 'Unknown'}</div>
                                                            <div><span className="text-slate-400">Size:</span> {formatBytes(bestDataset.datasetSize)}</div>
                                                        </div>
                                                        <p className="text-slate-400 text-sm mt-3">This dataset closely matches your project because it includes relevant keywords, task-aligned metadata, and dataset attributes aligned to your {results.analysis?.task?.toLowerCase() || 'project'}.</p>
                                                    </div>
                                                    <div className="flex flex-col gap-3 sm:items-end">
                                                        <a
                                                            href={bestDataset.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-rose-500 to-orange-400 px-6 py-3 text-sm font-semibold text-white hover:brightness-110 transition"
                                                        >
                                                            View Dataset
                                                        </a>
                                                        <button
                                                            onClick={() => setActiveDataset(bestDataset)}
                                                            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:border-white/20 transition"
                                                        >
                                                            View details
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-slate-500">No best dataset could be selected automatically.</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        <div>
                                            <div className="flex items-center gap-3 mb-6">
                                                <div className="w-8 h-8 rounded-full bg-[#20BEFF]/20 flex items-center justify-center text-[#20BEFF]">
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.8 2h4l-8.5 8.6L23 22h-4.3l-5.8-9.1-3 2.9V22H6V2h3.9v10.5l8.9-10.5z" /></svg>
                                                </div>
                                                <h3 className="text-2xl font-semibold text-white">Kaggle Datasets</h3>
                                            </div>

                                            <div className="grid gap-4">
                                                {results.results?.kaggle?.length > 0 ? (
                                                    results.results.kaggle.map((ds: any, idx: number) => (
                                                        <div key={idx} className="p-5 rounded-3xl bg-[#1c1917]/55 border border-white/10 transition hover:border-[#20BEFF]/40">
                                                            <div className="flex items-start justify-between gap-4">
                                                                <div>
                                                                    <h4 className="text-lg font-semibold text-white mb-1 truncate">{ds.title || ds.ref}</h4>
                                                                    <p className="text-slate-400 text-sm line-clamp-2">{ds.subtitle || 'No subtitle available'}</p>
                                                                </div>
                                                                <label className="flex items-center gap-2 text-sm text-slate-300">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedCompare.includes(ds.ref)}
                                                                        onChange={() => toggleCompare(ds.ref)}
                                                                        className="h-4 w-4 rounded border-white/10 bg-slate-900 text-amber-300"
                                                                    />
                                                                    Compare
                                                                </label>
                                                            </div>
                                                            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
                                                                <span className="px-2 py-1 rounded-full bg-white/5">{ds.relevanceScore ?? 0}% match</span>
                                                                <span className="px-2 py-1 rounded-full bg-white/5">{ds.source || 'Kaggle'}</span>
                                                                <span className="px-2 py-1 rounded-full bg-white/5">{formatBytes(ds.datasetSize)}</span>
                                                                <span className="px-2 py-1 rounded-full bg-white/5">{ds.license || 'License unavailable'}</span>
                                                            </div>
                                                            <div className="mt-4 flex flex-wrap gap-3">
                                                                <a
                                                                    href={ds.url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="rounded-2xl bg-[#20BEFF]/10 px-4 py-2 text-sm text-[#20BEFF] hover:bg-[#20BEFF]/15 transition"
                                                                >
                                                                    View Dataset →
                                                                </a>
                                                                <button
                                                                    onClick={() => setActiveDataset(ds)}
                                                                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:border-white/20 transition"
                                                                >
                                                                    Details
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="p-5 rounded-2xl border border-white/5 border-dashed text-slate-500 bg-white/[0.01]">
                                                        No Kaggle datasets found for these keywords.
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-3 mb-6">
                                                <div className="w-8 h-8 rounded-full bg-[#FFD21E]/20 flex items-center justify-center text-[#FFD21E] text-xl">
                                                    🤗
                                                </div>
                                                <h3 className="text-2xl font-semibold text-white">Recommended Models</h3>
                                            </div>

                                            <div className="space-y-4">
                                                {results.results?.hfModels?.length > 0 ? (
                                                    results.results.hfModels.slice(0, 6).map((md: any, idx: number) => (
                                                        <div key={idx} className="p-5 rounded-3xl bg-[#1c1917]/55 border border-white/10 hover:border-[#FFD21E]/40 transition">
                                                            <div className="flex items-center justify-between gap-4">
                                                                <div>
                                                                    <h4 className="text-lg font-semibold text-amber-200 truncate">{md.id}</h4>
                                                                    <p className="text-slate-400 text-sm mt-1">{md.pipeline || 'Unknown task'}</p>
                                                                </div>
                                                                <span className="text-sm font-semibold text-slate-200">{md.matchScore ?? 0}%</span>
                                                            </div>
                                                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                                                                <span className="px-2 py-1 rounded-full bg-white/5">{md.difficulty || 'Unknown'}</span>
                                                                <span className="px-2 py-1 rounded-full bg-white/5">{md.recommendation || 'Good choice'}</span>
                                                            </div>
                                                            <div className="mt-4 flex flex-wrap gap-3">
                                                                <a
                                                                    href={md.url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="rounded-2xl bg-[#FFD21E]/10 px-4 py-2 text-sm text-[#FFD21E] hover:bg-[#FFD21E]/15 transition"
                                                                >
                                                                    View Model →
                                                                </a>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="p-5 rounded-2xl border border-white/5 border-dashed text-slate-500 bg-white/[0.01]">
                                                        No models found for these keywords.
                                                    </div>
                                                )}
                                            </div>

                                            {results.results?.hfModels?.length > 0 && (
                                                <div className="mt-6 rounded-3xl border border-white/10 bg-[#1c1917]/80 p-5">
                                                    <h4 className="text-base font-semibold text-slate-100 mb-3">Model comparison</h4>
                                                    <div className="overflow-x-auto">
                                                        <table className="min-w-full text-left text-sm text-slate-300">
                                                            <thead>
                                                                <tr>
                                                                    <th className="pb-3 pr-4">Model</th>
                                                                    <th className="pb-3 pr-4">Task</th>
                                                                    <th className="pb-3 pr-4">Match</th>
                                                                    <th className="pb-3 pr-4">Difficulty</th>
                                                                    <th className="pb-3">Recommendation</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {results.results.hfModels.slice(0, 4).map((md: any) => (
                                                                    <tr key={md.id} className="border-t border-white/5">
                                                                        <td className="py-3 pr-4 text-slate-100">{md.id}</td>
                                                                        <td className="py-3 pr-4">{md.pipeline || 'Unknown'}</td>
                                                                        <td className="py-3 pr-4">{md.matchScore ?? 0}%</td>
                                                                        <td className="py-3 pr-4">{md.difficulty || 'Unknown'}</td>
                                                                        <td className="py-3">{md.recommendation || 'Good'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {selectedCompare.length > 1 && (
                                        <div className="rounded-3xl border border-white/10 bg-[#1c1917]/80 p-6">
                                            <div className="flex items-center justify-between gap-4 mb-4">
                                                <div>
                                                    <h3 className="text-xl font-semibold text-white">Dataset Comparison</h3>
                                                    <p className="text-slate-400 text-sm">Compare selected datasets side by side.</p>
                                                </div>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="min-w-full text-left text-sm text-slate-300">
                                                    <thead>
                                                        <tr>
                                                            <th className="pb-3 pr-4">Feature</th>
                                                            {compareDatasets.map((ds) => (
                                                                <th key={ds.ref} className="pb-3 pr-4">{ds.title}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {['subtitle', 'license', 'datasetSize', 'creatorName', 'relevanceScore'].map((field) => (
                                                            <tr key={field} className="border-t border-white/5">
                                                                <td className="py-3 pr-4 text-slate-400 capitalize">{field === 'datasetSize' ? 'Size' : field === 'relevanceScore' ? 'Match' : field === 'creatorName' ? 'Creator' : field}</td>
                                                                {compareDatasets.map((ds) => (
                                                                    <td key={ds.ref + field} className="py-3 pr-4">{field === 'datasetSize' ? formatBytes(ds.datasetSize) : field === 'relevanceScore' ? `${ds.relevanceScore ?? 0}%` : ds[field] || 'Information unavailable'}</td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                        <div className="rounded-3xl bg-[#1c1917]/80 border border-white/10 p-6">
                                            <h3 className="text-xl font-semibold text-white mb-4">Project Feasibility</h3>
                                            <div className="grid gap-3">
                                                <div className="flex items-center justify-between text-sm text-slate-300"><span>Dataset Availability</span><span>{feasibility?.datasetAvailability ?? 'N/A'} / 100</span></div>
                                                <div className="flex items-center justify-between text-sm text-slate-300"><span>Model Availability</span><span>{feasibility?.modelAvailability ?? 'N/A'} / 100</span></div>
                                                <div className="flex items-center justify-between text-sm text-slate-300"><span>Computational Difficulty</span><span>{feasibility?.computationalDifficulty ?? 'N/A'} / 100</span></div>
                                                <div className="flex items-center justify-between text-sm text-slate-300"><span>Documentation</span><span>{feasibility?.documentation ?? 'N/A'} / 100</span></div>
                                                <div className="flex items-center justify-between text-sm text-slate-300"><span>Dataset Quality</span><span>{feasibility?.datasetQuality ?? 'N/A'} / 100</span></div>
                                                <div className="mt-4 rounded-3xl bg-white/5 p-4 text-sm text-slate-300">
                                                    <div className="font-semibold text-white text-lg">Overall {feasibility?.overall ?? 'N/A'} / 100</div>
                                                    <p className="mt-2 text-slate-400">{feasibility?.note}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-3xl bg-[#1c1917]/80 border border-white/10 p-6">
                                            <h3 className="text-xl font-semibold text-white mb-4">Recommended Hardware</h3>
                                            <div className="space-y-4 text-slate-300 text-sm">
                                                <div><span className="text-slate-400">GPU:</span> <span className="text-white">{hardware?.gpu || 'Estimated'}</span></div>
                                                <div><span className="text-slate-400">RAM:</span> <span className="text-white">{hardware?.ram || 'Estimated'}</span></div>
                                                <div><span className="text-slate-400">Storage:</span> <span className="text-white">{hardware?.storage || 'Estimated'}</span></div>
                                                <div><span className="text-slate-400">Difficulty:</span> <span className="text-white">{hardware?.difficulty || 'Estimated'}</span></div>
                                                <div><span className="text-slate-400">Cloud Alternative:</span> <span className="text-white">{hardware?.cloudAlternative || 'Estimated'}</span></div>
                                            </div>
                                        </div>
                                    </div>

                                    {activeDataset && (
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                                            <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-[#111010] border border-white/10 shadow-2xl">
                                                <div className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
                                                    <div>
                                                        <h3 className="text-xl font-semibold text-white">{activeDataset.title}</h3>
                                                        <p className="text-slate-400 text-sm">{activeDataset.subtitle || 'Information unavailable'}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => setActiveDataset(null)}
                                                        className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 transition"
                                                    >
                                                        Close
                                                    </button>
                                                </div>
                                                <div className="p-6 grid gap-4 lg:grid-cols-2">
                                                    <div className="space-y-3 text-slate-300 text-sm">
                                                        <div><span className="text-slate-400">Source:</span> Kaggle</div>
                                                        <div><span className="text-slate-400">Task:</span> {results.analysis?.task || 'Information unavailable'}</div>
                                                        <div><span className="text-slate-400">Data Type:</span> {results.analysis?.data_type || 'Information unavailable'}</div>
                                                        <div><span className="text-slate-400">Domain:</span> {results.analysis?.domain || 'Information unavailable'}</div>
                                                        <div><span className="text-slate-400">Classes:</span> Information unavailable</div>
                                                        <div><span className="text-slate-400">Dataset Size:</span> {formatBytes(activeDataset.datasetSize)}</div>
                                                        <div><span className="text-slate-400">License:</span> {activeDataset.license || 'Information unavailable'}</div>
                                                        <div><span className="text-slate-400">URL:</span> <a href={activeDataset.url} target="_blank" rel="noreferrer" className="text-amber-300 hover:text-amber-200">Open original dataset</a></div>
                                                    </div>
                                                    <div className="rounded-3xl bg-[#181616]/90 p-4 text-slate-300">
                                                        <h4 className="text-sm font-semibold text-white mb-3">Why we recommend it</h4>
                                                        <p className="text-sm leading-6">This dataset is ranked highly because it aligns with your project's task and data type, includes matching keywords, and has improved metadata signals for relevance.</p>
                                                        <div className="mt-5 space-y-3">
                                                            <div><span className="text-slate-400">Recommendation:</span> {activeDataset.relevanceScore ?? 0}% match</div>
                                                            <div><span className="text-slate-400">Suggested models:</span> {results.analysis?.models?.slice(0, 3).join(', ') || 'Information unavailable'}</div>
                                                        </div>
                                                        <div className="mt-6 flex flex-col gap-3">
                                                            <a
                                                                href={activeDataset.url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="rounded-2xl bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-3 text-sm font-semibold text-white text-center hover:brightness-110 transition"
                                                            >
                                                                Open Original Dataset
                                                            </a>
                                                            <button
                                                                onClick={() => setSelectedCompare((current) => current.includes(activeDataset.ref) ? current : [...current, activeDataset.ref].slice(0, 4))}
                                                                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 hover:border-white/20 transition"
                                                            >
                                                                Add to Comparison
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ) : null}
                </div>
            )}

            {showRegistrationPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-md overflow-hidden rounded-3xl bg-[#1c1917] border border-white/10 shadow-2xl p-8 text-center animate-in zoom-in-95 duration-300">
                        <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-tr from-rose-500/20 to-orange-400/20 flex items-center justify-center text-amber-500 mb-6">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-3">Free Limit Reached</h3>
                        <p className="text-slate-400 mb-8">
                            You've used your two free anonymous searches. Sign in or register an account to unlock unlimited access to AI Dataset Explorer.
                        </p>
                        <div className="flex flex-col gap-3">
                            <Link
                                href="/signup"
                                className="w-full rounded-2xl bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-3 text-sm font-semibold text-white hover:brightness-110 transition"
                            >
                                Create Free Account
                            </Link>
                            <Link
                                href="/login"
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 hover:border-white/20 transition"
                            >
                                Sign in
                            </Link>
                            <button
                                onClick={() => setShowRegistrationPrompt(false)}
                                className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
