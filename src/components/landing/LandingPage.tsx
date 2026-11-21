"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Cpu,
  Database,
  ShieldCheck,
  Sparkles,
  GitCompareArrows,
  Map,
  Layers,
  Terminal,
  FileCode2,
  CheckCircle2,
  Lock,
  Activity,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { useWorkspace, type ModalityPreference } from "@/context/WorkspaceContext";
import { useSearchSession } from "@/context/SearchSessionContext";
import { getRankedPopularDatasets, PopularDatasetItem } from "@/lib/algorithms/popularity";
import type { GpuVramCapacity } from "@/lib/workstation/vramEstimator";

const DOMAIN_PRESETS = [
  {
    id: "clinical-ner",
    title: "Clinical NER on Pathology Notes",
    tag: "NLP · Healthcare",
    vram: 24 as GpuVramCapacity,
    license: true,
    modality: "nlp" as ModalityPreference,
    query: "Clinical NER entity extraction on pathology notes BioBERT",
  },
  {
    id: "edge-defect",
    title: "Real-Time Edge Defect Detection",
    tag: "Vision · Edge",
    vram: 8 as GpuVramCapacity,
    license: true,
    modality: "vision" as ModalityPreference,
    query: "Real-time industrial surface defect detection edge YOLO",
  },
  {
    id: "legal-rag",
    title: "Multilingual Legal RAG",
    tag: "Multimodal · RAG",
    vram: 24 as GpuVramCapacity,
    license: true,
    modality: "nlp" as ModalityPreference,
    query: "Multilingual legal document retrieval augmented generation benchmark",
  },
];

const LIVE_SOURCES = [
  { name: "Hugging Face", tag: "Weights & Datasets", color: "text-amber-400", dot: "bg-amber-400" },
  { name: "Kaggle", tag: "Benchmarks", color: "text-sky-400", dot: "bg-sky-400" },
  { name: "arXiv", tag: "CS / Bio Preprints", color: "text-rose-400", dot: "bg-rose-400" },
  { name: "Semantic Scholar", tag: "Citation Graph", color: "text-cyan-400", dot: "bg-cyan-400" },
  { name: "OpenAlex", tag: "Open Corpus", color: "text-emerald-400", dot: "bg-emerald-400" },
  { name: "Crossref", tag: "DOI Metadata", color: "text-indigo-400", dot: "bg-indigo-400" },
  { name: "PubMed", tag: "NCBI Biomedical", color: "text-teal-400", dot: "bg-teal-400" },
];

