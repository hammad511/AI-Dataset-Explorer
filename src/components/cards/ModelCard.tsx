"use client";

import React, { useState } from "react";
import {
  Cpu,
  Pin,
  PinOff,
  ExternalLink,
  BarChart3,
  ThumbsUp,
  Download,
  Heart,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useSearchSession } from "@/context/SearchSessionContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import EvidenceBadge from "@/components/common/EvidenceBadge";
import ConfidenceBadge from "@/components/common/ConfidenceBadge";
import MatchBreakdown from "@/components/common/MatchBreakdown";
import UserFeedbackModal from "@/components/modals/UserFeedbackModal";
import ScoreBreakdownModal from "@/components/recommendations/ScoreBreakdownModal";
import { parseParameterBillions, estimateModelVram } from "@/lib/workstation/vramEstimator";
import { MatchBreakdown as MatchBreakdownType, EvidenceItem, QualityTier, EvidenceLevel } from "@/server/search/types";

export interface ModelItem {
  id: string;
  name?: string;
  pipeline?: string;
  pipelineTag?: string;
  url: string;
  matchScore?: number;
  relevanceScore?: number;
  confidenceScore?: number;
  tier?: QualityTier;
  evidenceLevel?: EvidenceLevel;
  evidenceSources?: string[];
  evidenceStrength?: number;
  matchBreakdown?: MatchBreakdownType;
  evidence?: EvidenceItem[];
  warnings?: string[];
  scoreBreakdown?: any;
  architecture?: string;
  difficulty?: string;
  recommendation?: string;
  description?: string;
  matchReason?: string;
  rejected?: boolean;
  rejectionReason?: string | null;
  task?: string;
  downloads?: number | null;
  likes?: number | null;
  framework?: string;
  parameters?: string | number | null;
  paramsCount?: string;
  isPretrainedCheckpointVerified?: boolean;
  checkpointStatusLabel?: string;
  isArchitecturalBaseline?: boolean;
  badge?: string;
  helperSubtitle?: string;
  matchCategory?: "EXACT_MATCH" | "PARTIAL_MATCH" | "RELATED_RESOURCE" | "UNVERIFIED_FALLBACK";
  whyMatches?: string[];
  verifiedClaims?: string[];
  unverifiedClaims?: string[];
  potentialLimitations?: string[];
  samplingCompatibilityVerified?: boolean;
  samplingCompatibilityNote?: string;
  matchLevel?: "DIRECT_MATCH" | "STRONG_MATCH" | "PARTIAL_MATCH" | "WEAK_MATCH" | "NO_MATCH";
  matchLevelExplanation?: string;
  satisfiedRequirements?: string[];
  missingRequirements?: string[];
  unknownRequirements?: string[];
}

interface ModelCardProps {
  model: ModelItem;
}

