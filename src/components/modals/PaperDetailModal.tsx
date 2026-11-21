"use client";

import React from "react";
import { X, Unlock, ExternalLink, FileText, Quote, Sparkles } from "lucide-react";
import type { NormalizedPaper } from "@/types/papers";

interface PaperDetailModalProps {
  paper: NormalizedPaper | null;
  onClose: () => void;
}

export default function PaperDetailModal({ paper, onClose }: PaperDetailModalProps) {
  if (!paper) return null;

  const title = paper.title || "Untitled Research Paper";
  const authors =
    Array.isArray(paper.authors) && paper.authors.length > 0
      ? paper.authors.join(", ")
      : "Not available";
  const year = paper.year || (paper.publicationDate ? paper.publicationDate.slice(0, 4) : "Not available");
  const pubDate = paper.publicationDate || "Not available";
  const venue = paper.venue || "Academic Publication";
  const abstract = paper.abstract || "Abstract not available.";
  const citations =
    typeof paper.citationCount === "number"
      ? `${paper.citationCount.toLocaleString()} (${paper.citationSource || "Scholarly Index"})`
      : "Not available";
  const score = paper.relevanceScore ?? 50;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl rounded-2xl obsidian-card border border-strong shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-subtle pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-md border uppercase ${
                paper.relationship === "EXACT_DATASET"
                  ? "status-badge-emerald"
                  : paper.relationship === "EXACT_MODEL"
                  ? "status-badge-cyan"
                  : paper.relationship === "DIRECTLY_RELATED"
                  ? "status-badge-violet"
                  : "bg-card-subtle text-muted border-subtle"
              }`}
            >
              {(paper.relationship || "LITERATURE").replace(/_/g, " ")}
            </span>
            {paper.isPreprint && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md status-badge-amber border uppercase">
                Preprint
              </span>
            )}
            {paper.openAccess && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md status-badge-emerald border inline-flex items-center gap-1">
                <Unlock className="w-3 h-3" /> Open Access
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-card-subtle hover:bg-card-hover border border-subtle text-muted hover:text-primary flex items-center justify-center transition-lab"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg sm:text-xl font-bold text-primary leading-snug">{title}</h2>
          <p className="text-xs text-secondary leading-relaxed">
            <span className="font-mono text-faint mr-1.5">AUTHORS:</span>
            {authors}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted">
            <span>Venue: {venue}</span>
            <span>·</span>
            <span>Published: {pubDate} ({year})</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 bg-page rounded-xl border border-subtle">
            <span className="text-faint uppercase text-[10px]">AI Relevance</span>
            <div className="text-base font-bold text-accent-from mt-1 tabular-nums">{score}%</div>
          </div>
          <div className="p-3 bg-page rounded-xl border border-subtle">
            <span className="text-faint uppercase text-[10px]">Citations</span>
            <div className="text-xs font-bold text-primary mt-1.5 truncate tabular-nums" title={citations}>
              {citations}
            </div>
          </div>
          <div className="p-3 bg-page rounded-xl border border-subtle">
            <span className="text-faint uppercase text-[10px]">DOI</span>
            <div className="text-xs text-secondary mt-1.5 truncate" title={paper.doi || "Unavailable"}>
              {paper.doi || "N/A"}
            </div>
          </div>
          <div className="p-3 bg-page rounded-xl border border-subtle">
            <span className="text-faint uppercase text-[10px]">arXiv ID</span>
            <div className="text-xs text-status-emerald mt-1.5 truncate">{paper.arxivId || "N/A"}</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-page border border-emerald-500/20 space-y-1.5">
          <div className="text-[11px] font-mono font-bold text-status-emerald uppercase flex items-center gap-1.5">
            <Quote className="w-3.5 h-3.5" /> Verified Relationship Evidence
          </div>
          <p className="text-xs text-secondary leading-relaxed">
            {paper.relationshipEvidence || "Classified from title, abstract, and entity metadata matching."}
          </p>
        </div>

        {Array.isArray(paper.whyRelevant) && paper.whyRelevant.length > 0 && (
          <div className="p-4 rounded-xl bg-page border border-subtle space-y-2">
            <div className="text-[11px] font-mono font-bold text-accent-from uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Relevance Breakdown
            </div>
            <ul className="space-y-1.5 text-xs text-secondary">
              {paper.whyRelevant.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-accent-from font-mono">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-1.5">
          <h4 className="text-[10px] font-mono uppercase tracking-wider text-faint">Abstract</h4>
          <div className="p-4 rounded-xl bg-page border border-subtle text-xs text-secondary leading-relaxed whitespace-pre-line">
            {abstract}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-subtle">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-card-subtle hover:bg-card-hover border border-subtle text-secondary font-semibold text-xs transition-lab"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {paper.pdfUrl && (
              <a
                href={paper.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl status-badge-rose border font-mono font-bold text-xs flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                Open PDF
              </a>
            )}
            {paper.paperUrl && (
              <a
                href={paper.paperUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-accent text-slate-950 font-bold text-xs shadow-accent-sm hover:brightness-110 flex items-center gap-1.5"
              >
                <span>View Source</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
