"use client";

import React, { useState } from "react";
import {
  Pin,
  PinOff,
  ExternalLink,
  BarChart3,
  ThumbsUp,
  Database,
  HardDrive,
  Download,
  SlidersHorizontal,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useSearchSession } from "@/context/SearchSessionContext";
import EvidenceBadge from "@/components/common/EvidenceBadge";
import ConfidenceBadge from "@/components/common/ConfidenceBadge";
import MatchBreakdown from "@/components/common/MatchBreakdown";
import UserFeedbackModal from "@/components/modals/UserFeedbackModal";
import ScoreBreakdownModal from "@/components/recommendations/ScoreBreakdownModal";
import { MatchBreakdown as MatchBreakdownType, EvidenceItem, QualityTier, EvidenceLevel } from "@/server/search/types";
import { extractExplicitModality } from "@/server/search/modalityParser";

export interface DatasetItem {
  id: string;
  name: string;
  title?: string;
  subtitle?: string;
  description?: string;
  url: string;
  creator?: string;
  creatorName?: string;
  ref?: string;
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
  license?: string;
  sizeBytes?: number | null;
  datasetSize?: number | null;
  source?: string;
  matchReason?: string;
  rejected?: boolean;
  rejectionReason?: string | null;
  downloads?: number | null;
  tags?: string[];
  modality?: string;
  task?: string;
  formats?: string[];
  matchCategory?: "EXACT_MATCH" | "PARTIAL_MATCH" | "RELATED_RESOURCE";
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
  usabilityRating?: number | string;
}

interface DatasetCardProps {
  dataset: DatasetItem;
  isCompared?: boolean;
  onToggleCompare?: (id: string) => void;
  onOpenDetails?: (dataset: DatasetItem) => void;
}

export function isCommercialSafeLicense(license?: string): boolean {
  if (!license) return false;
  return /mit|apache|bsd|cc0|cc-by(?!-nc)|isc|public domain/i.test(license);
}