export default function ModelCard({ model }: ModelCardProps) {
  const { isAssetPinned, togglePinAsset, query } = useSearchSession();
  const { gpuConstraintGb, askAssistant } = useWorkspace();
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [breakdownModalOpen, setBreakdownModalOpen] = useState(false);

  const title = model.name || model.id || "Hugging Face Model";
  const score = model.matchScore ?? model.relevanceScore ?? 75;
  const task = model.task || model.pipelineTag || model.pipeline || "Machine Learning";
  const architecture = model.architecture || "Pretrained Transformer";
  const description =
    model.description ||
    model.matchReason ||
    "Open-source pretrained model weights available for inference and fine-tuning.";
  const modelId = model.id || model.name || title;
  const isPinned = isAssetPinned(modelId);
  const tier = model.tier || (score >= 85 ? "Tier A" : score >= 70 ? "Tier B" : score >= 50 ? "Tier C" : "Tier D");

  const { display: paramDisplay } = parseParameterBillions(model);
  const vramEstimate = estimateModelVram(model, "QLoRA", gpuConstraintGb);

  const handlePin = () => {
    togglePinAsset({
      id: modelId,
      type: "model",
      title,
      subtitle: `${architecture} · ${task}`,
      source: "Hugging Face",
      score,
      badge: "Model",
      url: model.url,
      data: model,
      pinnedAt: Date.now(),
    });
  };

  const getScoreBadgeClass = () => {
    if (model.matchLevel === "DIRECT_MATCH" || score >= 85) return "status-badge-emerald";
    if (model.matchLevel === "STRONG_MATCH" || score >= 70) return "status-badge-cyan";
    if (model.matchLevel === "PARTIAL_MATCH" || score >= 50) return "status-badge-amber";
    return "status-badge-rose";
  };

  const isFallback = model.isArchitecturalBaseline || model.matchCategory === "UNVERIFIED_FALLBACK";

  return (
    <div
      className={`group rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-lab ${
        isPinned
          ? "obsidian-card border-accent bg-accent-subtle/40 shadow-accent-sm"
          : "obsidian-card-interactive"
      }`}
    >
      <div>
        {/* Top Row: Family, Tier, Evidence, Compatibility, Pin */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border uppercase status-badge-violet">
              {architecture.split(" ")[0] || "HF Hub"}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-secondary">
              {tier}
            </span>
            <EvidenceBadge level={model.evidenceLevel} />
          </div>

          <div className="flex items-center gap-1.5">
            {!isFallback && <ConfidenceBadge score={model.confidenceScore} showLabel={false} />}
            {isFallback ? (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border status-badge-amber">
                UNVERIFIED FALLBACK
              </span>
            ) : (
              <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border tabular-nums ${getScoreBadgeClass()}`}>
                {score}/100
              </span>
            )}
            <button
              type="button"
              onClick={handlePin}
              className={`text-[11px] px-2 py-1 rounded-lg border font-semibold transition-lab flex items-center gap-1 ${
                isPinned
                  ? "bg-accent text-slate-950 border-transparent font-bold"
                  : "bg-card-subtle text-muted border-subtle hover:text-primary hover:border-strong"
              }`}
              title={isPinned ? "Pinned to Benchmark Matrix" : "Pin to Benchmark Matrix"}
            >
              {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
              <span>{isPinned ? "Pinned" : "Pin"}</span>
            </button>
          </div>
        </div>

        {/* Model Name & Architecture */}
        <h3 className="text-sm sm:text-base font-bold text-primary mt-3 group-hover:text-accent-from transition-colors truncate" title={title}>
          {title}
        </h3>
        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted font-mono">
          <span className="text-status-emerald font-semibold">{architecture}</span>
          <span className="text-faint">·</span>
          <span className="truncate max-w-[180px]">{task}</span>
        </div>

        {model.checkpointStatusLabel && (
          <div className="mt-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 status-badge-amber">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{model.checkpointStatusLabel}</span>
          </div>
        )}

        {/* Description */}
        <div className="p-3 rounded-xl bg-page/70 border border-subtle mt-2.5">
          <p className="text-xs text-muted line-clamp-2 leading-relaxed">{description}</p>
        </div>

        {/* Engineering Telemetry Pills: Params, Downloads, Likes, QLoRA VRAM Fit */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3 text-[11px] font-mono">
          <span className="px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-primary font-semibold tabular-nums inline-flex items-center gap-1">
            <Cpu className="w-3 h-3 text-accent-from" />
            {paramDisplay} Params
          </span>
          <span
            className={`px-2 py-0.5 rounded-md border tabular-nums ${
              vramEstimate.fitStatus === "fits"
                ? "status-badge-emerald"
                : vramEstimate.fitStatus === "tight"
                ? "status-badge-amber"
                : "status-badge-rose"
            }`}
            title={vramEstimate.recommendation}
          >
            {vramEstimate.totalGb}GB QLoRA
          </span>
          {model.framework && (
            <span className="px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-secondary">
              {model.framework}
            </span>
          )}
          {typeof model.downloads === "number" && model.downloads > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-secondary inline-flex items-center gap-1 tabular-nums">
              <Download className="w-3 h-3 text-muted" />
              {model.downloads.toLocaleString()}
            </span>
          )}
          {typeof model.likes === "number" && model.likes > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-secondary inline-flex items-center gap-1 tabular-nums">
              <Heart className="w-3 h-3 text-rose-400" />
              {model.likes.toLocaleString()}
            </span>
          )}
        </div>

        {/* Verified Claims */}
        {((model.whyMatches && model.whyMatches.length > 0) ||
          (model.unverifiedClaims && model.unverifiedClaims.length > 0)) && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-page/50 border border-subtle text-[11px] space-y-1">
            {model.whyMatches?.slice(0, 2).map((why, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-status-emerald">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="leading-snug">{why}</span>
              </div>
            ))}
            {model.unverifiedClaims?.slice(0, 2).map((unv, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-status-amber">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="leading-snug">{unv}</span>
              </div>
            ))}
          </div>
        )}

        <MatchBreakdown
          breakdown={model.matchBreakdown}
          evidence={model.evidence}
          warnings={model.warnings}
          matchReason={model.matchReason}
          rejectionReason={model.rejectionReason}
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
            onClick={() => setBreakdownModalOpen(true)}
            className="text-[11px] text-accent-from hover:underline px-2 py-1 rounded-lg hover:bg-card-subtle transition-lab flex items-center gap-1 font-semibold"
          >
            <BarChart3 className="w-3 h-3" />
            <span>Breakdown</span>
          </button>

          <button
            type="button"
            onClick={() =>
              askAssistant(
                `Evaluate ${title} (${paramDisplay} params) for my ${gpuConstraintGb}GB GPU and generate optimal LoRA hyperparameters.`
              )
            }
            className="text-[11px] text-secondary hover:text-accent-from px-2 py-1 rounded-lg hover:bg-card-subtle transition-lab flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            <span>Tune</span>
          </button>
        </div>

        {model.url && (
          <a
            href={model.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-card-subtle hover:bg-card-hover border border-subtle hover:border-strong text-primary transition-lab flex items-center gap-1"
          >
            <span>Model Card</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <ScoreBreakdownModal
        isOpen={breakdownModalOpen}
        onClose={() => setBreakdownModalOpen(false)}
        title={title}
        score={score}
        breakdown={model.scoreBreakdown}
        why={model.whyMatches || (model.evidence ? model.evidence.map((e) => e.claim) : [])}
        warnings={model.warnings || []}
      />

      <UserFeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        candidateId={modelId}
        candidateTitle={title}
        candidateType="model"
        searchQuery={query}
      />
    </div>
  );
}