export default function LandingPage() {
  const router = useRouter();
  const {
    gpuConstraintGb,
    setGpuConstraintGb,
    commercialOnly,
    setCommercialOnly,
    modalityPreference,
    setModalityPreference,
  } = useWorkspace();
  const { setQuery } = useSearchSession();

  const [promptInput, setPromptInput] = useState("");
  const [rankedDatasets, setRankedDatasets] = useState<PopularDatasetItem[]>([]);
  const [selectedPopularIdx, setSelectedPopularIdx] = useState(0);

  useEffect(() => {
    setRankedDatasets(getRankedPopularDatasets());
  }, []);

  const handleComposeSubmit = (e?: React.FormEvent, overrideQuery?: string) => {
    e?.preventDefault();
    const q = (overrideQuery ?? promptInput).trim();
    if (!q) {
      router.push("/explore");
      return;
    }
    setQuery(q);
    const params = new URLSearchParams();
    params.set("q", q);
    if (commercialOnly) params.set("license", "commercial");
    if (modalityPreference !== "all") params.set("modality", modalityPreference);
    router.push(`/explore?${params.toString()}`);
  };

  const activeShowcase = rankedDatasets[selectedPopularIdx] || rankedDatasets[0];

  return (
    <div className="min-h-screen flex flex-col bg-page text-primary relative overflow-x-clip">
      {/* Precision Atmospheric Grid & Glow */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-lab-grid opacity-70" />
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[900px] h-[460px] rounded-full bg-sky-500/10 blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[380px] rounded-full bg-emerald-500/5 blur-[130px]" />
      </div>

      <Navbar variant="landing" />

      {/* ── HERO SECTION & SMART PROMPT COMPOSER ──────────────────────────────── */}
      <section className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-16 space-y-12">
        <div className="grid lg:grid-cols-[1.12fr_0.88fr] gap-8 lg:gap-10 items-center">
          {/* Left Editorial Pitch + Smart Composer */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-subtle bg-card text-[11px] font-mono">
              <span className="w-2 h-2 rounded-full bg-status-emerald animate-pulse" />
              <span className="text-secondary">OBSIDIAN RESEARCH LAB</span>
              <span className="text-faint">·</span>
              <span className="text-accent-from font-semibold">7-SOURCE EVIDENCE PIPELINE</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-5xl lg:text-[54px] font-extrabold tracking-tight leading-[1.06] text-primary">
                Find the perfect dataset &amp;{" "}
                <span className="text-accent-gradient">ML blueprint</span> in seconds
              </h1>
              <p className="text-sm sm:text-base text-muted max-w-2xl leading-relaxed">
                Autonomous ML research workstation that decomposes your technical constraints, queries 7 live hubs, audits VRAM &amp; licensing risk, and compiles runnable PyTorch starter pipelines.
              </p>
            </div>

            {/* Smart Prompt Composer Box */}
            <form
              onSubmit={(e) => handleComposeSubmit(e)}
              className="rounded-2xl glass-card p-3.5 sm:p-4 space-y-3.5 border border-strong shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-subtle border border-accent/40 text-accent-from flex items-center justify-center shrink-0 mt-0.5">
                  <Terminal className="w-4 h-4" />
                </div>
                <textarea
                  rows={2}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleComposeSubmit();
                    }
                  }}
                  placeholder="Describe your ML problem, modality, or target architecture (e.g., 'Clinical NER on pathology notes within 24GB VRAM')..."
                  className="flex-1 bg-transparent text-sm text-primary placeholder:text-faint outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Live Constraint Chips Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-subtle">
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* GPU VRAM Constraint Selector */}
                  <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-page/70 border border-subtle">
                    <span className="px-1.5 text-[10px] font-mono text-faint flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-accent-from" />
                      VRAM
                    </span>
                    {([8, 16, 24, 80] as GpuVramCapacity[]).map((gb) => (
                      <button
                        key={gb}
                        type="button"
                        onClick={() => setGpuConstraintGb(gb)}
                        className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold tabular-nums transition-lab ${
                          gpuConstraintGb === gb
                            ? "bg-accent text-slate-950 font-bold"
                            : "text-muted hover:text-primary"
                        }`}
                      >
                        {gb === 80 ? "80G A100" : `${gb}G`}
                      </button>
                    ))}
                  </div>

                  {/* Commercial-Safe License Filter */}
                  <button
                    type="button"
                    onClick={() => setCommercialOnly(!commercialOnly)}
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono font-semibold flex items-center gap-1.5 transition-lab ${
                      commercialOnly
                        ? "status-badge-emerald"
                        : "bg-page/70 border-subtle text-muted hover:text-primary"
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>Commercial-Safe Only (MIT/Apache-2.0)</span>
                  </button>

                  {/* Modality Selector */}
                  <select
                    value={modalityPreference}
                    onChange={(e) => setModalityPreference(e.target.value as ModalityPreference)}
                    aria-label="Filter Modality"
                    className="px-2 py-1 rounded-lg bg-page/70 border border-subtle text-[10px] font-mono font-semibold text-secondary outline-none focus:border-accent"
                  >
                    <option value="all" className="bg-modal">All Modalities</option>
                    <option value="vision" className="bg-modal">Vision / 3D</option>
                    <option value="nlp" className="bg-modal">NLP / Text</option>
                    <option value="multimodal" className="bg-modal">Multimodal</option>
                    <option value="tabular" className="bg-modal">Tabular</option>
                    <option value="audio" className="bg-modal">Audio / Speech</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-accent text-slate-950 font-bold text-xs shadow-accent-sm hover:brightness-110 transition-lab flex items-center gap-1.5 ml-auto shrink-0"
                >
                  <span>Analyze &amp; Discover</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            {/* Domain Preset Templates */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-faint">
                <span className="uppercase tracking-wider">Domain Blueprint Presets</span>
                <span>Click to launch with pre-configured constraints</span>
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                {DOMAIN_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setGpuConstraintGb(preset.vram);
                      setCommercialOnly(preset.license);
                      setModalityPreference(preset.modality);
                      handleComposeSubmit(undefined, preset.query);
                    }}
                    className="p-2.5 rounded-xl obsidian-card-interactive text-left space-y-1 group"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-accent-from">
                      <span>{preset.tag}</span>
                      <span className="text-faint group-hover:text-primary">{preset.vram}GB →</span>
                    </div>
                    <div className="text-xs font-semibold text-primary line-clamp-1">
                      {preset.title}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Navigation CTAs (Preserves E2E Test Links) */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/explore"
                className="px-5 py-2.5 rounded-xl bg-accent text-slate-950 font-bold text-xs shadow-accent hover:brightness-110 transition-lab flex items-center gap-2"
              >
                <span>Start Exploring Studio</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/benchmark"
                className="px-4 py-2.5 rounded-xl border border-subtle bg-card hover:bg-card-hover text-xs font-semibold text-secondary hover:text-primary transition-lab flex items-center gap-2"
              >
                <GitCompareArrows className="w-3.5 h-3.5 text-accent-from" />
                <span>Benchmark Lab</span>
              </Link>
              <Link
                href="/roadmap"
                className="px-4 py-2.5 rounded-xl border border-subtle bg-card hover:bg-card-hover text-xs font-semibold text-secondary hover:text-primary transition-lab flex items-center gap-2"
              >
                <Map className="w-3.5 h-3.5 text-status-emerald" />
                <span>Pipeline Roadmap</span>
              </Link>
            </div>
          </div>

          {/* Right: Animated Multi-Source Ingestion Beam -> Verified ML Blueprint Graphic */}
          <div className="relative">
            <div className="rounded-2xl obsidian-card p-5 space-y-4 border border-strong shadow-2xl bg-card/90">
              {/* Top Window Header */}
              <div className="flex items-center justify-between border-b border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-accent-from" />
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
                    Live Ingestion Pipeline
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded status-badge-emerald border">
                  7 SOURCES → BLUEPRINT
                </span>
              </div>

              {/* Stage 1: Natural Language Prompt Node */}
              <div className="rounded-xl bg-page border border-subtle p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase text-faint">01 · Constraint Parser</div>
                  <div className="text-xs font-mono text-primary truncate">
                    {promptInput.trim() || activeShowcase?.query || "Detect brain tumor from MRI volumes (<=24GB VRAM)"}
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent-subtle text-accent-from shrink-0">
                  {gpuConstraintGb}GB · {commercialOnly ? "MIT/Apache" : "Any License"}
                </span>
              </div>

              {/* Animated Ingestion Beams connecting to 7 Live Sources */}
              <div className="relative py-1">
                <div className="relative h-1 w-full bg-subtle/40 rounded-full overflow-hidden mb-3">
                  <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-sky-400 to-transparent animate-beam" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {LIVE_SOURCES.map((src) => (
                    <div
                      key={src.name}
                      className="p-2 rounded-lg bg-page/80 border border-subtle flex items-center gap-1.5"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${src.dot} shrink-0`} />
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold text-primary truncate">{src.name}</div>
                        <div className="text-[9px] font-mono text-faint truncate">{src.tag}</div>
                      </div>
                    </div>
                  ))}
                  <div className="p-2 rounded-lg bg-accent-subtle border border-accent/30 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-accent-from shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-primary truncate">Reranker</div>
                      <div className="text-[9px] font-mono text-accent-from truncate">17-Stage</div>
                    </div>
                  </div>
                </div>

                <div className="relative h-1 w-full bg-subtle/40 rounded-full overflow-hidden mt-3">
                  <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-beam" />
                </div>
              </div>

              {/* Stage 3: Output Verified ML Blueprint Card */}
              {activeShowcase && (
                <div className="rounded-xl bg-page border border-emerald-500/25 p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-bold text-status-emerald flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      VERIFIED ML BLUEPRINT · RANK #{activeShowcase.rank || 1}
                    </span>
                    <span className="text-[10px] font-mono text-secondary tabular-nums">
                      Score {activeShowcase.popularityScore || 96}/100
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-primary truncate">{activeShowcase.title}</div>
                      <div className="text-[11px] text-muted line-clamp-1 mt-0.5">
                        {activeShowcase.description}
                      </div>
                    </div>
                    <Link
                      href={`/explore?q=${encodeURIComponent(activeShowcase.query)}`}
                      className="px-2.5 py-1 rounded-lg bg-card hover:bg-card-hover border border-subtle text-[11px] font-semibold text-accent-from shrink-0"
                    >
                      Inspect ↗
                    </Link>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-subtle font-mono text-[10px]">
                    <div>
                      <span className="text-faint block">MODALITY</span>
                      <span className="text-primary font-semibold truncate block">{activeShowcase.modality}</span>
                    </div>
                    <div>
                      <span className="text-faint block">VRAM FIT</span>
                      <span className="text-accent-from font-semibold">{activeShowcase.hardwareVram}</span>
                    </div>
                    <div>
                      <span className="text-faint block">TOP MODEL</span>
                      <span className="text-status-emerald font-semibold truncate block">
                        {activeShowcase.models[0]?.name}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Showcase Domain Switcher Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
                {rankedDatasets.slice(0, 4).map((ds, idx) => (
                  <button
                    key={ds.id}
                    type="button"
                    onClick={() => setSelectedPopularIdx(idx)}
                    className={`px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase transition-lab shrink-0 border ${
                      selectedPopularIdx === idx
                        ? "bg-accent-subtle border-accent/40 text-accent-from font-bold"
                        : "bg-page/60 border-subtle text-muted hover:text-primary"
                    }`}
                  >
                    {ds.domainCategory}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Explore Popular Project Searches Bar (Preserves E2E selector) */}
        <div className="rounded-xl obsidian-card p-3.5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted font-semibold">
            Quick explore popular project searches:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {rankedDatasets.slice(0, 4).map((ds) => (
              <Link
                key={ds.id}
                href={`/explore?q=${encodeURIComponent(ds.query)}`}
                className="px-3 py-1.5 rounded-lg bg-page hover:bg-card-hover border border-subtle hover:border-strong text-xs text-secondary hover:text-primary transition-lab flex items-center gap-1.5 font-medium"
              >
                <Database className="w-3 h-3 text-accent-from" />
                <span className="truncate max-w-[190px]">{ds.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── ARCHITECTURE CAPABILITIES BENTO ──────────────────────────────────── */}
      <section className="py-14 border-t border-subtle bg-rail/50 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-accent-from">
                Workstation Capabilities
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-primary">
                Engineered for ML Systems &amp; Research Teams
              </h2>
            </div>
            <p className="text-xs text-muted max-w-md">
              Every dataset recommendation, parameter count, and literature quote is verified against primary API responses with zero invented metrics.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Layers,
                title: "17-Stage Evidence-Verified Retrieval",
                desc: "Cross-encoder scoring combines anatomy, modality, dimensionality, and hard contradiction vetoes before surfacing candidates.",
                tag: "RETRIEVAL",
              },
              {
                icon: Cpu,
                title: "Interactive VRAM & Precision Profiler",
                desc: "Inspect Weights, Optimizer States, Gradients, and Activations across FP16, LoRA, and 4-bit QLoRA before renting cloud GPUs.",
                tag: "HARDWARE",
              },
              {
                icon: GitCompareArrows,
                title: "Pareto Model Comparison Matrix",
                desc: "Evaluate up to 4 pinned candidate checkpoints side-by-side across T4/A10G/A100 latency, VRAM footprint, and commercial licenses.",
                tag: "BENCHMARK",
              },
              {
                icon: FileCode2,
                title: "Reproducible Code & .zip Bundle Studio",
                desc: "Generate tailored train.py, dataset_loader.py, requirements.txt, FastAPI inference server, and Jupyter Notebooks.",
                tag: "EXECUTION",
              },
              {
                icon: Lock,
                title: "Commercial License & Claim Guard",
                desc: "Automatic detection of MIT/Apache-2.0 vs non-commercial academic terms alongside expandable anti-hallucination paper spans.",
                tag: "COMPLIANCE",
              },
              {
                icon: Sparkles,
                title: "Session-Aware Copilot Drawer (⌘I)",
                desc: "Always-on AI Research Assistant seeded with your active datasets, models, papers, and VRAM target for instant tuning configs.",
                tag: "COPILOT",
              },
            ].map((cap) => {
              const Icon = cap.icon;
              return (
                <div key={cap.title} className="rounded-2xl obsidian-card-interactive p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-9 h-9 rounded-xl bg-accent-subtle border border-accent/30 text-accent-from flex items-center justify-center">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-mono text-faint tracking-wider">{cap.tag}</span>
                  </div>
                  <h3 className="text-sm font-bold text-primary">{cap.title}</h3>
                  <p className="text-xs text-muted leading-relaxed">{cap.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
