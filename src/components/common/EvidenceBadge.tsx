"use client";

import React from "react";
import { ShieldCheck, CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";

export interface EvidenceBadgeProps {
  level?: string;
  sourcesCount?: number;
  showTooltip?: boolean;
  className?: string;
}

export function EvidenceBadge({
  level = "SUPPORTED",
  sourcesCount,
  showTooltip = true,
  className = "",
}: EvidenceBadgeProps) {
  const norm = (level || "SUPPORTED").toUpperCase();

  let badgeClass = "status-badge-emerald";
  let Icon = ShieldCheck;
  let label = "VERIFIED";
  let desc = "Anatomy, modality, and task directly supported by source metadata.";

  if (norm === "VERIFIED") {
    badgeClass = "status-badge-emerald";
    Icon = ShieldCheck;
    label = "VERIFIED";
    desc = "All requested constraints directly supported by primary metadata.";
  } else if (norm === "SUPPORTED" || norm === "HIGH_RELEVANCE" || norm === "PEER_REVIEWED") {
    badgeClass = "status-badge-cyan";
    Icon = CheckCircle2;
    label = norm === "PEER_REVIEWED" ? "PEER REVIEWED" : "SUPPORTED";
    desc = "Primary constraints verified from repository metadata.";
  } else if (norm === "PARTIAL" || norm === "PROVISIONAL") {
    badgeClass = "status-badge-amber";
    Icon = AlertCircle;
    label = "PARTIAL";
    desc = "Some constraints verified; secondary attributes unverified.";
  } else {
    badgeClass = "bg-card-subtle text-muted border-subtle";
    Icon = HelpCircle;
    label = "UNVERIFIED";
    desc = "Semantically related; key constraint metadata unverified.";
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border tracking-wide uppercase ${badgeClass} ${className}`}
      title={showTooltip ? desc : undefined}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span>{label}</span>
      {typeof sourcesCount === "number" && sourcesCount > 0 && (
        <span className="opacity-75 font-normal tabular-nums">({sourcesCount})</span>
      )}
    </span>
  );
}

export default EvidenceBadge;
