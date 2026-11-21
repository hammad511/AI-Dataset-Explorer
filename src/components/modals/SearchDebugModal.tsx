"use client";

import React, { useState } from "react";
import { X, Activity } from "lucide-react";
import { SearchDiagnostics, PipelineTelemetry } from "@/server/search/types";

interface SearchDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  diagnostics?: SearchDiagnostics | null;
  telemetry?: PipelineTelemetry | null;
  query?: string;
}

export default function SearchDebugModal({
  isOpen,
  onClose,
  diagnostics,
  query,
}: SearchDebugModalProps) {
  const [activeTab, setActiveTab] = useState<"funnel" | "entities" | "queries" | "rejections" | "telemetry">("funnel");

  if (!isOpen) return null;

  const funnel = diagnostics?.funnel || {
    retrieved: 0,
    deduplicated: 0,
    hardFiltered: 0,
    semanticRanked: 0,
    crossEncoderReranked: 0,
    finalRecommended: 0,
  };

  const parsed = diagnostics?.parsedQuery;
  const generated = diagnostics?.generatedQueries;
  const rejections = diagnostics?.rejectionReasons || [];
  const timings = diagnostics?.timingsMs;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[88vh] obsidian-card border border-strong rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-subtle bg-page/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent-subtle border border-accent/40 text-accent-from flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-primary flex items-center gap-2">
                <span>17-Stage Retrieval Funnel &amp; Pipeline Telemetry</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-accent-subtle text-accent-from border border-accent/30 font-mono">
                  AUDIT
                </span>
              </h2>
              <p className="text-[11px] font-mono text-faint truncate">
                Query: &quot;{query || parsed?.rawQuery || "Active Search"}&quot;
              </p>
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

        <div className="flex items-center gap-4 px-5 border-b border-subtle bg-rail text-xs font-mono overflow-x-auto">
          {[
            { key: "funnel", label: "Funnel" },
            { key: "entities", label: "Parsed Entities" },
            { key: "queries", label: "Expanded Queries" },
            { key: "rejections", label: `Rejections (${rejections.length})` },
            { key: "telemetry", label: "Latencies" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key as any)}
              className={`py-2.5 border-b-2 transition-lab whitespace-nowrap ${
                activeTab === t.key
                  ? "border-accent-from text-accent-from font-bold"
                  : "border-transparent text-muted hover:text-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {activeTab === "funnel" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 font-mono">
              {[
                { label: "1. Retrieved", val: funnel.retrieved, color: "text-primary" },
                { label: "2. Deduped", val: funnel.deduplicated, color: "text-accent-from" },
                { label: "3. Filtered", val: funnel.hardFiltered, color: "text-status-amber" },
                { label: "4. Semantic", val: funnel.semanticRanked, color: "text-status-violet" },
                { label: "5. Reranked", val: funnel.crossEncoderReranked, color: "text-sky-300" },
                { label: "6. Final", val: funnel.finalRecommended, color: "text-status-emerald" },
              ].map((s) => (
                <div key={s.label} className="p-3 rounded-xl bg-page border border-subtle text-center">
                  <div className="text-[10px] text-faint uppercase">{s.label}</div>
                  <div className={`text-xl font-black mt-1 tabular-nums ${s.color}`}>{s.val}</div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "entities" && (
            <div className="space-y-4">
              {parsed ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-page border border-subtle space-y-2">
                    <div className="text-[10px] font-mono uppercase text-status-emerald">Positive Entities</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(parsed.positiveEntities || []).map((e, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-card-subtle border border-subtle font-mono text-[11px] text-status-emerald">
                          + {e}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-page border border-subtle space-y-2">
                    <div className="text-[10px] font-mono uppercase text-status-rose">Excluded Contradictions</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(parsed.negativeEntities || []).slice(0, 10).map((e, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-card-subtle border border-rose-500/20 font-mono text-[11px] text-status-rose">
                          - {e}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-muted font-mono">No structured entity diagnostics recorded for this session.</div>
              )}
            </div>
          )}

          {activeTab === "queries" && (
            <div className="space-y-3 font-mono">
              {generated ? (
                <>
                  <div className="text-[10px] uppercase text-accent-from">Dataset Queries</div>
                  {(generated.datasetQueries || []).map((q, i) => (
                    <div key={i} className="p-2 rounded-lg bg-page border border-subtle text-secondary">{q}</div>
                  ))}
                  <div className="text-[10px] uppercase text-status-violet pt-2">Model Queries</div>
                  {(generated.modelQueries || []).map((q, i) => (
                    <div key={i} className="p-2 rounded-lg bg-page border border-subtle text-secondary">{q}</div>
                  ))}
                </>
              ) : (
                <div className="text-muted">No expanded source queries available.</div>
              )}
            </div>
          )}

          {activeTab === "rejections" && (
            <div className="space-y-2">
              {rejections.length === 0 ? (
                <div className="p-4 text-center text-muted font-mono">No candidates disqualified.</div>
              ) : (
                rejections.map((rej, i) => (
                  <div key={i} className="p-3 rounded-xl bg-page border border-rose-500/20 space-y-1">
                    <div className="font-semibold text-primary">{rej.title || rej.id}</div>
                    <div className="text-status-rose font-mono text-[11px]">{rej.reason}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "telemetry" && (
            <div className="p-4 rounded-xl bg-page border border-subtle space-y-3 font-mono">
              {timings ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div><span className="text-faint block">Understanding</span><span className="text-primary tabular-nums">{timings.queryUnderstanding} ms</span></div>
                    <div><span className="text-faint block">Retrieval</span><span className="text-primary tabular-nums">{timings.retrieval} ms</span></div>
                    <div><span className="text-faint block">Hard Filter</span><span className="text-primary tabular-nums">{timings.hardFilter} ms</span></div>
                    <div><span className="text-faint block">Reranker</span><span className="text-primary tabular-nums">{timings.crossEncoder + timings.semanticRanking} ms</span></div>
                  </div>
                  <div className="pt-2 border-t border-subtle flex justify-between font-bold">
                    <span className="text-muted">Total Latency</span>
                    <span className="text-status-emerald tabular-nums">{timings.total} ms</span>
                  </div>
                </>
              ) : (
                <div className="text-muted">Run a live search on Explore to record stage timings.</div>
              )}
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
