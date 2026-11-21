"use client";

import React, { useState } from "react";
import {
  FileText,
  ExternalLink,
  Pin,
  PinOff,
  ThumbsUp,
  ChevronDown,
  ChevronUp,
  Unlock,
  Quote,
  BookOpen,
  Link2,
} from "lucide-react";
import type { NormalizedPaper, PaperRelationship } from "@/types/papers";
import { useSearchSession } from "@/context/SearchSessionContext";
import EvidenceBadge from "@/components/common/EvidenceBadge";
import ConfidenceBadge from "@/components/common/ConfidenceBadge";
import MatchBreakdown from "@/components/common/MatchBreakdown";
import UserFeedbackModal from "@/components/modals/UserFeedbackModal";
import { QualityTier, EvidenceLevel, MatchBreakdown as MatchBreakdownType } from "@/server/search/types";

interface PaperCardProps {
  paper: NormalizedPaper & {
    matchScore?: number;
    confidenceScore?: number;
    tier?: QualityTier;
    evidenceLevel?: EvidenceLevel;
    matchBreakdown?: MatchBreakdownType;
    warnings?: string[];
    matchReason?: string;
    description?: string;
    whyMatches?: string[];
    paperRelationships?: { datasetId?: string; modelId?: string; summary?: string };
  };
  onOpenDetails?: (paper: NormalizedPaper) => void;
}

