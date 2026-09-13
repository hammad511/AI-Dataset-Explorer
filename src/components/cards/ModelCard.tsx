"use client";

import React, { useState } from "react";
import { useSearchSession } from "@/context/SearchSessionContext";
import EvidenceBadge from "@/components/common/EvidenceBadge";
import ConfidenceBadge from "@/components/common/ConfidenceBadge";
import MatchBreakdown from "@/components/common/MatchBreakdown";
import UserFeedbackModal from "@/components/modals/UserFeedbackModal";
import ScoreBreakdownModal from "@/components/recommendations/ScoreBreakdownModal";
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
    isPretrainedCheckpointVerified?: boolean;
    checkpointStatusLabel?: string;
    isArchitecturalBaseline?: boolean;
    badge?: string;
    helperSubtitle?: string;
    matchCategory?: 'EXACT_MATCH' | 'PARTIAL_MATCH' | 'RELATED_RESOURCE' | 'UNVERIFIED_FALLBACK';
    whyMatches?: string[];
    verifiedClaims?: string[];
    unverifiedClaims?: string[];
    potentialLimitations?: string[];
    samplingCompatibilityVerified?: boolean;
    samplingCompatibilityNote?: string;
    matchLevel?: 'DIRECT_MATCH' | 'STRONG_MATCH' | 'PARTIAL_MATCH' | 'WEAK_MATCH' | 'NO_MATCH';
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
    const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
    const [breakdownModalOpen, setBreakdownModalOpen] = useState(false);

    const title = model.name || model.id || "Hugging Face Model";
    const score = model.matchScore ?? model.relevanceScore ?? 75;
    const task = model.task || model.pipelineTag || model.pipeline || "Machine Learning";
    const architecture = model.architecture || "Pretrained Transformer";
    const description = model.description || model.matchReason || "Open-source pretrained model weights available for inference and fine-tuning.";
    const modelId = model.id || model.name || title;
    const isPinned = isAssetPinned(modelId);
    const tier = model.tier || (score >= 85 ? "Tier A" : score >= 70 ? "Tier B" : score >= 50 ? "Tier C" : "Tier D");

    const handlePin = () => {
        togglePinAsset({
            id: modelId,
            type: 'model',
            title,
            subtitle: `${architecture} · ${task}`,
            source: 'Hugging Face',
            score,
            badge: 'Model',
            url: model.url,
            data: model,
            pinnedAt: Date.now(),
        });
    };

    const getScoreBadgeClass = () => {
        if (model.matchLevel === 'DIRECT_MATCH') return 'status-badge-emerald';
        if (model.matchLevel === 'STRONG_MATCH') return 'status-badge-cyan';
        if (model.matchLevel === 'PARTIAL_MATCH') return 'status-badge-amber';
        if (model.matchLevel === 'WEAK_MATCH') return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40';
        if (model.matchLevel === 'NO_MATCH') return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
        return 'status-badge-cyan';
    };

    const getTierBadgeClass = (t: QualityTier) => {
        if (t === "Tier A") return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
        if (t === "Tier B") return "bg-cyan-500/20 text-cyan-400 border-cyan-500/40";
        if (t === "Tier C") return "bg-amber-500/20 text-amber-400 border-amber-500/40";
        return "bg-zinc-500/20 text-zinc-400 border-zinc-500/40";
    };

    return (
        <div className={`group rounded-2xl border p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-md ${
            isPinned
                ? "border-accent bg-accent-subtle/30 shadow-sm"
                : "border-subtle bg-card hover:bg-card-hover hover:border-strong"
        }`}>
            <div>
                {/* Header row */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wide flex items-center gap-1 status-badge-violet">
                            <span>🤗</span> Hugging Face
                        </span>

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getTierBadgeClass(tier)}`}>
                            {tier}
                        </span>

                        <EvidenceBadge level={model.evidenceLevel} />
                    </div>

                    <div className="flex items-center gap-2">
                        {!(model.isArchitecturalBaseline || model.matchCategory === 'UNVERIFIED_FALLBACK') && (
                            <ConfidenceBadge score={model.confidenceScore} showLabel={false} />
                        )}

                        {model.isArchitecturalBaseline || model.matchCategory === 'UNVERIFIED_FALLBACK' ? (
                            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30">
                                Unverified Fallback Suggestion
                            </span>
                        ) : (
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${getScoreBadgeClass()}`}>
                                {model.matchLevel
                                    ? `${model.matchLevel.replace(/_/g, ' ')} • ${score}`
                                    : `${score}/100 Match`}
                            </span>
                        )}

                        <button
                            type="button"
                            onClick={handlePin}
                            className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold transition-all duration-200 flex items-center gap-1 ${
                                isPinned
                                    ? "bg-accent text-white shadow-accent-sm border-transparent"
                                    : "bg-card-subtle text-muted border-subtle hover:text-primary hover:border-strong"
                            }`}
                            title={isPinned ? "Pinned to Benchmark Lab (click to unpin)" : "Pin to Benchmark Lab matrix"}
                        >
                            <span>{isPinned ? "✓ Pinned" : "📌 Pin"}</span>
                        </button>
                    </div>
                </div>

                {/* Model Title */}
                <h3 className="text-base font-bold text-primary mt-3 group-hover:text-accent transition-colors truncate" title={title}>
                    {title}
                </h3>

                {/* Architecture & Task info */}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs text-secondary">
                        Arch: <strong className="text-status-emerald">{architecture}</strong>
                    </span>
                    <span className="text-xs text-faint">·</span>
                    <span className="text-xs text-muted truncate max-w-[160px]">
                        {task}
                    </span>
                </div>

                {/* Checkpoint Status Banner (Zero-Fabrication Transparency) */}
                {model.checkpointStatusLabel && (
                    <div className="mt-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border-amber-500/30">
                        <span>⚠️</span>
                        <span>{model.checkpointStatusLabel}</span>
                    </div>
                )}

                {/* Enclosed Description Box */}
                <div className="p-3 rounded-xl bg-card-subtle border border-subtle mt-2.5 shadow-xs">
                    <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                        {description}
                    </p>
                </div>

                {/* Verification Checklist */}
                {((model.whyMatches && model.whyMatches.length > 0) || (model.unverifiedClaims && model.unverifiedClaims.length > 0)) && (
                    <div className="mt-2.5 p-2.5 rounded-lg bg-card-subtle/50 border border-subtle/60 text-[11px] space-y-1.5">
                        {model.whyMatches && model.whyMatches.slice(0, 2).map((why, idx) => (
                            <div key={idx} className="flex items-start gap-1.5 text-emerald-400">
                                <span className="text-[10px] mt-0.5">✓</span>
                                <span className="leading-tight">{why}</span>
                            </div>
                        ))}
                        {model.unverifiedClaims && model.unverifiedClaims.slice(0, 2).map((unv, idx) => (
                            <div key={idx} className="flex items-start gap-1.5 text-amber-400">
                                <span className="text-[10px] mt-0.5">!</span>
                                <span className="leading-tight">{unv}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Downloads & Framework if available */}
                <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
                    {model.framework && (
                        <span className="px-2.5 py-1 rounded-lg bg-card-subtle border border-subtle text-secondary font-medium">
                            {model.framework}
                        </span>
                    )}
                    {typeof model.downloads === "number" && model.downloads > 0 && (
                        <span className="px-2.5 py-1 rounded-lg bg-card-subtle border border-subtle text-secondary font-medium">
                            📥 {model.downloads.toLocaleString()}
                        </span>
                    )}
                </div>

                {/* Expandable Match Breakdown */}
                <MatchBreakdown
                    breakdown={model.matchBreakdown}
                    evidence={model.evidence}
                    warnings={model.warnings}
                    matchReason={model.matchReason}
                    rejectionReason={model.rejectionReason}
                    overallScore={score}
                />
            </div>

            {/* Bottom link & Feedback */}
            <div className="mt-4 pt-3 border-t border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setFeedbackModalOpen(true)}
                        className="text-xs text-muted hover:text-primary transition flex items-center gap-1 px-2 py-1 rounded hover:bg-card-subtle"
                        title="Rate relevance of this search result"
                    >
                        <span>👍/👎</span>
                        <span className="text-[11px]">Feedback</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setBreakdownModalOpen(true)}
                        className="text-xs text-accent hover:text-accent-hover transition flex items-center gap-1 px-2 py-1 rounded hover:bg-card-subtle font-bold"
                        title="View calibrated multi-factor score breakdown"
                    >
                        <span>📊</span>
                        <span className="text-[11px]">Score Breakdown</span>
                    </button>
                </div>

                {model.url && (
                    <a
                        href={model.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-card-subtle hover:bg-card border border-subtle hover:border-strong text-primary transition flex items-center gap-1 group/link"
                    >
                        <span>Model Card</span>
                        <span className="group-hover/link:translate-x-0.5 transition-transform">↗</span>
                    </a>
                )}
            </div>

            {/* Score Breakdown Modal */}
            <ScoreBreakdownModal
                isOpen={breakdownModalOpen}
                onClose={() => setBreakdownModalOpen(false)}
                title={title}
                score={score}
                breakdown={model.scoreBreakdown}
                why={model.whyMatches || (model.evidence ? model.evidence.map(e => e.claim) : [])}
                warnings={model.warnings || []}
            />

            {/* User Feedback Modal */}
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
