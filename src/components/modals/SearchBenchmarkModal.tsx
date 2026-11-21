"use client";

import React, { useState, useEffect } from "react";
import { X, BarChart3, RotateCw } from "lucide-react";
import { runBenchmarkEvaluation } from "@/server/search/evaluation";
import { IREvaluationComparison, IRBenchmarkMetrics } from "@/server/search/types";

interface SearchBenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchBenchmarkModal({ isOpen, onClose }: SearchBenchmarkModalProps) {
  const [evalData, setEvalData] = useState<{
    comparisons: IREvaluationComparison[];
    aggregate: {
      baseline: IRBenchmarkMetrics;
      advanced: IRBenchmarkMetrics;
      overallPrecisionGain: number;
      overallNdcgGain: number;
      overallErrorReduction: number;
    };
  } | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "queries">("summary");

  const handleRunEvaluation = () => {
    setIsRunning(true);
    setTimeout(() => {
      try {
        setEvalData(runBenchmarkEvaluation());
      } catch (e) {
        console.error("Failed to run benchmark evaluation:", e);
      } finally {
        setIsRunning(false);
      }
    }, 250);
  };

  useEffect(() => {
    if (isOpen && !evalData) handleRunEvaluation();
  }, [isOpen, evalData]);

  if (!isOpen) return null;
  const agg = evalData?.aggregate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] obsidian-card border border-strong rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-subtle bg-page/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-status-emerald flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-primary">Empirical IR Evaluation &amp; Precision Benchmark</h2>
              <p className="text-[11px] font-mono text-faint">Baseline Keyword Search vs Evidence-Verified 17-Stage Pipeline</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-muted hover:text-primary hover:bg-card-hover flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between px-5 border-b border-subtle bg-rail text-xs font-mono">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveTab("summary")}
              className={`py-2.5 border-b-2 transition-lab ${
                activeTab === "summary" ? "border-accent-from text-accent-from font-bold" : "border-transparent text-muted hover:text-primary"
              }`}
            >
              Aggregate IR Metrics
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("queries")}
              className={`py-2.5 border-b-2 transition-lab ${
                activeTab === "queries" ? "border-accent-from text-accent-from font-bold" : "border-transparent text-muted hover:text-primary"
              }`}
            >
              Query Breakdown ({evalData?.comparisons.length || 5})
            </button>
          </div>
          <button
            type="button"
            onClick={handleRunEvaluation}
            disabled={isRunning}
            className="px-2.5 py-1 rounded-lg bg-card hover:bg-card-hover border border-subtle text-[11px] text-primary flex items-center gap-1.5"
          >
            <RotateCw className={`w-3 h-3 ${isRunning ? "animate-spin" : ""}`} />
            {isRunning ? "Evaluating..." : "Rerun"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {activeTab === "summary" && agg && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
                <div className="p-4 rounded-xl bg-page border border-emerald-500/25 text-center">
                  <div className="text-[10px] text-status-emerald uppercase">Precision @ 5</div>
                  <div className="text-3xl font-black text-status-emerald mt-1 tabular-nums">{agg.advanced.precisionAt5}%</div>
                  <div className="text-[11px] text-muted mt-1">+{agg.overallPrecisionGain}% vs Baseline ({agg.baseline.precisionAt5}%)</div>
                </div>
                <div className="p-4 rounded-xl bg-page border border-sky-500/25 text-center">
                  <div className="text-[10px] text-accent-from uppercase">NDCG @ 10</div>
                  <div className="text-3xl font-black text-accent-from mt-1 tabular-nums">{agg.advanced.ndcgAt10}%</div>
                  <div className="text-[11px] text-muted mt-1">+{agg.overallNdcgGain}% vs Baseline ({agg.baseline.ndcgAt10}%)</div>
                </div>
                <div className="p-4 rounded-xl bg-page border border-subtle text-center">
                  <div className="text-[10px] text-status-violet uppercase">Wrong Modality Rate</div>
                  <div className="text-3xl font-black text-status-violet mt-1 tabular-nums">{agg.advanced.wrongAnatomyRate}%</div>
                  <div className="text-[11px] text-muted mt-1">-{agg.overallErrorReduction}% false positives</div>
                </div>
              </div>

              <div className="rounded-xl border border-subtle overflow-hidden bg-page font-mono">
                <table className="w-full text-left text-xs">
                  <thead className="bg-rail border-b border-subtle text-faint uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Metric</th>
                      <th className="py-2.5 px-4">Baseline</th>
                      <th className="py-2.5 px-4 text-status-emerald">Evidence Pipeline</th>
                      <th className="py-2.5 px-4 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] tabular-nums">
                    {[
                      { name: "Precision @ 5", b: agg.baseline.precisionAt5, a: agg.advanced.precisionAt5, pos: true },
                      { name: "Precision @ 10", b: agg.baseline.precisionAt10, a: agg.advanced.precisionAt10, pos: true },
                      { name: "Recall @ 10", b: agg.baseline.recallAt10, a: agg.advanced.recallAt10, pos: true },
                      { name: "NDCG @ 10", b: agg.baseline.ndcgAt10, a: agg.advanced.ndcgAt10, pos: true },
                      { name: "Mean Reciprocal Rank", b: agg.baseline.mrr, a: agg.advanced.mrr, pos: true },
                    ].map((row) => (
                      <tr key={row.name}>
                        <td className="py-2.5 px-4 font-sans font-medium text-primary">{row.name}</td>
                        <td className="py-2.5 px-4 text-muted">{row.b}%</td>
                        <td className="py-2.5 px-4 font-bold text-status-emerald">{row.a}%</td>
                        <td className="py-2.5 px-4 text-right text-status-emerald">+{row.a - row.b}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === "queries" && evalData && (
            <div className="space-y-3">
              {evalData.comparisons.map((c, i) => (
                <div key={i} className="p-3.5 rounded-xl bg-page border border-subtle space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-primary">&quot;{c.query}&quot;</div>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] status-badge-emerald border tabular-nums">
                      +{c.improvementPercent.precisionAt5}% P@5
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-muted">
                    <div>Base P@5: <strong className="text-primary">{c.baseline.precisionAt5}%</strong></div>
                    <div>Adv P@5: <strong className="text-status-emerald">{c.advanced.precisionAt5}%</strong></div>
                    <div>Base False Pos: <strong className="text-status-rose">{c.baseline.wrongAnatomyRate}%</strong></div>
                    <div>Adv False Pos: <strong className="text-status-emerald">{c.advanced.wrongAnatomyRate}%</strong></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-subtle bg-page/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-accent text-slate-950 font-bold text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