export default function PaperCard({ paper, onOpenDetails }: PaperCardProps) {
  const { isAssetPinned, togglePinAsset, query } = useSearchSession();
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [spansExpanded, setSpansExpanded] = useState(false);

  const title = paper.title || "Untitled Research Paper";
  const paperId = paper.id || title;
  const isPinned = isAssetPinned(paperId);
  const score = paper.relevanceScore ?? paper.matchScore ?? 50;
  const tier = paper.tier || (score >= 85 ? "Tier A" : score >= 70 ? "Tier B" : score >= 50 ? "Tier C" : "Tier D");

  const handlePin = () => {
    togglePinAsset({
      id: paperId,
      type: "paper",
      title,
      subtitle: `${paper.venue || "Academic"} · ${paper.year || ""}`,
      source: paper.venue || "Research Literature",
      score,
      badge: "Paper",
      url: paper.paperUrl || paper.pdfUrl || "",
      data: paper,
      pinnedAt: Date.now(),
    });
  };

  const authors =
    Array.isArray(paper.authors) && paper.authors.length > 0
      ? paper.authors.slice(0, 3).join(", ") + (paper.authors.length > 3 ? " et al." : "")
      : "Authors unstated";

  const year = paper.year || (paper.publicationDate ? paper.publicationDate.slice(0, 4) : "Recent");
  const venue = paper.venue || "Academic Index";
  const abstract = paper.tldr || paper.abstract || paper.description || "Abstract unavailable.";
  const citations = typeof paper.citationCount === "number" ? paper.citationCount.toLocaleString() : "0";

  const getRelBadge = (rel: PaperRelationship | string | undefined, paperType?: string) => {
    const val = (paperType || rel || "").toUpperCase();
    if (val.includes("DATASET") || val === "EXACT_DATASET") return { label: "EXACT DATASET", cls: "status-badge-emerald" };
    if (val.includes("MODEL") || val === "EXACT_MODEL") return { label: "EXACT MODEL", cls: "status-badge-cyan" };
    if (val === "DIRECTLY_RELATED") return { label: "DIRECTLY RELATED", cls: "status-badge-violet" };
    if (val.includes("BENCHMARK")) return { label: "BENCHMARK", cls: "status-badge-amber" };
    return { label: "LITERATURE", cls: "bg-card-subtle text-muted border-subtle" };
  };

  const relBadge = getRelBadge(paper.relationship, (paper as any).paper_type || (paper as any).paperType);

  const evidenceQuotes: string[] = [
    ...(paper.relationshipEvidence ? [paper.relationshipEvidence] : []),
    ...(paper.whyMatches || []),
    ...(Array.isArray(paper.whyRelevant) ? paper.whyRelevant : paper.whyRelevant ? [paper.whyRelevant] : []),
  ].filter(Boolean);

  return (
    <div
      className={`group rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-lab ${
        isPinned ? "obsidian-card border-accent bg-accent-subtle/40 shadow-accent-sm" : "obsidian-card-interactive"
      }`}
    >
      <div>
        {/* Top Metadata Strip */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border uppercase ${relBadge.cls}`}>
              {relBadge.label}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-secondary">
              {tier}
            </span>
            <EvidenceBadge level={paper.evidenceLevel || "SUPPORTED"} />
          </div>

          <div className="flex items-center gap-1.5">
            {paper.confidenceScore !== undefined && (
              <ConfidenceBadge score={paper.confidenceScore} showLabel={false} />
            )}
            <span className="text-[11px] font-mono font-semibold text-primary tabular-nums">{year}</span>
            <button
              type="button"
              onClick={handlePin}
              className={`text-[11px] px-2 py-1 rounded-lg border font-semibold transition-lab flex items-center gap-1 ${
                isPinned
                  ? "bg-accent text-slate-950 border-transparent font-bold"
                  : "bg-card-subtle text-muted border-subtle hover:text-primary hover:border-strong"
              }`}
              title={isPinned ? "Pinned to Benchmark Matrix" : "Pin paper"}
            >
              {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Title */}
        <h3
          onClick={() => onOpenDetails?.(paper)}
          className="text-sm sm:text-base font-bold text-primary mt-3 cursor-pointer group-hover:text-accent-from transition-colors line-clamp-2 leading-snug"
        >
          {title}
        </h3>

        {/* Authors & Venue */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] text-muted">
          <span className="text-secondary truncate max-w-[220px]">{authors}</span>
          <span className="text-faint">·</span>
          <span className="font-mono text-faint truncate max-w-[180px]" title={venue}>
            {venue}
          </span>
        </div>

        {/* Abstract Preview */}
        <div className="p-3 rounded-xl bg-page/70 border border-subtle mt-2.5">
          <p className="text-xs text-muted line-clamp-3 leading-relaxed">{abstract}</p>
        </div>

        {/* Citations, DOI / arXiv IDs & Relevance Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-[11px] font-mono">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-primary font-semibold tabular-nums">
              {citations} citations
            </span>
            {paper.doi && (
              <span className="px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-accent-from truncate max-w-[145px]" title={paper.doi}>
                DOI:{paper.doi}
              </span>
            )}
            {paper.arxivId && (
              <span className="px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-status-amber">
                arXiv:{paper.arxivId}
              </span>
            )}
            {paper.openAccess && (
              <span className="px-2 py-0.5 rounded-md status-badge-emerald border inline-flex items-center gap-1">
                <Unlock className="w-3 h-3" />
                OA
              </span>
            )}
          </div>

          <span className="px-2 py-0.5 rounded-md status-badge-cyan border font-bold tabular-nums">
            {score}% Relevance
          </span>
        </div>

        {/* Cross-Entity Relationship Note */}
        {paper.paperRelationships?.summary && (
          <div className="mt-2 px-2.5 py-1.5 rounded-lg border text-[11px] status-badge-cyan flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <span>{paper.paperRelationships.summary}</span>
          </div>
        )}

        {/* Expandable Anti-Hallucination Evidence Spans */}
        <div className="mt-3 pt-2.5 border-t border-subtle">
          <button
            type="button"
            onClick={() => setSpansExpanded((p) => !p)}
            className="w-full flex items-center justify-between text-[11px] text-secondary hover:text-primary transition-lab"
          >
            <span className="flex items-center gap-1.5 font-mono font-semibold text-status-emerald">
              <Quote className="w-3 h-3" />
              Anti-Hallucination Evidence Spans ({evidenceQuotes.length || 1})
            </span>
            {spansExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {spansExpanded && (
            <div className="mt-2 p-2.5 rounded-xl bg-page border border-emerald-500/20 space-y-2 text-[11px]">
              {evidenceQuotes.length > 0 ? (
                evidenceQuotes.map((q, idx) => (
                  <blockquote key={idx} className="pl-2.5 border-l-2 border-emerald-500/60 text-secondary leading-relaxed">
                    &ldquo;{q}&rdquo;
                  </blockquote>
                ))
              ) : (
                <blockquote className="pl-2.5 border-l-2 border-emerald-500/60 text-secondary leading-relaxed">
                  &ldquo;{abstract.slice(0, 220)}&rdquo;
                </blockquote>
              )}

              {/* Confidence Breakdown Bar */}
              <div className="pt-1.5 border-t border-subtle flex items-center justify-between gap-2 font-mono text-[10px]">
                <span className="text-faint">Metadata Proof Confidence</span>
                <div className="flex items-center gap-2 flex-1 max-w-[140px]">
                  <div className="flex-1 h-1.5 rounded-full bg-card-subtle overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full"
                      style={{ width: `${paper.confidenceScore ?? score}%` }}
                    />
                  </div>
                  <span className="text-status-emerald font-bold tabular-nums">
                    {paper.confidenceScore ?? score}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <MatchBreakdown
          breakdown={paper.matchBreakdown}
          evidence={[]}
          warnings={paper.warnings || []}
          matchReason={paper.matchReason || paper.relationshipEvidence || undefined}
          overallScore={score}
        />
      </div>

      {/* Footer Actions */}
      <div className="mt-3.5 pt-3 border-t border-subtle flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFeedbackModalOpen(true)}
            className="text-[11px] text-muted hover:text-primary px-2 py-1 rounded-lg hover:bg-card-subtle transition-lab flex items-center gap-1"
          >
            <ThumbsUp className="w-3 h-3" />
            <span>Feedback</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenDetails?.(paper)}
            className="text-[11px] font-semibold text-secondary hover:text-primary px-2 py-1 rounded-lg hover:bg-card-subtle transition-lab flex items-center gap-1"
          >
            <BookOpen className="w-3 h-3 text-accent-from" />
            <span>Inspect Paper</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {paper.pdfUrl && (
            <a
              href={paper.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-lg status-badge-rose border font-mono font-bold text-[11px] transition-lab flex items-center gap-1"
            >
              <FileText className="w-3 h-3" />
              PDF
            </a>
          )}
          {paper.paperUrl && (
            <a
              href={paper.paperUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-lg bg-card-subtle hover:bg-card-hover border border-subtle text-primary font-semibold text-[11px] transition-lab flex items-center gap-1"
            >
              <span>Source</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      <UserFeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        candidateId={paperId}
        candidateTitle={title}
        candidateType="paper"
        searchQuery={query}
      />
    </div>
  );
}
