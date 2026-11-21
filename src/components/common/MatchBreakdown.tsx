"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, Zap, CheckCircle2, FileText, AlertTriangle, XCircle } from "lucide-react";

export interface MatchBreakdownProps {
  breakdown?: any;
  evidence?: Array<{ claim: string; evidenceText: string }>;
  warnings?: string[];
  matchReason?: string;
  rejectionReason?: string | null;
  overallScore?: number;
  initialExpanded?: boolean;
}

export function MatchBreakdown({
  breakdown,
  evidence = [],
  warnings = [],
  matchReason,
  rejectionReason,
  overallScore = 85,
  initialExpanded = false,
}: MatchBreakdownProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const b = breakdown || {
    anatomy: 0,
    modality: 0,
    task: 0,
    dimension: 0,
    target: 0,
    domain: 0,
    semantic: 0,
    evidence: 0,
    metadata: 0,
    accessibility: 0,
    popularity: 0,
    overall: overallScore,
    confirmedClaims: [],
    warnings,
  };

  const dimensions = [
    { label: "Anatomy Alignment", score: b.anatomy ?? 0, weight: "25%" },
    { label: "Task Alignment", score: b.task ?? 0, weight: "18%" },
    { label: "Modality Alignment", score: b.modality ?? 0, weight: "15%" },
    { label: "Target / Labels", score: b.target ?? 0, weight: "10%" },
    { label: "Dimensionality", score: b.dimension ?? 0, weight: "8%" },
    { label: "Semantic Similarity", score: b.semantic ?? 0, weight: "8%" },
    { label: "Primary Evidence", score: b.evidence ?? 0, weight: "6%" },
    { label: "Metadata Quality", score: b.metadata ?? 0, weight: "4%" },
  ];

  const getScoreBarColor = (s: number) => {
    if (s >= 85) return "bg-emerald-400";
    if (s >= 65) return "bg-sky-400";
    if (s >= 40) return "bg-amber-400";
    return "bg-rose-500";
  };

  return (
    <div className="mt-3 border-t border-subtle pt-2.5 text-xs">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between py-1 text-muted hover:text-primary transition-lab font-medium text-left"
      >
        <span className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-accent-from" />
          <span className="font-semibold text-secondary">Verification &amp; Score Matrix</span>
          <span className="font-mono text-[10px] text-faint tabular-nums">
            ({b.overall ?? overallScore}/100)
          </span>
        </span>
        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {rejectionReason && (
        <div className="mt-2 p-2.5 rounded-xl status-badge-rose border text-[11px] flex items-start gap-2">
          <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold">Constraint Veto:</strong> {rejectionReason}
          </div>
        </div>
      )}

      {isExpanded && (
        <div className="mt-2.5 space-y-3 bg-page rounded-xl p-3 border border-subtle">
          {matchReason && (
            <div className="text-[11px] text-secondary border-b border-subtle pb-2 leading-relaxed">
              <span className="font-mono text-[10px] uppercase text-faint mr-1.5">Synthesis:</span>
              {matchReason}
            </div>
          )}

          <div className="space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-faint mb-1">
              Multi-Factor Weights
            </div>
            {dimensions.map((dim, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="text-muted w-36 truncate text-[11px]">
                  {dim.label} <span className="text-[9px] font-mono text-faint">({dim.weight})</span>
                </span>
                <div className="flex-1 h-1.5 bg-card rounded-full overflow-hidden border border-subtle max-w-[140px]">
                  <div
                    className={`h-full rounded-full transition-all ${getScoreBarColor(dim.score)}`}
                    style={{ width: `${Math.min(100, Math.max(0, dim.score))}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono font-semibold text-primary w-9 text-right tabular-nums">
                  {dim.score}%
                </span>
              </div>
            ))}
          </div>

          {b.confirmedClaims && b.confirmedClaims.length > 0 && (
            <div className="border-t border-subtle pt-2 space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-status-emerald flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Confirmed Claims
              </div>
              <ul className="space-y-0.5">
                {b.confirmedClaims.map((claim: string, idx: number) => (
                  <li key={idx} className="text-[11px] text-secondary flex items-start gap-1.5">
                    <span className="text-status-emerald">•</span>
                    <span>{claim}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {evidence.length > 0 && (
            <div className="border-t border-subtle pt-2 space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-accent-from flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Evidence Spans
              </div>
              {evidence.slice(0, 3).map((item, idx) => (
                <div key={idx} className="text-[11px] bg-card p-2 rounded-lg border border-subtle text-secondary">
                  <div className="font-semibold text-primary">{item.claim}</div>
                  <div className="font-mono text-[10px] text-muted truncate mt-0.5">{item.evidenceText}</div>
                </div>
              ))}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="border-t border-subtle pt-2 space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-status-amber flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Constraints &amp; Risks
              </div>
              <ul className="space-y-0.5">
                {warnings.map((warn, idx) => (
                  <li key={idx} className="text-[11px] text-amber-300/90 flex items-start gap-1.5">
                    <span>•</span>
                    <span>{warn}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MatchBreakdown;
