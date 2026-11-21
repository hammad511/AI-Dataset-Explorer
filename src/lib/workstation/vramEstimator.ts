/**
 * Deterministic VRAM & Trainability Estimation Utilities
 * Computes realistic memory breakdown across FP16, LoRA, and 4-bit QLoRA modes.
 */

export type PrecisionMode = "FP16" | "LoRA" | "QLoRA";
export type GpuVramCapacity = 8 | 16 | 24 | 80;

export interface VramBreakdown {
  paramBillions: number;
  paramDisplay: string;
  precision: PrecisionMode;
  gpuCapacityGb: GpuVramCapacity;
  weightsGb: number;
  optimizerGb: number;
  gradientsGb: number;
  activationsGb: number;
  totalGb: number;
  utilizationPct: number;
  fitStatus: "fits" | "tight" | "overflow";
  statusLabel: string;
  recommendation: string;
}

/**
 * Extracts parameter count in Billions (B) from model metadata or naming conventions.
 */
export function parseParameterBillions(model: any): { billions: number; display: string } {
  const raw = String(model?.paramsCount || model?.parameters || "").trim();
  const idLower = String(model?.name || model?.id || "").toLowerCase();

  const tryParseString = (str: string): number | null => {
    const matchB = str.match(/(\d+(?:\.\d+)?)\s*b\b/i);
    if (matchB) return parseFloat(matchB[1]);
    const matchM = str.match(/(\d+(?:\.\d+)?)\s*m\b/i);
    if (matchM) return parseFloat(matchM[1]) / 1000;
    const matchPlain = str.match(/^(\d+(?:\.\d+)?)$/);
    if (matchPlain) {
      const val = parseFloat(matchPlain[1]);
      if (val > 1_000_000) return val / 1_000_000_000;
      return val;
    }
    return null;
  };

  if (raw) {
    const parsed = tryParseString(raw);
    if (parsed !== null && parsed > 0) {
      return {
        billions: parsed,
        display: parsed >= 1 ? `${parsed.toFixed(parsed >= 10 ? 0 : 1)}B` : `${Math.round(parsed * 1000)}M`,
      };
    }
  }

  const fromId = tryParseString(idLower.replace(/[-_/]/g, " "));
  if (fromId !== null && fromId > 0) {
    return {
      billions: fromId,
      display: fromId >= 1 ? `${fromId.toFixed(fromId >= 10 ? 0 : 1)}B` : `${Math.round(fromId * 1000)}M`,
    };
  }

  // Architecture heuristics when Hub API omits explicit safetensors parameter metadata
  if (/llama|mistral|qwen|gemma|mixtral|falcon|phi-3/i.test(idLower)) {
    if (/70b/i.test(idLower)) return { billions: 70, display: "70B" };
    if (/13b/i.test(idLower)) return { billions: 13, display: "13B" };
    if (/small|mini|3b|2b|1b/i.test(idLower)) return { billions: 3.0, display: "3.0B" };
    return { billions: 7.0, display: "7.0B" };
  }
  if (/yolov8x|yolov8l|swin|unetr|vit-large|clip-large|whisper-large/i.test(idLower)) {
    return { billions: 0.35, display: "350M" };
  }
  if (/bert|roberta|biobert|pubmedbert|wav2vec|whisper|deberta/i.test(idLower)) {
    return { billions: 0.11, display: "110M" };
  }
  if (/unet|resnet|efficientnet|yolo/i.test(idLower)) {
    return { billions: 0.045, display: "45M" };
  }

  return { billions: 0.18, display: "180M" };
}

/**
 * Estimates per-component VRAM in GB for a given model, precision strategy, and target GPU.
 */
export function estimateModelVram(
  model: any,
  precision: PrecisionMode = "LoRA",
  gpuCapacityGb: GpuVramCapacity = 24
): VramBreakdown {
  const { billions, display } = parseParameterBillions(model);

  // Base FP16 weights = 2 GB per billion params
  let weightsGb: number;
  let optimizerGb: number;
  let gradientsGb: number;
  let activationsGb: number;

  if (precision === "FP16") {
    weightsGb = billions * 2.0;
    // AdamW mixed-precision keeps FP32 master weights + m + v states (~8-12x)
    optimizerGb = billions * 8.0;
    gradientsGb = billions * 2.0;
    activationsGb = Math.max(1.2, billions * 1.4);
  } else if (precision === "LoRA") {
    weightsGb = billions * 2.0;
    // ~1.5% trainable LoRA adapters + Adam states
    optimizerGb = Math.max(0.4, billions * 0.28);
    gradientsGb = Math.max(0.2, billions * 0.12);
    activationsGb = Math.max(1.0, billions * 0.75);
  } else {
    // 4-bit QLoRA (NF4 quantized frozen weights + paged AdamW 8-bit)
    weightsGb = Math.max(0.35, billions * 0.58);
    optimizerGb = Math.max(0.3, billions * 0.22);
    gradientsGb = Math.max(0.18, billions * 0.10);
    activationsGb = Math.max(0.9, billions * 0.55);
  }

  // Round cleanly to 1 decimal place (minimum realistic CUDA context reserve)
  weightsGb = Number(Math.max(0.3, weightsGb).toFixed(1));
  optimizerGb = Number(Math.max(0.2, optimizerGb).toFixed(1));
  gradientsGb = Number(Math.max(0.2, gradientsGb).toFixed(1));
  activationsGb = Number(Math.max(0.8, activationsGb).toFixed(1));

  const totalGb = Number((weightsGb + optimizerGb + gradientsGb + activationsGb).toFixed(1));
  const utilizationPct = Math.round((totalGb / gpuCapacityGb) * 100);

  let fitStatus: "fits" | "tight" | "overflow" = "fits";
  let statusLabel = `Fits comfortably (${totalGb} / ${gpuCapacityGb} GB)`;
  let recommendation = `${precision} leaves ${Math.max(0, gpuCapacityGb - totalGb).toFixed(1)} GB headroom for larger batch sizes.`;

  if (utilizationPct > 100) {
    fitStatus = "overflow";
    statusLabel = `VRAM Overflow (+${(totalGb - gpuCapacityGb).toFixed(1)} GB over limit)`;
    recommendation =
      precision !== "QLoRA"
        ? "Switch to 4-bit QLoRA or enable gradient checkpointing + micro-batching."
        : "Upgrade GPU tier (A100 80GB) or apply DeepSpeed ZeRO-3 / FSDP sharding.";
  } else if (utilizationPct >= 80) {
    fitStatus = "tight";
    statusLabel = `Tight Fit (${utilizationPct}% VRAM utilized)`;
    recommendation = "Enable gradient checkpointing & bf16/fp16 AMP to guard against activation spikes.";
  }

  return {
    paramBillions: billions,
    paramDisplay: display,
    precision,
    gpuCapacityGb,
    weightsGb,
    optimizerGb,
    gradientsGb,
    activationsGb,
    totalGb,
    utilizationPct,
    fitStatus,
    statusLabel,
    recommendation,
  };
}
