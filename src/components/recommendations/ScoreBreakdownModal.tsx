"use client";

import React from "react";
import { X, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

type MatchLevel = "DIRECT_MATCH" | "STRONG_MATCH" | "PARTIAL_MATCH" | "WEAK_MATCH" | "NO_MATCH";

interface RequirementMatchDisplay {
  requirementId: string;
  status: "SATISFIED" | "PARTIAL" | "NOT_SATISFIED" | "UNKNOWN" | "CONFLICT";
  evidence: string | null;
  confidence: number;
  explanation: string;
}

interface ScoreBreakdownProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  score: number;
  matchLevel?: MatchLevel;
  matchLevelExplanation?: string;
  breakdown?: {
    semantic?: number;
    task?: number;
    domain?: number;
    modality?: number;
    constraints?: number;
    research?: number;
    benchmark?: number;
    requirementCoverage?: number;
    hardConstraintScore?: number;
    technicalCompatibility?: number;
    [key: string]: number | undefined;
  };
  requirementMatches?: RequirementMatchDisplay[];
  satisfiedRequirements?: string[];
  missingRequirements?: string[];
  unknownRequirements?: string[];
  conflictingRequirements?: string[];
  scoringTrace?: {
    crossEncoderContribution?: number;
    requirementContribution?: number;
    technicalContribution?: number;
    rawBeforeCap?: number;
    appliedCap?: number | null;
    capReason?: string | null;
  };
  why?: string[];
  warnings?: string[];
}

export default function ScoreBreakdownModal({
  isOpen,
  onClose,
  title,
  score,
  matchLevel,
  matchLevelExplanation,
  breakdown,
  requirementMatches,
  satisfiedRequirements = [],
  missingRequirements = [],
  unknownRequirements = [],
  conflictingRequirements = [],
  scoringTrace,
  why = [],
  warnings = [],
}: ScoreBreakdownProps) {
  if (!isOpen) return null;

  const hasRequirements = (requirementMatches?.length ?? 0) > 0;
  const coreBars = [
    breakdown?.requirementCoverage != null
      ? { label: "Requirement Coverage", value: breakdown.requirementCoverage, color: "bg-sky-400" }
      : null,
    breakdown?.hardConstraintScore != null
      ? {
          label: "Hard Constraint Guard",
          value: breakdown.hardConstraintScore,
          color:
            breakdown.hardConstraintScore < 50
              ? "bg-rose-500"
              : breakdown.hardConstraintScore < 80
              ? "bg-amber-400"
              : "bg-emerald-400",
        }
      : null,
    breakdown?.technicalCompatibility != null
      ? { label: "Technical Compatibility", value: breakdown.technicalCompatibility, color: "bg-cyan-400" }
      : null,
    { label: "Semantic Relevance", value: breakdown?.semantic ?? breakdown?.domain ?? 75, color: "bg-violet-400" },
    { label: "Task Alignment", value: breakdown?.task ?? 80, color: "bg-sky-500" },
  ].filter(Boolean) as { label: string; value: number; color: string }[];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl obsidian-card border border-strong shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-subtle flex items-center justify-between bg-page/50">
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent-from">
              Match Calibration Audit
            </div>
            <div className="text-sm font-bold text-primary mt-0.5 truncate">{title}</div>
            {matchLevelExplanation && (
              <div className="text-[11px] text-muted mt-0.5 line-clamp-2">{matchLevelExplanation}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-card-subtle hover:bg-card-hover border border-subtle text-muted hover:text-primary flex items-center justify-center shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <div className="flex items-center gap-3.5">
            <div className="flex flex-col items-center justify-center w-16 h-16 rounded-xl bg-page border border-subtle shrink-0 font-mono">
              <span className="text-2xl font-black text-primary tabular-nums">{score}</span>
              <span className="text-[9px] text-faint">/100</span>
            </div>
            <div className="space-y-1">
              {matchLevel && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border status-badge-cyan">
                  {matchLevel.replace(/_/g, " ")}
                </span>
              )}
              <div className="text-[11px] font-mono text-muted">
                {hasRequirements
                  ? `${satisfiedRequirements.length} satisfied · ${missingRequirements.length} missing · ${unknownRequirements.length} unknown`
                  : "Semantic + modality + domain weighted score"}
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-faint">
              Dimension Weights
            </div>
            {coreBars.map((bar, i) => (
              <div key={i}>
                <div className="flex justify-between items-center mb-1 text-xs">
                  <span className="text-secondary">{bar.label}</span>
                  <span className="font-mono font-bold text-primary tabular-nums">{bar.value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-page border border-subtle overflow-hidden">
                  <div
                    className={`h-full rounded-full ${bar.color}`}
                    style={{ width: `${Math.min(100, Math.max(0, bar.value))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {hasRequirements && (
            <div className="space-y-2">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-faint">
                Requirement Breakdown
              </div>
              <div className="space-y-1.5">
                {requirementMatches!.map((m) => (
                  <div key={m.requirementId} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-page border border-subtle">
                    {m.status === "SATISFIED" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-status-emerald shrink-0 mt-0.5" />
                    ) : m.status === "NOT_SATISFIED" || m.status === "CONFLICT" ? (
                      <XCircle className="w-3.5 h-3.5 text-status-rose shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-status-amber shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-primary">
                        {m.requirementId.replace(/^req_/, "").replace(/_/g, " ")}
                      </div>
                      <div className="text-[11px] text-muted">{m.explanation}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {conflictingRequirements.length > 0 && (
            <div className="p-3 rounded-xl status-badge-rose border space-y-1">
              <div className="text-xs font-bold">Domain Conflicts</div>
              {conflictingRequirements.map((c, i) => (
                <div key={i} className="text-xs">{c}</div>
              ))}
            </div>
          )}

          {scoringTrace && (
            <div className="p-3 rounded-xl bg-page border border-subtle font-mono text-[11px] text-muted space-y-0.5">
              <div className="text-[10px] uppercase text-faint mb-1">Scoring Trace</div>
              {scoringTrace.crossEncoderContribution != null && (
                <div>Retrieval Weight: {scoringTrace.crossEncoderContribution}</div>
              )}
              {scoringTrace.requirementContribution != null && (
                <div>Requirements Weight: {scoringTrace.requirementContribution}</div>
              )}
              {scoringTrace.technicalContribution != null && (
                <div>Technical Fit: {scoringTrace.technicalContribution}</div>
              )}
              {scoringTrace.appliedCap != null && (
                <div className="text-status-amber">
                  Cap Enforced: {scoringTrace.appliedCap} ({scoringTrace.capReason})
                </div>
              )}
            </div>
          )}

          {why.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-status-emerald">
                Verified Matching Evidence
              </div>
              {why.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-secondary">
                  <CheckCircle2 className="w-3.5 h-3.5 text-status-emerald shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-status-amber">
                Considerations
              </div>
              {warnings.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-secondary">
                  <AlertTriangle className="w-3.5 h-3.5 text-status-amber shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-subtle flex justify-end bg-page/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-card-subtle hover:bg-card-hover border border-subtle text-xs font-semibold text-primary transition-lab"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