export default function DatasetCard({
  dataset,
  isCompared = false,
  onToggleCompare,
  onOpenDetails,
}: DatasetCardProps) {
  const { isAssetPinned, togglePinAsset, query } = useSearchSession();
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [breakdownModalOpen, setBreakdownModalOpen] = useState(false);

  const title = dataset.title || dataset.name || dataset.id || "Unnamed Dataset";
  const description = dataset.subtitle || dataset.description || "No description provided.";
  const score = dataset.matchScore ?? dataset.relevanceScore ?? 0;
  const source = (dataset.source || "Dataset").toLowerCase();
  const isKaggle = source.includes("kaggle");
  const datasetId = dataset.id || dataset.ref || dataset.name;
  const isPinnedInSession = isAssetPinned(datasetId) || isCompared;
  const tier = dataset.tier || (score >= 85 ? "Tier A" : score >= 70 ? "Tier B" : score >= 50 ? "Tier C" : "Tier D");

  const handlePinToggle = () => {
    if (onToggleCompare) {
      onToggleCompare(datasetId);
    }
    togglePinAsset({
      id: datasetId,
      type: "dataset",
      title,
      subtitle: dataset.subtitle || dataset.modality,
      source: dataset.source || (isKaggle ? "Kaggle" : "Hugging Face"),
      score,
      badge: "Dataset",
      url: dataset.url,
      data: dataset,
      pinnedAt: Date.now(),
    });
  };

  const formatSize = (bytes?: number | null) => {
    if (!bytes || bytes === 0) return "Size unstated";
    const mb = bytes / (1024 * 1024);
    if (mb < 1000) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  };

  const getScoreBadgeClass = (s: number) => {
    if (dataset.matchLevel === "DIRECT_MATCH" || s >= 85) return "status-badge-emerald";
    if (dataset.matchLevel === "STRONG_MATCH" || s >= 70) return "status-badge-cyan";
    if (dataset.matchLevel === "PARTIAL_MATCH" || s >= 50) return "status-badge-amber";
    return "status-badge-rose";
  };

  const explicitModality =
    dataset.modality && dataset.modality !== "General" && dataset.modality !== "unknown"
      ? dataset.modality
      : extractExplicitModality(title, description, dataset.tags || [], dataset.formats || []);

  const commercialSafe = isCommercialSafeLicense(dataset.license);

  return (
    <div
      className={`group rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-lab ${
        dataset.rejected
          ? "obsidian-card border-rose-500/30 bg-rose-500/[0.04] opacity-85"
          : isPinnedInSession
          ? "obsidian-card border-accent bg-accent-subtle/40 shadow-accent-sm"
          : "obsidian-card-interactive"
      }`}
    >
      <div>
        {/* Top Metadata Strip */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border uppercase ${
                isKaggle ? "status-badge-blue" : "status-badge-amber"
              }`}
            >
              {isKaggle ? "Kaggle" : "Hugging Face"}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-secondary">
              {tier}
            </span>
            <EvidenceBadge level={dataset.evidenceLevel} />
          </div>

          <div className="flex items-center gap-1.5">
            <ConfidenceBadge score={dataset.confidenceScore} showLabel={false} />
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border tabular-nums ${getScoreBadgeClass(score)}`}>
              {score}/100
            </span>
            <button
              type="button"
              onClick={handlePinToggle}
              className={`text-[11px] px-2 py-1 rounded-lg border font-semibold transition-lab flex items-center gap-1 ${
                isPinnedInSession
                  ? "bg-accent text-slate-950 border-transparent font-bold"
                  : "bg-card-subtle text-muted border-subtle hover:text-primary hover:border-strong"
              }`}
              title={isPinnedInSession ? "Pinned to Benchmark Lab" : "Pin to Benchmark Lab"}
            >
              {isPinnedInSession ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
              <span>{isPinnedInSession ? "Pinned" : "Pin"}</span>
            </button>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm sm:text-base font-bold text-primary mt-3 group-hover:text-accent-from transition-colors line-clamp-1">
          {title}
        </h3>

        {/* Description Box */}
        <div className="p-3 rounded-xl bg-page/70 border border-subtle mt-2">
          <p className="text-xs text-muted line-clamp-2 leading-relaxed">{description}</p>
        </div>

        {/* Dense Telemetry Badges */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3 text-[11px] font-mono">
          <span className="px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-secondary inline-flex items-center gap-1">
            <Database className="w-3 h-3 text-accent-from" />
            {explicitModality}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-secondary inline-flex items-center gap-1 tabular-nums">
            <HardDrive className="w-3 h-3 text-muted" />
            {formatSize(dataset.sizeBytes || dataset.datasetSize)}
          </span>
          {dataset.license && (
            <span
              className={`px-2 py-0.5 rounded-md border inline-flex items-center gap-1 truncate max-w-[160px] ${
                commercialSafe ? "status-badge-emerald" : "bg-card-subtle border-subtle text-secondary"
              }`}
              title={dataset.license}
            >
              <ShieldCheck className="w-3 h-3 shrink-0" />
              <span className="truncate">{dataset.license}</span>
            </span>
          )}
          {typeof dataset.downloads === "number" && dataset.downloads > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-secondary inline-flex items-center gap-1 tabular-nums">
              <Download className="w-3 h-3 text-muted" />
              {dataset.downloads.toLocaleString()}
            </span>
          )}
        </div>

        {/* Verified & Risk Bullets */}
        {((dataset.whyMatches && dataset.whyMatches.length > 0) ||
          (dataset.unverifiedClaims && dataset.unverifiedClaims.length > 0) ||
          dataset.samplingCompatibilityNote) && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-page/50 border border-subtle text-[11px] space-y-1">
            {dataset.whyMatches?.slice(0, 2).map((why, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-status-emerald">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="leading-snug">{why}</span>
              </div>
            ))}
            {dataset.unverifiedClaims?.slice(0, 2).map((unv, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-status-amber">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="leading-snug">{unv}</span>
              </div>
            ))}
            {dataset.samplingCompatibilityNote &&
              !dataset.unverifiedClaims?.includes(dataset.samplingCompatibilityNote) && (
                <div className="flex items-start gap-1.5 text-status-amber">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="leading-snug">{dataset.samplingCompatibilityNote}</span>
                </div>
              )}
          </div>
        )}

        <MatchBreakdown
          breakdown={dataset.matchBreakdown}
          evidence={dataset.evidence}
          warnings={dataset.warnings}
          matchReason={dataset.matchReason}
          rejectionReason={dataset.rejectionReason}
          overallScore={score}
        />
      </div>

      {/* Bottom Action Cluster */}
      <div className="mt-3.5 pt-3 border-t border-subtle flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFeedbackModalOpen(true)}
            className="text-[11px] text-muted hover:text-primary px-2 py-1 rounded-lg hover:bg-card-subtle transition-lab flex items-center gap-1"
            title="Rate relevance"
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

          {onOpenDetails && (
            <button
              type="button"
              onClick={() => onOpenDetails(dataset)}
              className="text-[11px] font-semibold text-secondary hover:text-primary px-2 py-1 rounded-lg hover:bg-card-subtle transition-lab flex items-center gap-1"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Schema</span>
            </button>
          )}
        </div>

        {dataset.url && (
          <a
            href={dataset.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-card-subtle hover:bg-card-hover border border-subtle hover:border-strong text-primary transition-lab flex items-center gap-1"
          >
            <span>Open Hub</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <ScoreBreakdownModal
        isOpen={breakdownModalOpen}
        onClose={() => setBreakdownModalOpen(false)}
        title={title}
        score={score}
        matchLevel={(dataset as any).matchLevel}
        matchLevelExplanation={(dataset as any).matchLevelExplanation}
        breakdown={{
          ...dataset.scoreBreakdown,
          requirementCoverage: (dataset as any).requirementCoverage,
          hardConstraintScore: (dataset as any).hardConstraintScore,
          technicalCompatibility: (dataset as any).technicalCompatibility,
          semantic: dataset.matchBreakdown?.semantic,
          task: dataset.matchBreakdown?.task,
          domain: dataset.matchBreakdown?.domain,
        }}
        requirementMatches={(dataset as any).requirementMatches}
        satisfiedRequirements={dataset.satisfiedRequirements}
        missingRequirements={dataset.missingRequirements}
        unknownRequirements={dataset.unknownRequirements}
        conflictingRequirements={(dataset as any).conflictingRequirements}
        scoringTrace={(dataset as any).scoringTrace}
        why={dataset.whyMatches || (dataset.evidence ? dataset.evidence.map((e) => e.claim) : [])}
        warnings={dataset.warnings || []}
      />

      <UserFeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        candidateId={datasetId}
        candidateTitle={title}
        candidateType="dataset"
        searchQuery={query}
      />
    </div>
  );
}
