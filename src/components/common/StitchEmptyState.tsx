"use client";

import React from "react";
import { AlertTriangle, RotateCw, Search, Zap, ArrowUpRight, Database, Cpu, BookOpen } from "lucide-react";

export interface StitchEmptyStateProps {
  category: "datasets" | "models" | "papers" | "error" | "general";
  query?: string;
  modality?: string;
  domain?: string;
  onRelaxQuery?: (newQuery: string) => void;
  onRetry?: () => void;
  errorMessage?: string;
  title?: string;
  description?: string;
}

export function StitchEmptyState({
  category,
  query = "",
  modality,
  domain,
  onRelaxQuery,
  onRetry,
  errorMessage,
  title,
  description,
}: StitchEmptyStateProps) {
  const isCryoModality =
    /cryo|tomography|subtomogram|macromolecule/i.test(query) || /cryo/i.test(modality || "");

  const stopWords = new Set(["with", "using", "for", "the", "and", "data", "dataset", "datasets", "model", "models", "i'm", "building", "a", "system", "to", "predict", "detect", "find", "search"]);
  const strippedQuery = (query || "")
    .replace(/^(I'm building|i am building|i'm making|i need|we want to|please find|can you recommend|i have|looking for|search for|find me)\b\s*/i, "")
    .trim();

  const queryWords = Array.from(
    new Set(strippedQuery.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase())))
  );
  const relaxedChips = queryWords.slice(0, 4).map((w) => ({ label: `Search '${w}'`, query: w }));
  if (queryWords.length >= 2) {
    relaxedChips.unshift({
      label: `Broader: ${queryWords.slice(0, 2).join(" ")}`,
      query: queryWords.slice(0, 2).join(" "),
    });
  }

  if (category === "error") {
    return (
      <div className="p-6 rounded-2xl obsidian-card border-rose-500/30 text-center space-y-4">
        <div className="w-11 h-11 rounded-xl status-badge-rose border flex items-center justify-center mx-auto">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="max-w-md mx-auto space-y-1.5">
          <span className="px-2 py-0.5 rounded status-badge-rose border text-[10px] font-mono uppercase">
            Upstream Service Exception
          </span>
          <h3 className="text-base font-bold text-primary">{title || "Search Pipeline Degraded"}</h3>
          <p className="text-xs text-muted leading-relaxed">
            {errorMessage || description || "An external hub timed out. Retry to re-query live indices."}
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 rounded-xl bg-accent text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <RotateCw className="w-3.5 h-3.5" /> Retry Query
          </button>
        )}
      </div>
    );
  }

  const Icon = category === "datasets" ? Database : category === "models" ? Cpu : BookOpen;

  return (
    <div className="p-5 sm:p-6 rounded-2xl obsidian-card space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-subtle pb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-status-amber flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded status-badge-amber border text-[10px] font-mono uppercase">
                No Direct {category} Match
              </span>
              {domain && (
                <span className="px-2 py-0.5 rounded bg-card-subtle border border-subtle text-[10px] font-mono text-muted">
                  {domain.split("/").pop()}
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-primary">
              {title || `Zero qualifying ${category} passed strict filters`}
            </h3>
            <p className="text-xs text-muted max-w-xl leading-relaxed">
              {description ||
                "Try relaxing specific keyword constraints or broaden modality terms to surface high-recall alternatives."}
            </p>
          </div>
        </div>

        {onRelaxQuery && (
          <button
            type="button"
            onClick={() =>
              onRelaxQuery(isCryoModality ? "cryo-et" : queryWords.slice(0, 2).join(" ") || "machine learning")
            }
            className="px-3.5 py-2 rounded-xl bg-accent text-slate-950 text-xs font-bold flex items-center gap-1.5 shrink-0"
          >
            <Zap className="w-3.5 h-3.5" /> Auto-Relax Query
          </button>
        )}
      </div>

      {relaxedChips.length > 0 && onRelaxQuery && (
        <div className="space-y-2">
          <div className="text-[10px] font-mono uppercase text-faint">High-Recall Relaxed Queries</div>
          <div className="flex flex-wrap gap-2">
            {relaxedChips.map((chip, idx) => (
              <button
                key={`${chip.label}-${idx}`}
                type="button"
                onClick={() => onRelaxQuery(chip.query)}
                className="px-3 py-1.5 rounded-lg bg-page hover:bg-card-hover border border-subtle hover:border-accent/40 text-xs text-accent-from flex items-center gap-1.5 transition-lab"
              >
                <Search className="w-3 h-3" />
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {category === "papers" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
          {[
            { name: "PubMed", url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query || "deep learning")}` },
            { name: "arXiv", url: `https://arxiv.org/search/?query=${encodeURIComponent(query || "machine learning")}&searchtype=all` },
            { name: "Semantic Scholar", url: `https://www.semanticscholar.org/search?q=${encodeURIComponent(query || "machine learning")}` },
          ].map((portal) => (
            <a
              key={portal.name}
              href={portal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-xl bg-page border border-subtle hover:border-strong flex items-center justify-between text-xs text-primary transition-lab"
            >
              <span className="font-semibold">{portal.name}</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default StitchEmptyState;
