"use client";

import React, { useState, useMemo } from "react";
import { Cpu, Sparkles, CheckCircle2, AlertTriangle, XOctagon, Layers } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  estimateModelVram,
  type PrecisionMode,
  type GpuVramCapacity,
} from "@/lib/workstation/vramEstimator";

interface TrainabilityVramCardProps {
  model: any | null;
  allModels?: any[];
  onSelectModel?: (model: any) => void;
}

const PRECISION_OPTIONS: Array<{ id: PrecisionMode; label: string; hint: string }> = [
  { id: "FP16", label: "FP16 Full", hint: "Full parameter fine-tune" },
  { id: "LoRA", label: "LoRA (16-bit)", hint: "Low-rank adapters" },
  { id: "QLoRA", label: "4-bit QLoRA", hint: "NF4 quantized base + LoRA" },
];

const GPU_OPTIONS: Array<{ gb: GpuVramCapacity; label: string }> = [
  { gb: 8, label: "8GB T4/RTX" },
  { gb: 16, label: "16GB V100/T4" },
  { gb: 24, label: "24GB A10G/3090" },
  { gb: 80, label: "80GB A100/H100" },
];

export default function TrainabilityVramCard({
  model,
  allModels = [],
  onSelectModel,
}: TrainabilityVramCardProps) {
  const { gpuConstraintGb, setGpuConstraintGb, askAssistant } = useWorkspace();
  const [precision, setPrecision] = useState<PrecisionMode>("QLoRA");

  const targetModel = model || allModels[0] || null;

  const breakdown = useMemo(() => {
    return estimateModelVram(targetModel, precision, gpuConstraintGb);
  }, [targetModel, precision, gpuConstraintGb]);

  const totalBarBasis = Math.max(breakdown.totalGb, breakdown.gpuCapacityGb);
  const weightsPct = Math.min(100, (breakdown.weightsGb / totalBarBasis) * 100);
  const optimizerPct = Math.min(100 - weightsPct, (breakdown.optimizerGb / totalBarBasis) * 100);
  const gradientsPct = Math.min(100 - weightsPct - optimizerPct, (breakdown.gradientsGb / totalBarBasis) * 100);
  const activationsPct = Math.min(
    100 - weightsPct - optimizerPct - gradientsPct,
    (breakdown.activationsGb / totalBarBasis) * 100
  );
  const gpuLimitMarkerPct = Math.min(100, (breakdown.gpuCapacityGb / totalBarBasis) * 100);

  const statusStyles =
    breakdown.fitStatus === "fits"
      ? {
          badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
          accent: "text-emerald-400",
        }
      : breakdown.fitStatus === "tight"
      ? {
          badge: "bg-amber-500/10 text-amber-400 border-amber-500/30",
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
          accent: "text-amber-400",
        }
      : {
          badge: "bg-rose-500/10 text-rose-400 border-rose-500/30",
          icon: <XOctagon className="w-3.5 h-3.5 text-rose-400" />,
          accent: "text-rose-400",
        };

  const segments = [
    { label: "Model Weights", value: breakdown.weightsGb, color: "bg-sky-400", dot: "bg-sky-400" },
    { label: "Optimizer States", value: breakdown.optimizerGb, color: "bg-indigo-400", dot: "bg-indigo-400" },
    { label: "Gradients", value: breakdown.gradientsGb, color: "bg-violet-400", dot: "bg-violet-400" },
    { label: "Activations", value: breakdown.activationsGb, color: "bg-emerald-400", dot: "bg-emerald-400" },
  ];

  const handleAskCopilotVram = () => {
    const modelName = targetModel?.name || targetModel?.id || "this top model";
    askAssistant(
      `Generate an exact ${precision} training configuration (bitsandbytes / LoRA rank / batch size / gradient accumulation) so ${modelName} (${breakdown.paramDisplay}) trains cleanly inside ${gpuConstraintGb}GB VRAM.`
    );
  };

  return (
    <div className="obsidian-card p-5 flex flex-col justify-between gap-4">
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-sky-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Trainability &amp; VRAM Estimator
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {allModels.length > 1 && onSelectModel ? (
              <select
                aria-label="Inspect model VRAM"
                value={targetModel?.id || targetModel?.name || ""}
                onChange={(e) => {
                  const found = allModels.find(
                    (m) => (m.id || m.name) === e.target.value
                  );
                  if (found) onSelectModel(found);
                }}
                className="bg-[#07090E] border border-white/10 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-100 focus:outline-none focus:border-sky-500/50 max-w-[220px] truncate"
              >
                {allModels.slice(0, 6).map((m, idx) => (
                  <option key={m.id || idx} value={m.id || m.name}>
                    {m.name || m.id}
                  </option>
                ))}
              </select>
            ) : (
              <h3 className="text-sm font-semibold text-slate-100 truncate max-w-[230px]">
                {targetModel?.name || targetModel?.id || "Baseline Estimator"}
              </h3>
            )}
            <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/10 font-mono text-[11px] text-sky-300 tabular-nums">
              {breakdown.paramDisplay} params
            </span>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusStyles.badge}`}
        >
          {statusStyles.icon}
          {breakdown.statusLabel}
        </span>
      </div>

      {/* Controls: Precision Switcher + Target GPU selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
            <Layers className="w-3 h-3" /> Precision Mode
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#07090E] border border-white/[0.07]">
            {PRECISION_OPTIONS.map((opt) => {
              const active = precision === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPrecision(opt.id)}
                  title={opt.hint}
                  className={`px-2 py-1.5 rounded-md text-[11px] font-medium transition-lab cursor-pointer ${
                    active
                      ? "bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 border border-transparent"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Target Hardware Budget
          </div>
          <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#07090E] border border-white/[0.07]">
            {GPU_OPTIONS.map((g) => {
              const active = gpuConstraintGb === g.gb;
              return (
                <button
                  key={g.gb}
                  type="button"
                  onClick={() => setGpuConstraintGb(g.gb)}
                  title={g.label}
                  className={`px-1.5 py-1.5 rounded-md font-mono text-[11px] font-semibold tabular-nums transition-lab cursor-pointer ${
                    active
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "text-slate-400 hover:text-slate-200 border border-transparent"
                  }`}
                >
                  {g.gb}G
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stacked Horizontal Memory Bar */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-slate-400">Estimated Peak Training Memory</span>
          <div className="font-mono tabular-nums flex items-baseline gap-1.5">
            <span className={`text-sm font-bold ${statusStyles.accent}`}>
              {breakdown.totalGb.toFixed(1)} GB
            </span>
            <span className="text-slate-500">/ {breakdown.gpuCapacityGb} GB</span>
            <span className="text-[11px] text-slate-400">({breakdown.utilizationPct}%)</span>
          </div>
        </div>

        <div className="relative h-3.5 w-full rounded-full bg-[#07090E] border border-white/10 overflow-hidden flex">
          <div
            style={{ width: `${weightsPct}%` }}
            className="h-full bg-sky-400 transition-all duration-300"
            title={`Model Weights: ${breakdown.weightsGb} GB`}
          />
          <div
            style={{ width: `${optimizerPct}%` }}
            className="h-full bg-indigo-400 transition-all duration-300"
            title={`Optimizer States: ${breakdown.optimizerGb} GB`}
          />
          <div
            style={{ width: `${gradientsPct}%` }}
            className="h-full bg-violet-400 transition-all duration-300"
            title={`Gradients: ${breakdown.gradientsGb} GB`}
          />
          <div
            style={{ width: `${activationsPct}%` }}
            className="h-full bg-emerald-400 transition-all duration-300"
            title={`Activations: ${breakdown.activationsGb} GB`}
          />
          {/* GPU capacity marker line when total exceeds capacity */}
          {breakdown.totalGb > breakdown.gpuCapacityGb && (
            <div
              style={{ left: `${gpuLimitMarkerPct}%` }}
              className="absolute top-0 bottom-0 w-0.5 bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.9)]"
              title={`GPU Ceiling: ${breakdown.gpuCapacityGb} GB`}
            />
          )}
        </div>

        {/* Memory Component Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {segments.map((seg) => (
            <div
              key={seg.label}
              className="flex items-center justify-between gap-1.5 px-2 py-1 rounded bg-white/[0.02] border border-white/[0.05]"
            >
              <span className="flex items-center gap-1.5 text-[10px] text-slate-400 truncate">
                <span className={`w-2 h-2 rounded-full shrink-0 ${seg.dot}`} />
                {seg.label}
              </span>
              <span className="font-mono text-[11px] font-semibold text-slate-200 tabular-nums shrink-0">
                {seg.value}G
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendation + QLoRA Copilot CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/[0.07]">
        <p className="text-xs text-slate-400 leading-relaxed">{breakdown.recommendation}</p>
        <button
          type="button"
          onClick={handleAskCopilotVram}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-xs font-medium transition-lab cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Generate {precision} Config
        </button>
      </div>
    </div>
  );
}
