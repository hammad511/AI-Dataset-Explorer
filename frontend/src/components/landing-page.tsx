"use client";

import Link from "next/link";
import { useState } from "react";

export default function LandingPage() {
    const [isDark, setIsDark] = useState(false);

    const toggleTheme = () => setIsDark(!isDark);

    return (
        <div className={`min-h-screen font-sans selection:bg-green-500/30 overflow-hidden relative transition-colors duration-500 ${isDark ? 'bg-[#060b14] text-white' : 'bg-[#e8f5e9] text-[#1b5e20]'}`}>
            {/* Background radial glow */}
            {isDark && (
                <>
                    <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 h-[800px] w-[800px] rounded-full bg-gradient-to-br from-indigo-500/10 to-violet-500/20 blur-3xl opacity-50 pointer-events-none" />
                    <div className="absolute top-40 left-0 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />
                </>
            )}
            {!isDark && (
                <>
                    <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 h-[800px] w-[800px] rounded-full bg-gradient-to-br from-green-300/20 to-emerald-400/20 blur-3xl opacity-60 pointer-events-none" />
                    <div className="absolute top-40 left-0 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-green-500/10 blur-3xl pointer-events-none" />
                </>
            )}

            {/* Navbar */}
            <nav className={`relative z-50 flex items-center justify-between px-6 py-6 max-w-[1400px] mx-auto lg:px-12 transition-colors duration-500`}>
                <Link href="/" className="flex items-center gap-3 text-lg font-bold tracking-tight hover:opacity-90 transition">
                    <div className="grid h-9 w-9 place-items-center rounded-[12px] bg-gradient-to-br from-green-500 to-emerald-600 shadow-[0_0_20px_rgba(34,197,94,0.5)]">
                        <svg className={`w-5 h-5 ${isDark ? 'text-white' : 'text-white'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    AI Dataset Explorer
                </Link>

                {/* Desktop Links */}
                <div className={`hidden md:flex items-center gap-8 text-sm font-medium ${isDark ? 'text-slate-300' : 'text-[#2e7d32]'}`}>
                    <Link href="/" className="text-green-600 border-b-2 border-green-600 pb-1">Home</Link>
                    <Link href="/login?callbackUrl=%2Fexplore" className="hover:text-green-600 transition">Explore Datasets</Link>
                    <Link href="/#ai-search" className="hover:text-green-600 transition">AI Search</Link>
                    <Link href="/#roadmaps" className="hover:text-green-600 transition">Roadmaps</Link>
                    <Link href="/#about" className="hover:text-green-600 transition">About</Link>
                </div>

                {/* Auth Buttons */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleTheme}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border ${isDark ? 'border-slate-700 text-slate-300 hover:bg-white/10' : 'border-green-300 text-green-700 hover:bg-green-100'}`}
                        title="Toggle theme"
                    >
                        {isDark ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                        )}
                    </button>
                    <div className={`h-4 w-px hidden sm:block ${isDark ? 'bg-slate-700' : 'bg-green-300'}`}></div>
                    <Link href="/login" className={`hidden sm:inline-flex px-5 py-2.5 text-sm font-medium rounded-full border transition ${isDark ? 'text-slate-300 border-slate-700 hover:bg-white/5' : 'text-green-800 border-green-400 hover:bg-green-100'}`}>Sign In</Link>
                    <Link href="/signup" className="px-5 py-2.5 text-sm font-medium text-white rounded-full bg-green-600 hover:bg-green-500 transition shadow-[0_0_15px_rgba(34,197,94,0.3)]">Sign Up</Link>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12 pt-16 pb-24 lg:pt-24 lg:pb-32 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
                {/* Left: Text Content */}
                <div>
                    <h1 className="text-5xl lg:text-[68px] font-bold tracking-tight leading-[1.1]">
                        Find the perfect<br />dataset for your<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-500 to-emerald-600 flex items-center gap-4 mt-2">
                            AI project
                            <svg className="w-10 h-10 text-emerald-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0L12.7 6.3L19 7L12.7 7.7L12 14L11.3 7.7L5 7L11.3 6.3L12 0Z" />
                            </svg>
                        </span>
                    </h1>
                    <p className={`mt-6 text-lg max-w-[500px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-[#388e3c]'}`}>
                        AI-powered recommendations, research papers, models, and project roadmaps — all in one place.
                    </p>

                    <ul className="mt-8 space-y-4">
                        {[
                            "Smart dataset recommendations using RAG",
                            "Research papers, models & GitHub projects",
                            "Project roadmap & implementation guide"
                        ].map(item => (
                            <li key={item} className={`flex items-center gap-3 font-medium ${isDark ? 'text-slate-300' : 'text-[#2e7d32]'}`}>
                                <div className="grid h-5 w-5 place-items-center rounded-full bg-green-600 text-white text-[10px] font-bold">✓</div>
                                {item}
                            </li>
                        ))}
                    </ul>

                    <div className="mt-10 flex flex-wrap items-center gap-4">
                        <Link href="/login" className="px-6 py-3.5 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl text-sm transition shadow-[0_10px_20px_rgba(34,197,94,0.3)] flex items-center gap-2">
                            Start Exploring Now <span className="text-lg leading-none">→</span>
                        </Link>
                        <a href="#how-it-works" className={`px-6 py-3.5 border font-medium rounded-xl text-sm transition flex items-center gap-2 ${isDark ? 'border-slate-700 text-white hover:bg-white/5' : 'border-green-400 text-green-800 hover:bg-green-100'}`}>
                            How It Works
                            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        </a>
                    </div>

                </div>

                {/* Right: Mockup Graphic */}
                <div className="relative mt-10 lg:mt-0 lg:ml-auto w-full max-w-[580px] mx-auto select-none pointer-events-none hidden md:block">
                    <div className="absolute inset-0 bg-green-500/20 blur-[100px] rounded-full"></div>

                    <div
                        className="relative w-full rounded-3xl border-2 border-green-700/30 bg-[#0d2718]/90 p-6 shadow-2xl backdrop-blur-xl shrink-0"
                        style={{ transform: 'perspective(1200px) rotateY(-15deg) rotateX(10deg) rotateZ(3deg) scale(1.05)' }}
                    >
                        <div className="flex items-center bg-[#0a1f10] rounded-xl px-4 py-3.5 border border-white/5 mb-6 shadow-inner">
                            <svg className="w-5 h-5 text-green-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            <div className="text-green-200 text-sm flex-1">I want to detect brain tumor from MRI images</div>
                            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>

                        <div className="text-xs text-green-400 mb-3 ml-1 font-medium">Top Recommendation</div>
                        <div className="bg-[#0a1f10] rounded-2xl border border-white/5 p-4 mb-4 flex gap-4 shadow-sm">
                            <div className="w-32 h-32 rounded-lg bg-green-900 shrink-0 overflow-hidden flex flex-wrap">
                                <div className="w-1/2 h-1/2 border border-[#0a1f10] bg-green-700 relative overflow-hidden"><div className="absolute inset-2 rounded-full border border-green-300 opacity-50"></div></div>
                                <div className="w-1/2 h-1/2 border border-[#0a1f10] bg-emerald-700 relative overflow-hidden"><div className="absolute inset-2 rounded-[40%] border border-green-300 opacity-50"></div></div>
                                <div className="w-1/2 h-1/2 border border-[#0a1f10] bg-emerald-700 relative overflow-hidden"><div className="absolute inset-2 rounded-[40%] border border-green-300 opacity-50"></div></div>
                                <div className="w-1/2 h-1/2 border border-[#0a1f10] bg-green-700 relative overflow-hidden"><div className="absolute inset-2 rounded-full border border-green-300 opacity-50"></div></div>
                            </div>
                            <div className="flex-1 flex flex-col justify-center">
                                <div className="flex items-center gap-2 mb-2">
                                    <h4 className="text-white font-bold text-lg">BraTS 2023 Dataset</h4>
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">Best Match</span>
                                </div>
                                <p className="text-sm text-green-300 leading-relaxed mb-4">Multimodal MRI brain tumor dataset with segmentation masks and clinical data.</p>
                                <div className="flex flex-wrap gap-2">
                                    <span className="px-3 py-1 rounded bg-[#0d2718] text-xs font-medium text-green-200 items-center flex gap-1"><span className="text-cyan-400">🖼️</span> Images</span>
                                    <span className="px-3 py-1 rounded bg-[#0d2718] text-xs font-medium text-green-200 items-center flex gap-1"><span className="text-rose-400">⚕️</span> Medical</span>
                                    <span className="px-3 py-1 rounded bg-[#0d2718] text-xs font-medium text-green-200">Intermediate</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-[#0a1f10] rounded-2xl p-4 border border-white/5">
                                <div className="text-xs text-green-400 mb-3 font-medium">Recommended Models</div>
                                <div className="space-y-2">
                                    <div className="px-2.5 py-1.5 bg-[#0d2718] rounded-md text-xs font-medium text-green-200 flex items-center justify-between">ResNet50 <span className="text-green-400">92%</span></div>
                                    <div className="px-2.5 py-1.5 bg-[#0d2718] rounded-md text-xs font-medium text-green-200 flex items-center justify-between">EfficientNet-B0 <span className="text-green-400">94%</span></div>
                                    <div className="px-2.5 py-1.5 bg-[#0d2718] rounded-md text-xs font-medium text-green-200 flex items-center justify-between">DenseNet121 <span className="text-green-400">91%</span></div>
                                </div>
                                <div className="mt-4 text-xs font-medium text-green-400">View all →</div>
                            </div>
                            <div className="bg-[#0a1f10] rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center text-center">
                                <div className="text-xs text-green-400 mb-3 font-medium">Research Papers</div>
                                <div className="h-12 flex items-end justify-center gap-1.5 mb-2 w-full">
                                    <div className="w-3 bg-green-700 rounded-t h-4" />
                                    <div className="w-3 bg-green-600 rounded-t h-8" />
                                    <div className="w-3 bg-green-500 rounded-t h-12" />
                                    <div className="w-3 bg-emerald-400 rounded-t h-7" />
                                </div>
                                <div className="text-sm font-semibold text-white">12 Papers Found</div>
                                <div className="mt-2 text-xs font-medium text-green-400">View all →</div>
                            </div>
                            <div className="bg-[#0a1f10] rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center text-center">
                                <div className="text-xs text-green-400 mb-3 font-medium">Project Roadmap</div>
                                <svg className="w-12 h-12 text-emerald-400 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 01-2-2V5M19 19v-6a2 2 0 00-2-2h-2m-4-6a2 2 0 012-2h2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2zm-6 2H9a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2z" /></svg>
                                <div className="text-sm font-semibold text-white">8 Steps</div>
                                <div className="mt-2 text-xs font-medium text-green-400">View roadmap →</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Quick info about navbar buttons */}
            <div className={`relative z-10 max-w-[1200px] mx-auto px-6 lg:px-12 mt-8`}>
                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                        { title: 'Home', text: 'Return to the main dashboard and featured recommendations.' },
                        { title: 'Explore Datasets', text: 'Browse curated datasets filtered by domain, size and license.' },
                        { title: 'AI Search', text: 'Natural-language search across datasets, papers and models.' },
                        { title: 'Roadmaps', text: 'Step-by-step project roadmaps and implementation guides.' },
                        { title: 'About', text: 'Learn about the project, data sources, and team.' },
                    ].map((item) => (
                        <div key={item.title} className={`rounded-xl p-4 shadow-sm ${isDark ? 'bg-[#071123] border border-slate-800' : 'bg-[#c8e6c9] border border-green-300'}`}>
                            <div className={`text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-[#1b5e20]'}`}>{item.title}</div>
                            <div className={`text-xs ${isDark ? 'text-slate-300' : 'text-[#2e7d32]'}`}>{item.text}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom Section */}
            <section id="how-it-works" className={`rounded-t-[48px] relative z-20 py-24 px-6 lg:px-12 transition-colors duration-500 ${isDark ? 'bg-[#060b14] text-white' : 'bg-[#d0f0c0] text-[#1b5e20]'}`}>
                <div className="max-w-[1280px] mx-auto">
                    {/* Section 1: How it Works */}
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <span className={`${isDark ? 'text-green-300 bg-green-900/30' : 'text-green-700 bg-green-200'} px-3 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase mb-4 inline-block`}>How It Works</span>
                        <h2 className={`text-3xl lg:text-[40px] font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#1b5e20]'}`}>Your AI project journey in <span className={`${isDark ? 'text-green-300' : 'text-green-600'}`}>4 simple steps</span></h2>
                    </div>

                    <div className="grid md:grid-cols-4 gap-8 relative">
                        <div className={`hidden md:block absolute top-[52px] left-[15%] right-[15%] h-px border-t-2 border-dashed z-0 ${isDark ? 'bg-slate-700 border-slate-700' : 'bg-green-300 border-green-300'}`} />

                        {[
                            { step: 1, title: 'Describe Your Project', text: 'Tell us what you want to build in natural language.', icon: '🔍', color: 'text-purple-600 bg-purple-50 border-purple-100' },
                            { step: 2, title: 'AI Searches & Analyzes', text: 'Our AI searches across multiple sources using RAG.', icon: '🗄️', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
                            { step: 3, title: 'Get Smart Recommendations', text: 'Receive the best datasets, models, papers and tools.', icon: '💡', color: 'text-blue-600 bg-blue-50 border-blue-100' },
                            { step: 4, title: 'Follow the Roadmap', text: 'Get a step-by-step roadmap to build your project.', icon: '🗺️', color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
                        ].map(s => (
                            <div key={s.step} className={`rounded-3xl p-6 text-center shadow-[0_4px_30px_rgba(0,0,0,0.04)] relative z-10 transition-transform hover:-translate-y-2 border ${isDark ? 'bg-[#071123] border-slate-800' : 'bg-[#f1f8e9] border-green-200'}`}>
                                <div className={`${s.color} border w-24 h-24 mx-auto rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-sm`}>
                                    {s.icon}
                                </div>
                                <h3 className={`font-bold text-lg mb-2 ${isDark ? 'text-white' : 'text-[#1b5e20]'}`}>{s.step}. {s.title}</h3>
                                <p className={`text-sm leading-relaxed font-medium px-2 ${isDark ? 'text-slate-300' : 'text-[#388e3c]'}`}>{s.text}</p>
                            </div>
                        ))}
                    </div>

                    {/* AI Search Section */}
                    <section id="ai-search" className={`mt-20 relative overflow-hidden rounded-[32px] p-8 sm:p-10 ${isDark ? 'bg-[#07111f] border border-white/8' : 'bg-[#f1f8e9] border border-green-200'}`}>
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(0,0,0,0.04)_1px,transparent_1px)] [background-size:24px_24px]" />
                        <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center">

                            {/* LEFT */}
                            <div>
                                <div className="flex items-center gap-4">
                                    <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl shadow-lg ${isDark ? 'bg-gradient-to-br from-indigo-500 to-violet-600' : 'bg-gradient-to-br from-indigo-400 to-violet-500'}`}>🔍</div>
                                    <div>
                                        <p className={`text-xs font-semibold uppercase tracking-widest ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>AI POWERED</p>
                                        <h2 className={`mt-0.5 text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#1b5e20]'}`}>AI Search</h2>
                                    </div>
                                </div>
                                <p className={`mt-4 max-w-sm text-[15px] leading-relaxed font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    Describe your goal in natural language and our AI finds the best datasets, models, and papers that match.
                                </p>
                                <div className={`mt-6 flex flex-wrap gap-6 text-[13px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    <div className="flex items-start gap-2"><span>🔍</span><span>RAG-powered search across<br />multiple trusted sources</span></div>
                                    <div className="flex items-start gap-2"><span>🏆</span><span>Results ranked by<br />relevance and quality</span></div>
                                    <div className="flex items-start gap-2"><span>⚡</span><span>Smart insights to help you<br />decide faster</span></div>
                                </div>
                            </div>

                            {/* RIGHT — search preview card */}
                            <div className="relative">
                                <div className={`pointer-events-none absolute -top-6 -left-6 h-48 w-48 rounded-full border ${isDark ? 'border-indigo-400/10' : 'border-indigo-300/30'}`} />
                                <div className={`pointer-events-none absolute -bottom-6 -right-6 h-64 w-64 rounded-full border ${isDark ? 'border-indigo-400/10' : 'border-indigo-300/30'}`} />
                                {/* floating badges */}
                                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 grid h-9 w-9 place-items-center rounded-full text-sm font-bold shadow-lg border ${isDark ? 'bg-[#1a1a2e] border-white/10 text-white' : 'bg-white border-green-200 text-green-800'}`}>K</div>
                                <div className={`absolute top-1/2 -right-4 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full text-base shadow-lg border ${isDark ? 'bg-[#1a1a2e] border-white/10' : 'bg-white border-green-200'}`}>🗄</div>
                                <div className={`absolute -bottom-3 left-1/2 -translate-x-1/2 grid h-9 w-9 place-items-center rounded-full text-xs font-bold shadow-lg border ${isDark ? 'bg-[#1a1a2e] border-white/10 text-white' : 'bg-white border-green-200 text-green-800'}`}>GH</div>
                                <div className="absolute top-1/2 -left-4 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-[#c0392b] text-[9px] font-bold text-white shadow-lg">arXiv</div>
                                <div className="absolute -top-2 left-6 grid h-8 w-8 place-items-center rounded-full bg-yellow-400 text-base shadow-lg">😀</div>
                                {/* card */}
                                <div className={`mx-auto max-w-xs rounded-2xl p-5 shadow-xl border ${isDark ? 'bg-[#0c1728] border-white/10' : 'bg-white border-green-200'}`}>
                                    <div className="mb-4 flex gap-1.5">
                                        <div className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                                        <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                                        <div className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
                                    </div>
                                    <p className={`mb-3 text-center text-base font-semibold ${isDark ? 'text-white' : 'text-[#1b5e20]'}`}>What are you looking for?</p>
                                    <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border ${isDark ? 'border-white/10 bg-white/[0.05]' : 'border-green-200 bg-green-50'}`}>
                                        <span className={`flex-1 text-xs ${isDark ? 'text-slate-500' : 'text-green-400'}`}>E.g., &ldquo;Breast cancer detection datasets&rdquo;</span>
                                        <div className="grid h-6 w-6 place-items-center rounded-lg bg-indigo-500 text-white text-xs">→</div>
                                    </div>
                                    <div className="mt-3 flex gap-2">
                                        <span className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border ${isDark ? 'border-white/10 bg-white/[0.04] text-slate-300' : 'border-green-200 bg-green-50 text-green-800'}`}>🗄 Datasets</span>
                                        <span className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border ${isDark ? 'border-white/10 bg-white/[0.04] text-slate-300' : 'border-green-200 bg-green-50 text-green-800'}`}>⚙ Models</span>
                                        <span className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border ${isDark ? 'border-white/10 bg-white/[0.04] text-slate-300' : 'border-green-200 bg-green-50 text-green-800'}`}>📄 Papers</span>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </section>

                    {/* Roadmaps Section */}
                    <section id="roadmaps" className={`mt-12 relative overflow-hidden rounded-[32px] p-8 sm:p-10 ${isDark ? 'bg-[#0d0d1a] border border-white/8' : 'bg-[#f1f8e9] border border-green-200'}`}>
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(0,0,0,0.04)_1px,transparent_1px)] [background-size:24px_24px]" />
                        <div className="relative grid gap-10 lg:grid-cols-2 lg:items-start">

                            {/* LEFT */}
                            <div>
                                <div className="flex items-center gap-4">
                                    <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl shadow-lg ${isDark ? 'bg-gradient-to-br from-violet-600 to-purple-700' : 'bg-gradient-to-br from-violet-500 to-purple-600'}`}>🗺</div>
                                    <div>
                                        <p className={`text-xs font-semibold uppercase tracking-widest ${isDark ? 'text-violet-400' : 'text-violet-600'}`}>PROJECT GUIDANCE</p>
                                        <h2 className={`mt-0.5 text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#1b5e20]'}`}>Roadmaps</h2>
                                    </div>
                                </div>
                                <p className={`mt-4 max-w-sm text-[15px] leading-relaxed font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    Get step-by-step guidance from data collection to model deployment. We break your project into clear, actionable tasks with recommended tools and timelines.
                                </p>
                                <div className={`mt-6 flex flex-wrap gap-6 text-[13px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    <div className="flex items-start gap-2"><span>≡</span><span>Structured steps from<br />start to finish</span></div>
                                    <div className="flex items-start gap-2"><span>✂</span><span>Suggested tools &amp;<br />resources</span></div>
                                    <div className="flex items-start gap-2"><span>🕐</span><span>Estimated timelines for<br />better planning</span></div>
                                </div>
                            </div>

                            {/* RIGHT — step flow */}
                            <div className="relative space-y-3">
                                {([
                                    { n: 1, title: 'Data Collection', sub: 'Find and gather relevant datasets', icon: '📄' },
                                    { n: 2, title: 'Data Preparation', sub: 'Clean, preprocess and analyze data', icon: '🗄' },
                                    { n: 3, title: 'Model Building', sub: 'Train and evaluate your model', icon: '📦' },
                                    { n: 4, title: 'Deployment', sub: 'Deploy, monitor and iterate', icon: '🚀' },
                                ] as const).map((item, idx, arr) => (
                                    <div key={item.n} className="relative flex items-center gap-3">
                                        {idx < arr.length - 1 && (
                                            <div className={`absolute left-[18px] top-10 h-[calc(100%+4px)] w-px border-l-2 border-dashed ${isDark ? 'border-violet-500/40' : 'border-violet-400/50'}`} />
                                        )}
                                        <div className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white shadow-lg ${isDark ? 'bg-violet-600' : 'bg-violet-500'}`}>
                                            {item.n}
                                        </div>
                                        <div className={`flex flex-1 items-center justify-between rounded-2xl px-4 py-3 border ${isDark ? 'border-white/8 bg-white/[0.04]' : 'border-green-200 bg-white'}`}>
                                            <div>
                                                <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-[#1b5e20]'}`}>{item.title}</p>
                                                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-[#388e3c]'}`}>{item.sub}</p>
                                            </div>
                                            <span className="text-base">{item.icon}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                        </div>
                    </section>

                    {/* Trusted Sources */}
                    <div className={`mt-32 text-center max-w-4xl mx-auto border-t border-b py-16 ${isDark ? 'border-slate-800' : 'border-green-300'}`}>
                        <h3 className={`text-lg font-bold mb-10 ${isDark ? 'text-white' : 'text-[#1b5e20]'}`}>Data from trusted sources</h3>
                        <div className="flex flex-wrap justify-center items-center gap-6 lg:gap-12 opacity-95">
                            <div className={`flex items-center gap-2 font-bold text-xl px-5 py-2.5 rounded-xl border shadow-sm ${isDark ? 'text-slate-100 bg-slate-800 border-slate-700' : 'text-[#1b5e20] bg-[#c8e6c9] border-green-300'}`}><span className="text-blue-400">k</span> Kaggle</div>
                            <div className={`flex items-center gap-2 font-bold text-xl px-5 py-2.5 rounded-xl border shadow-sm ${isDark ? 'text-slate-100 bg-slate-800 border-slate-700' : 'text-[#1b5e20] bg-[#c8e6c9] border-green-300'}`}><span className="text-yellow-500">🤗</span> Hugging Face</div>
                            <div className={`flex items-center gap-2 font-bold text-xl px-5 py-2.5 rounded-xl border shadow-sm ${isDark ? 'text-slate-100 bg-slate-800 border-slate-700' : 'text-[#1b5e20] bg-[#c8e6c9] border-green-300'}`}><span className="text-rose-400">a</span> arXiv</div>
                            <div className={`flex items-center gap-2 font-bold text-lg px-5 py-2.5 rounded-xl border shadow-sm ${isDark ? 'text-slate-100 bg-slate-800 border-slate-700' : 'text-[#1b5e20] bg-[#c8e6c9] border-green-300'}`}><span className="text-emerald-500">|▪|</span> Papers With Code</div>
                            <div className={`flex items-center gap-2 font-bold text-lg px-5 py-2.5 rounded-xl border shadow-sm ${isDark ? 'text-slate-100 bg-slate-800 border-slate-700' : 'text-[#1b5e20] bg-[#c8e6c9] border-green-300'}`}><span className={`${isDark ? 'text-white' : 'text-green-800'} font-serif font-black`}>UCI</span> Machine Learning</div>
                            <div className={`flex items-center gap-2 font-bold text-xl px-5 py-2.5 rounded-xl border shadow-sm ${isDark ? 'text-slate-100 bg-slate-800 border-slate-700' : 'text-[#1b5e20] bg-[#c8e6c9] border-green-300'}`}><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg> GitHub</div>
                            <div className={`${isDark ? 'text-slate-300' : 'text-[#388e3c] font-bold'} text-sm`}>&amp; more</div>
                        </div>
                    </div>

                    {/* Powerful Features */}
                    <div className="mt-28 text-center max-w-2xl mx-auto mb-16">
                        <span className={`${isDark ? 'text-blue-300 bg-blue-900/20' : 'text-green-700 bg-green-200'} px-3 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase mb-4 inline-block`}>Powerful Features</span>
                        <h2 className={`text-3xl lg:text-[40px] font-bold tracking-tight leading-tight ${isDark ? 'text-white' : 'text-[#1b5e20]'}`}>Everything you need to build amazing AI projects</h2>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                        {[
                            { title: 'AI-Powered Search', text: 'Natural language search understands your project and finds the perfect resources.', icon: '🔍', color: 'bg-purple-100 text-purple-600 text-3xl' },
                            { title: 'Smart Recommendations', text: 'Get the best datasets, models, and papers ranked by relevance and quality.', icon: '⭐', color: 'bg-emerald-100 text-emerald-600 text-3xl' },
                            { title: 'Research Papers', text: 'Discover relevant research papers with summaries and direct links.', icon: '📄', color: 'bg-blue-100 text-blue-600 text-3xl' },
                            { title: 'Model Suggestions', text: 'Find the right AI models with expected accuracy and performance insights.', icon: '⚙️', color: 'bg-orange-100 text-orange-500 text-3xl' },
                            { title: 'Project Roadmaps', text: 'Step-by-step roadmap with tasks, tools, and time estimates.', icon: '🛣️', color: 'bg-violet-100 text-violet-600 text-3xl' },
                            { title: 'GitHub Projects', text: 'Explore similar open-source projects for reference and inspiration.', icon: '💻', color: 'bg-green-100 text-green-700 text-3xl' }
                        ].map(f => (
                            <div key={f.title} className={`rounded-[24px] p-8 mt-2 border shadow-[0_2px_15px_rgba(0,0,0,0.03)] hover:shadow-[0_15px_40px_rgba(0,0,0,0.06)] transition-all flex flex-row gap-5 text-left ${isDark ? 'bg-[#071123] border-slate-800' : 'bg-[#f1f8e9] border-green-200'}`}>
                                <div className={`${f.color} w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center shadow-sm`}>{f.icon}</div>
                                <div>
                                    <h3 className={`font-bold text-lg mb-2 ${isDark ? 'text-white' : 'text-[#1b5e20]'}`}>{f.title}</h3>
                                    <p className={`text-sm leading-relaxed font-medium ${isDark ? 'text-slate-300' : 'text-[#388e3c]'}`}>{f.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* About Section */}
                    <section id="about" className={`mt-24 relative overflow-hidden rounded-[32px] p-10 md:p-14 ${isDark ? 'bg-gradient-to-br from-[#0c1728] to-[#071123] border border-slate-800' : 'bg-gradient-to-br from-[#f1f8e9] to-[#e8f5e9] border border-green-200 shadow-sm'}`}>
                        <div className={`absolute top-0 right-0 -translate-y-1/2 translate-x-1/3 w-64 h-64 rounded-full blur-3xl opacity-50 ${isDark ? 'bg-indigo-500/20' : 'bg-green-400/30'}`} />
                        <div className="grid md:grid-cols-[1fr_2fr] gap-12 relative z-10">
                            <div>
                                <span className={`${isDark ? 'text-indigo-400 bg-indigo-900/40' : 'text-emerald-700 bg-emerald-200/50'} px-3 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase mb-4 inline-block`}>Behind The Scenes</span>
                                <h2 className={`text-3xl lg:text-4xl font-bold tracking-tight mt-2 ${isDark ? 'text-white' : 'text-[#1b5e20]'}`}>About This Project</h2>
                            </div>
                            <div className="flex flex-col gap-6 justify-center">
                                <p className={`text-base leading-relaxed ${isDark ? 'text-slate-300' : 'text-emerald-800'}`}>
                                    AI Dataset Explorer is a highly curated platform built to help modern builders find critical datasets, optimal models, relevant research papers, and clear project roadmaps quickly.
                                </p>
                                <div className={`h-px w-full ${isDark ? 'bg-slate-700/50' : 'bg-emerald-200/50'}`}></div>
                                <div className="flex flex-col sm:flex-row gap-6 sm:items-center justify-between">
                                    <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-emerald-700'}`}>
                                        Created by <span className="font-semibold text-[15px]">Hammad Ali Tariq</span> to streamline AI development workflows. Make dataset discovery simple, beautiful, and accessible.
                                    </p>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`px-3 py-1 text-xs font-semibold rounded-lg ${isDark ? 'bg-white/10 text-white' : 'bg-white text-emerald-800 border-2 border-emerald-100 shadow-sm'}`}>Next.js</span>
                                        <span className={`px-3 py-1 text-xs font-semibold rounded-lg ${isDark ? 'bg-white/10 text-white' : 'bg-white text-emerald-800 border-2 border-emerald-100 shadow-sm'}`}>Tailwind CSS</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Bottom CTA Banner */}
                    <div className="mt-12 w-full max-w-5xl mx-auto rounded-[32px] bg-gradient-to-r from-green-700 via-emerald-600 to-green-600 p-10 lg:p-14 relative overflow-hidden flex flex-col md:flex-row items-center justify-between text-white shadow-2xl">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-green-400/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3" />

                        <div className="relative z-10 flex items-center gap-8 mb-8 md:mb-0">
                            <div className="hidden lg:block w-32 h-32 shrink-0 rotate-[-10deg]">
                                <div className="w-full h-full bg-white/20 backdrop-blur-md rounded-3xl border border-white/30 px-4 py-6 shadow-xl flex flex-col gap-3">
                                    <div className="w-10 h-10 bg-white/90 rounded-xl mb-1 shadow-sm flex items-center justify-center">
                                        <span className="text-xl">🌿</span>
                                    </div>
                                    <div className="w-3/4 h-3 bg-white/40 rounded-full"></div>
                                    <div className="w-1/2 h-2 bg-white/30 rounded-full mt-auto"></div>
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl lg:text-[34px] font-bold mb-4 tracking-tight leading-tight">Ready to find the<br />perfect dataset?</h2>
                                <p className="text-green-100 font-medium text-lg">Join thousands of AI builders and accelerate your project journey.</p>
                            </div>
                        </div>

                        <Link href="/signup" className="relative z-10 whitespace-nowrap px-8 py-4 bg-white text-green-700 hover:bg-green-50 font-bold rounded-2xl flex items-center gap-2 transition hover:scale-105 shadow-[0_15px_30px_rgba(0,0,0,0.15)] text-[15px]">
                            Get Started for Free <span className="text-xl leading-none">→</span>
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
