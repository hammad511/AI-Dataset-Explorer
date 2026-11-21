"use client";

import React from "react";
import { Shield } from "lucide-react";

export interface ConfidenceBadgeProps {
  score?: number;
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceBadge({ score, showLabel = true, className = "" }: ConfidenceBadgeProps) {
  if (score === undefined) return null;
  let colorClass = "status-badge-emerald";
  if (score < 60) {
    colorClass = "status-badge-amber";
  } else if (score < 80) {
    colorClass = "status-badge-cyan";
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold tabular-nums border ${colorClass} ${className}`}
      title={`Epistemic Confidence: ${score}%`}
    >
      <Shield className="w-3 h-3 shrink-0 opacity-85" />
      <span>{score}%</span>
      {showLabel && <span className="opacity-75 font-normal">Conf</span>}
    </span>
  );
}

export default ConfidenceBadge;
