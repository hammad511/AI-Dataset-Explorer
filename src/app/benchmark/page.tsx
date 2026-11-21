"use client";

import React, { useState, useMemo, Suspense } from "react";
import Link from "next/link";
import {
  Crown,
  Pin,
  PinOff,
  Sparkles,
  Cpu,
  Database,
  BookOpen,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Trash2,
  Wand2,
  ExternalLink,
  BarChart3,
  Clock,
  DollarSign,
} from "lucide-react";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import StitchEmptyState from "@/components/common/StitchEmptyState";
import { useSearchSession } from "@/context/SearchSessionContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { estimateModelVram, parseParameterBillions } from "@/lib/workstation/vramEstimator";
import { isCommercialSafeLicense } from "@/components/cards/DatasetCard";

type BenchmarkTab = "models" | "datasets" | "papers";

function BenchmarkMatrixContent() {
  const {
    query,
    searchResult,
    pinnedAssets,
    togglePinAsset,
    clearPinnedAssets,
  } = useSearchSession();
  const { gpuConstraintGb, setGpuConstraintGb, askAssistant } = useWorkspace();

  const [activeTab, setActiveTab] = useState<BenchmarkTab>("models");
  const [hoveredPlotId, setHoveredPlotId] = useState<string | null>(null);

  const rawModels = searchResult?.models || [];
  const rawDatasets = searchResult?.datasets || [];
  const rawPapers = searchResult?.papers || [];

  // Pinned models vs fallback to top 4 retrieved models
  const pinnedModelAssets = pinnedAssets.filter((a) => a.type === "model");
  const pinnedDatasetAssets = pinnedAssets.filter((a) => a.type === "dataset");

  const comparedModels = useMemo(() => {
    if (pinnedModelAssets.length > 0) {
      return pinnedModelAssets.slice(0, 4).map((p) => ({
        ...(p.data || {}),
        id: p.id,
        name: p.title,
        url: p.url || p.data?.url,
        matchScore: p.score ?? p.data?.matchScore ?? 75,
        isPinned: true,
      }));
    }
    return rawModels.slice(0, 4).map((m: any) => ({
      ...m,
      isPinned: false,
    }));
  }, [pinnedModelAssets, rawModels]);

  const comparedDatasets = useMemo(() => {
    if (pinnedDatasetAssets.length > 0) {
      return pinnedDatasetAssets.slice(0, 4).map((p) => ({
        ...(p.data || {}),
        id: p.id,
        title: p.title,
        url: p.url || p.data?.url,
        matchScore: p.score ?? p.data?.matchScore ?? 75,
        isPinned: true,
      }));
    }
    return rawDatasets.slice(0, 4);
  }, [pinnedDatasetAssets, rawDatasets]);

  // Identify Recommended Pick (highest match score fitting GPU or highest score overall)
  const recommendedModelId = useMemo(() => {
    if (comparedModels.length === 0) return null;
    const sorted = [...comparedModels].sort((a, b) => {
      const aVram = estimateModelVram(a, "QLoRA", gpuConstraintGb);
      const bVram = estimateModelVram(b, "QLoRA", gpuConstraintGb);
      const aScore = (a.matchScore ?? a.relevanceScore ?? 70) + (aVram.fitStatus !== "overflow" ? 12 : 0);
      const bScore = (b.matchScore ?? b.relevanceScore ?? 70) + (bVram.fitStatus !== "overflow" ? 12 : 0);
      return bScore - aScore;
    });
    return sorted[0]?.id || sorted[0]?.name || null;
  }, [comparedModels, gpuConstraintGb]);

  // Pareto frontier points from all candidate models (x = QLoRA VRAM GB, y = Match Score %)
  const paretoData = useMemo(() => {
    const source = rawModels.length > 0 ? rawModels.slice(0, 12) : comparedModels;
    const pts = source.map((m: any, idx: number) => {
      const vram = estimateModelVram(m, "QLoRA", gpuConstraintGb);
      const score = Math.min(100, Math.max(10, Math.round(m.matchScore ?? m.relevanceScore ?? 65)));
      return {
        id: m.id || m.name || `m-${idx}`,
        label: m.name || m.id || `Model ${idx + 1}`,
        xVram: Math.max(0.5, vram.totalGb),
        yScore: score,
        fits: vram.fitStatus !== "overflow",
        paramDisplay: vram.paramDisplay,
      };
    });

    // Compute upper-left Pareto frontier (minimal VRAM for a given or higher score)
    const sortedByVram = [...pts].sort((a, b) => a.xVram - b.xVram || b.yScore - a.yScore);
    const frontier: typeof pts = [];
    let maxScoreSeen = -1;
    for (const p of sortedByVram) {
      if (p.yScore > maxScoreSeen) {
        frontier.push(p);
        maxScoreSeen = p.yScore;
      }
    }
    return { points: pts, frontier };
  }, [rawModels, comparedModels, gpuConstraintGb]);

  const maxPlotVram = useMemo(() => {
    const m = Math.max(gpuConstraintGb, ...paretoData.points.map((p) => p.xVram), 16);
    return Math.ceil(m * 1.12);
  }, [paretoData.points, gpuConstraintGb]);

  const handleAutoPinTop = () => {
    if (rawModels[0] && pinnedAssets.length < 4) {
      const m = rawModels[0];
      const mId = String(m.id || m.name || "model-1");
      togglePinAsset({
        id: mId,
        type: "model",
        title: String(m.name || m.id || "Model 1"),
        subtitle: String(m.architecture || m.task || "Model"),
        source: "Hugging Face",
        score: Math.round(m.matchScore ?? m.relevanceScore ?? 80),
        badge: "Model",
        url: m.url,
        data: m,
        pinnedAt: Date.now(),
      });
    }
    if (rawModels[1] && pinnedAssets.length < 3) {
      const m = rawModels[1];
      const mId = String(m.id || m.name || "model-2");
      togglePinAsset({
        id: mId,
        type: "model",
        title: String(m.name || m.id || "Model 2"),
        subtitle: String(m.architecture || m.task || "Model"),
        source: "Hugging Face",
        score: Math.round(m.matchScore ?? m.relevanceScore ?? 75),
        badge: "Model",
        url: m.url,
        data: m,
        pinnedAt: Date.now(),
      });
    }
    if (rawDatasets[0] && pinnedAssets.length < 4) {
      const d = rawDatasets[0];
      togglePinAsset({
        id: d.id || d.ref || d.name,
        type: "dataset",
        title: d.title || d.name,
        subtitle: d.subtitle || d.modality,
        source: d.source || "Hub",
        score: Math.round(d.matchScore ?? d.relevanceScore ?? 80),
        badge: "Dataset",
        url: d.url,
        data: d,
        pinnedAt: Date.now(),
      });
    }
  };

  return (
    <WorkspaceShell pageTitle="Benchmark Matrix">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Top Action & Pinned Drawer Bar */}
        <section className="obsidian-card p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-sky-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                  Side-by-Side Architecture Evaluation
                </span>
              </div>
              <h1 className="text-xl font-bold text-slate-100 tracking-tight">
                {query ? `Benchmark Matrix: ${query}` : "Model & Dataset Benchmark Lab"}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-lg bg-[#07090E] border border-white/[0.08] p-0.5">
                {([8, 16, 24, 80] as const).map((gb) => (
                  <button
                    key={gb}
                    type="button"
                    onClick={() => setGpuConstraintGb(gb)}
                    className={`px-2 py-1 rounded-md font-mono text-[11px] font-semibold tabular-nums cursor-pointer ${
                      gpuConstraintGb === gb
                        ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                        : "text-slate-400 hover:text-slate-200 border border-transparent"
                    }`}
                  >
                    {gb}G
                  </button>
                ))}
              </div>

              {(rawModels.length > 0 || rawDatasets.length > 0) && pinnedAssets.length === 0 && (
                <button
                  type="button"
                  onClick={handleAutoPinTop}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-semibold cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" /> Auto-Pin Top Candidates
                </button>
              )}

              {comparedModels.length >= 2 && (
                <button
                  type="button"
                  onClick={() =>
                    askAssistant(
                      `Compare these candidate models on ${gpuConstraintGb}GB VRAM for "${query || "this task"}": ${comparedModels
                        .map((m) => m.name || m.id)
                        .join(" vs ")}. Recommend the single optimal winner and explain QLoRA vs full fine-tuning tradeoffs.`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Ask Copilot to Pick Winner
                </button>
              )}

              <Link
                href="/roadmap"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-slate-200"
              >
                Pipeline Roadmap <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Pinned Asset Chips Drawer */}
          <div className="pt-3 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Pin className="w-3 h-3 text-emerald-400" /> Pinned Comparison Tray ({pinnedAssets.length}/4):
              </span>
              {pinnedAssets.length === 0 ? (
                <span className="text-xs text-slate-400">
                  No manually pinned assets — auto-comparing top live candidates.
                </span>
              ) : (
                pinnedAssets.map((asset) => (
                  <span
                    key={asset.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#07090E] border border-white/10 text-xs text-slate-200"
                  >
                    <span className="text-[10px] font-mono text-sky-400 uppercase">{asset.type}</span>
                    <span className="truncate max-w-[160px]">{asset.title}</span>
                    <button
                      type="button"
                      onClick={() => togglePinAsset(asset)}
                      className="text-slate-500 hover:text-rose-400 cursor-pointer"
                      aria-label={`Remove ${asset.title}`}
                    >
                      <PinOff className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
            {pinnedAssets.length > 0 && (
              <button
                type="button"
                onClick={clearPinnedAssets}
                className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Clear All
              </button>
            )}
          </div>
        </section>

        {/* Empty State if no active session yet */}
        {rawModels.length === 0 && rawDatasets.length === 0 && pinnedAssets.length === 0 ? (
          <div className="space-y-4">
            <StitchEmptyState
              category="general"
              title="No Active Candidates Loaded"
              description="Run a discovery query in Explore Studio first, or pin candidate datasets and models to benchmark them here."
            />
            <div className="flex justify-center">
              <Link
                href="/explore"
                className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-lab"
              >
                Launch Explore Studio &rarr;
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Tab Bar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] pb-3">
              <button
                type="button"
                onClick={() => setActiveTab("models")}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                  activeTab === "models"
                    ? "bg-sky-500/15 text-sky-300 border border-sky-500/35"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                <Cpu className="w-3.5 h-3.5" /> Models Matrix ({comparedModels.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("datasets")}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                  activeTab === "datasets"
                    ? "bg-sky-500/15 text-sky-300 border border-sky-500/35"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                <Database className="w-3.5 h-3.5" /> Datasets Matrix ({comparedDatasets.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("papers")}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                  activeTab === "papers"
                    ? "bg-sky-500/15 text-sky-300 border border-sky-500/35"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" /> Literature Baselines ({rawPapers.length})
              </button>
            </div>

            {activeTab === "models" && (
              <div className="space-y-6">
                {/* Side-by-Side Comparison Matrix Table */}
                <div className="obsidian-card overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[740px]">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-[#0A0D14]">
                        <th className="sticky left-0 z-10 bg-[#0A0D14] py-4 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400 w-52">
                          Evaluation Criterion
                        </th>
                        {comparedModels.map((m, idx) => {
                          const id = m.id || m.name || `m-${idx}`;
                          const isCrown = id === recommendedModelId;
                          return (
                            <th key={id} className="py-4 px-4 align-top min-w-[200px] border-l border-white/[0.06]">
                              <div className="space-y-1.5">
                                {isCrown && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                                    <Crown className="w-3 h-3" /> Recommended Pick
                                  </span>
                                )}
                                <div className="text-sm font-bold text-slate-100 line-clamp-2">
                                  {m.name || m.id}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                                  <span>{m.framework || "PyTorch"}</span>
                                  {m.url && (
                                    <a
                                      href={m.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-0.5"
                                    >
                                      Hub <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-white/[0.06] text-xs">
                      {/* GROUP 1: Performance & Benchmarks */}
                      <tr className="bg-white/[0.02]">
                        <td
                          colSpan={comparedModels.length + 1}
                          className="py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-sky-400"
                        >
                          01. Performance &amp; Match Benchmarks
                        </td>
                      </tr>
                      <tr>
                        <td className="sticky left-0 bg-[#0D111A] py-3 px-4 font-medium text-slate-300">
                          Suitability Score
                        </td>
                        {comparedModels.map((m, idx) => {
                          const score = Math.round(m.matchScore ?? m.relevanceScore ?? 70);
                          return (
                            <td key={m.id || idx} className="py-3 px-4 border-l border-white/[0.06] font-mono tabular-nums">
                              <span className="text-sm font-bold text-emerald-300">{score}%</span>
                              <span className="ml-2 text-[10px] text-slate-400">{m.tier || (score >= 85 ? "Tier A" : "Tier B")}</span>
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="sticky left-0 bg-[#0D111A] py-3 px-4 font-medium text-slate-300">
                          Parameters &amp; Task
                        </td>
                        {comparedModels.map((m, idx) => {
                          const { display } = parseParameterBillions(m);
                          return (
                            <td key={m.id || idx} className="py-3 px-4 border-l border-white/[0.06]">
                              <div className="font-mono text-sky-300 font-semibold tabular-nums">{display}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5">{m.task || m.pipelineTag || "General ML"}</div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* GROUP 2: Hardware & VRAM Footprint */}
                      <tr className="bg-white/[0.02]">
                        <td
                          colSpan={comparedModels.length + 1}
                          className="py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-sky-400"
                        >
                          02. Hardware &amp; VRAM Footprint (vs. {gpuConstraintGb}GB Target)
                        </td>
                      </tr>
                      <tr>
                        <td className="sticky left-0 bg-[#0D111A] py-3 px-4 font-medium text-slate-300">
                          Precision Memory Ladder
                        </td>
                        {comparedModels.map((m, idx) => {
                          const fp16 = estimateModelVram(m, "FP16", gpuConstraintGb);
                          const lora = estimateModelVram(m, "LoRA", gpuConstraintGb);
                          const qlora = estimateModelVram(m, "QLoRA", gpuConstraintGb);
                          return (
                            <td key={m.id || idx} className="py-3 px-4 border-l border-white/[0.06] space-y-2">
                              {[
                                { label: "FP16", v: fp16 },
                                { label: "LoRA", v: lora },
                                { label: "QLoRA", v: qlora },
                              ].map((row) => (
                                <div key={row.label} className="space-y-0.5">
                                  <div className="flex justify-between font-mono text-[10px] tabular-nums">
                                    <span className="text-slate-400">{row.label}</span>
                                    <span
                                      className={
                                        row.v.fitStatus === "fits"
                                          ? "text-emerald-400"
                                          : row.v.fitStatus === "tight"
                                          ? "text-amber-400"
                                          : "text-rose-400"
                                      }
                                    >
                                      {row.v.totalGb} GB
                                    </span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-[#07090E] overflow-hidden">
                                    <div
                                      style={{ width: `${Math.min(100, (row.v.totalGb / gpuConstraintGb) * 100)}%` }}
                                      className={`h-full rounded-full ${
                                        row.v.fitStatus === "fits"
                                          ? "bg-emerald-400"
                                          : row.v.fitStatus === "tight"
                                          ? "bg-amber-400"
                                          : "bg-rose-400"
                                      }`}
                                    />
                                  </div>
                                </div>
                              ))}
                            </td>
                          );
                        })}
                      </tr>

                      {/* GROUP 3: Training Cost & Speed */}
                      <tr className="bg-white/[0.02]">
                        <td
                          colSpan={comparedModels.length + 1}
                          className="py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-sky-400"
                        >
                          03. Training Speed &amp; Cloud Estimate (10k steps QLoRA)
                        </td>
                      </tr>
                      <tr>
                        <td className="sticky left-0 bg-[#0D111A] py-3 px-4 font-medium text-slate-300">
                          GPU Tier Projection
                        </td>
                        {comparedModels.map((m, idx) => {
                          const { billions } = parseParameterBillions(m);
                          const t4Hours = Math.max(0.4, Number((billions * 1.1).toFixed(1)));
                          const a10Hours = Math.max(0.2, Number((billions * 0.55).toFixed(1)));
                          const a100Hours = Math.max(0.1, Number((billions * 0.2).toFixed(1)));
                          const estUsd = Math.max(0.3, Number((a100Hours * 1.89).toFixed(2)));
                          return (
                            <td key={m.id || idx} className="py-3 px-4 border-l border-white/[0.06] font-mono text-[11px] space-y-1 tabular-nums">
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-500" /> T4 16G:</span>
                                <span>~{t4Hours}h</span>
                              </div>
                              <div className="flex items-center justify-between text-slate-300">
                                <span>A10G 24G:</span>
                                <span>~{a10Hours}h</span>
                              </div>
                              <div className="flex items-center justify-between text-emerald-300">
                                <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> A100 80G:</span>
                                <span>~{a100Hours}h (${estUsd})</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* GROUP 4: Licensing & Commercial Viability */}
                      <tr className="bg-white/[0.02]">
                        <td
                          colSpan={comparedModels.length + 1}
                          className="py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-sky-400"
                        >
                          04. Licensing &amp; Dataset Compatibility
                        </td>
                      </tr>
                      <tr>
                        <td className="sticky left-0 bg-[#0D111A] py-3 px-4 font-medium text-slate-300">
                          Commercial License
                        </td>
                        {comparedModels.map((m, idx) => {
                          const lic = m.license || "Apache-2.0 / Hub";
                          const safe = isCommercialSafeLicense(lic) || /apache|mit/i.test(lic);
                          return (
                            <td key={m.id || idx} className="py-3 px-4 border-l border-white/[0.06]">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                                  safe
                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                    : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                                }`}
                              >
                                {safe ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                {lic}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="sticky left-0 bg-[#0D111A] py-3 px-4 font-medium text-slate-300">
                          Dataset Pairing Fit
                        </td>
                        {comparedModels.map((m, idx) => (
                          <td key={m.id || idx} className="py-3 px-4 border-l border-white/[0.06] text-slate-300">
                            {rawDatasets[0] ? (
                              <div className="space-y-1">
                                <span className="text-emerald-400 font-medium block truncate max-w-[190px]">
                                  Compatible w/ {rawDatasets[0].title || rawDatasets[0].name}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  {m.task || "Fine-tuning adapter ready"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">Ready for standard tokenization/loaders</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Interactive SVG Pareto Trade-off Scatter Plot */}
                <section className="obsidian-card p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-bold text-slate-100">
                        Pareto Frontier: Match Quality vs. QLoRA VRAM Footprint
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Upper-left candidates maximize match relevance while minimizing GPU memory consumption. Dashed vertical line marks your {gpuConstraintGb}GB budget.
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 text-emerald-300">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Fits {gpuConstraintGb}GB
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-rose-300">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Exceeds GPU
                      </span>
                    </div>
                  </div>

                  <div className="w-full overflow-x-auto bg-[#07090E] rounded-xl border border-white/[0.07] p-3">
                    <svg viewBox="0 0 760 300" className="w-full h-[270px] min-w-[540px]">
                      {/* Grid Lines */}
                      {[20, 40, 60, 80, 100].map((pct) => {
                        const y = 250 - (pct / 100) * 210;
                        return (
                          <g key={pct}>
                            <line x1={65} y1={y} x2={725} y2={y} stroke="rgba(255,255,255,0.06)" />
                            <text x={55} y={y + 3} textAnchor="end" fill="#64748B" fontSize="10" fontFamily="var(--font-mono)">
                              {pct}%
                            </text>
                          </g>
                        );
                      })}

                      {/* GPU Budget Vertical Ceiling */}
                      {(() => {
                        const budgetX = 65 + Math.min(1, gpuConstraintGb / maxPlotVram) * 655;
                        return (
                          <g>
                            <line
                              x1={budgetX}
                              y1={20}
                              x2={budgetX}
                              y2={250}
                              stroke="#38BDF8"
                              strokeDasharray="5 5"
                              strokeWidth={1.5}
                            />
                            <text
                              x={budgetX + 5}
                              y={32}
                              fill="#38BDF8"
                              fontSize="10"
                              fontFamily="var(--font-mono)"
                            >
                              {gpuConstraintGb}GB Ceiling
                            </text>
                          </g>
                        );
                      })()}

                      {/* Pareto Frontier Polyline */}
                      {paretoData.frontier.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#38BDF8"
                          strokeWidth={1.75}
                          strokeOpacity={0.65}
                          points={paretoData.frontier
                            .map((p) => {
                              const cx = 65 + (p.xVram / maxPlotVram) * 655;
                              const cy = 250 - (p.yScore / 100) * 210;
                              return `${cx},${cy}`;
                            })
                            .join(" ")}
                        />
                      )}

                      {/* Data Points */}
                      {paretoData.points.map((p) => {
                        const cx = 65 + (p.xVram / maxPlotVram) * 655;
                        const cy = 250 - (p.yScore / 100) * 210;
                        const isHovered = hoveredPlotId === p.id;
                        return (
                          <g
                            key={p.id}
                            onMouseEnter={() => setHoveredPlotId(p.id)}
                            onMouseLeave={() => setHoveredPlotId(null)}
                            className="cursor-pointer"
                          >
                            <circle
                              cx={cx}
                              cy={cy}
                              r={isHovered ? 8 : 5.5}
                              fill={p.fits ? "#10B981" : "#F43F5E"}
                              stroke="#07090E"
                              strokeWidth={2}
                            />
                            <text
                              x={cx}
                              y={cy - 10}
                              textAnchor="middle"
                              fill={isHovered ? "#F8FAFC" : "#94A3B8"}
                              fontSize={isHovered ? "11" : "9.5"}
                              fontWeight={isHovered ? 700 : 500}
                            >
                              {p.label.length > 22 ? `${p.label.slice(0, 21)}…` : p.label}
                            </text>
                          </g>
                        );
                      })}

                      {/* Axis Labels */}
                      <text x={395} y={285} textAnchor="middle" fill="#64748B" fontSize="11">
                        Estimated QLoRA Peak VRAM (GB)
                      </text>
                    </svg>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "datasets" && (
              <div className="obsidian-card overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-[#0A0D14] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="py-3.5 px-4">Dataset</th>
                      <th className="py-3.5 px-4">Source</th>
                      <th className="py-3.5 px-4">Scale / Size</th>
                      <th className="py-3.5 px-4">Commercial Clearance</th>
                      <th className="py-3.5 px-4 text-right">Relevance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-xs">
                    {comparedDatasets.map((d: any, idx: number) => {
                      const commercial = isCommercialSafeLicense(d.license);
                      return (
                        <tr key={d.id || idx} className="hover:bg-white/[0.02]">
                          <td className="py-3.5 px-4 font-semibold text-slate-100 max-w-[260px]">
                            <div className="truncate">{d.title || d.name}</div>
                            <div className="text-[11px] text-slate-400 truncate font-normal mt-0.5">
                              {d.subtitle || d.modality || "Structured ML corpus"}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-300">{d.source || "Hub"}</td>
                          <td className="py-3.5 px-4 font-mono text-slate-300 tabular-nums">{d.size || d.rows || "—"}</td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${
                                commercial
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                  : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                              }`}
                            >
                              {d.license || "Verify Upstream"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-sky-300 tabular-nums">
                            {Math.round(d.matchScore ?? d.relevanceScore ?? 75)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "papers" && (
              <div className="obsidian-card overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-[#0A0D14] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="py-3.5 px-4">Paper Title</th>
                      <th className="py-3.5 px-4">Source / Venue</th>
                      <th className="py-3.5 px-4">Year</th>
                      <th className="py-3.5 px-4">Citations</th>
                      <th className="py-3.5 px-4">Linkage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-xs">
                    {rawPapers.slice(0, 10).map((p: any, idx: number) => (
                      <tr key={p.id || idx} className="hover:bg-white/[0.02]">
                        <td className="py-3.5 px-4 font-semibold text-slate-100 max-w-[340px]">
                          <a
                            href={p.url || p.pdfUrl || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-sky-300 transition-lab line-clamp-2"
                          >
                            {p.title}
                          </a>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">{p.venue || p.source || "Scholarly"}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-300 tabular-nums">{p.year || "—"}</td>
                        <td className="py-3.5 px-4 font-mono text-emerald-300 tabular-nums">
                          {typeof p.citationCount === "number" ? p.citationCount.toLocaleString() : "—"}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px] text-sky-400">
                          {p.relationship || "EVIDENCE"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}

export default function BenchmarkPage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#07090E] flex items-center justify-center text-xs font-mono text-slate-400">
            Loading Benchmark Lab...
          </div>
        }
      >
        <BenchmarkMatrixContent />
      </Suspense>
    </ErrorBoundary>
  );
}
