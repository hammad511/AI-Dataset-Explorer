/**
 * Workstation Blueprint & Starter Code Export Utilities
 * Generates Markdown Specs, JSON Graphs (via /api/export), Starter train.py, and zero-dep .zip project bundles.
 */

import type { SearchResultPayload } from "@/types/search";
import type { DomainTemplate } from "@/types/roadmap";

export interface BlueprintBundleInput {
  query: string;
  searchResult: SearchResultPayload | null;
  activeTemplate: DomainTemplate;
  selectedDataset?: any;
  selectedModel?: any;
  gpuVramGb?: number;
}

export function buildMarkdownBlueprint(input: BlueprintBundleInput): string {
  const { query, searchResult, activeTemplate, selectedDataset, selectedModel, gpuVramGb } = input;
  const ds = selectedDataset || searchResult?.datasets?.[0] || activeTemplate?.datasets?.[0];
  const mdl = selectedModel || searchResult?.models?.[0] || activeTemplate?.models?.[0];
  const papers = searchResult?.papers || activeTemplate?.papers || [];
  const feasibility = searchResult?.feasibility;
  const hardware = searchResult?.hardware || activeTemplate?.hardwareProfile;

  const lines: string[] = [
    `# AI Dataset Explorer · Architecture Blueprint`,
    ``,
    `- **Generated:** ${new Date().toISOString()}`,
    `- **Research Query:** \`${query || activeTemplate?.query || "Unspecified"}\``,
    `- **Domain & Task:** ${searchResult?.summary?.domain || activeTemplate?.domain} · ${searchResult?.summary?.task || activeTemplate?.category}`,
    `- **Target Modality:** ${searchResult?.summary?.dataType || activeTemplate?.targetModality}`,
    `- **Hardware Target:** ${gpuVramGb ? `${gpuVramGb} GB VRAM Constraint` : hardware?.gpu_recommendation || "NVIDIA A10G (24GB)"}`,
    `- **Feasibility Score:** ${feasibility?.feasibility_score ? `${feasibility.feasibility_score}/100 (${feasibility.level || feasibility.status})` : "High Feasibility"}`,
    ``,
    `---`,
    ``,
    `## 1. Primary Dataset Selection`,
    ds
      ? [
          `- **Name:** ${ds.title || ds.name}`,
          `- **Source:** ${ds.source || "Hub"} | **Match Score:** ${ds.matchScore ?? ds.relevanceScore ?? 90}/100`,
          `- **Modality:** ${ds.modality || activeTemplate?.targetModality}`,
          `- **License:** ${ds.license || ds.commercialLicenseBadge || "Check repository terms"}`,
          `- **URL:** ${ds.url || "N/A"}`,
          `- **Summary:** ${(ds.subtitle || ds.description || "").slice(0, 280)}`,
        ].join("\n")
      : `_No dataset selected in active session._`,
    ``,
    `## 2. Candidate Model Architecture`,
    mdl
      ? [
          `- **Checkpoint / Name:** ${mdl.name || mdl.id}`,
          `- **Architecture Family:** ${mdl.architecture || activeTemplate?.title}`,
          `- **Task / Pipeline:** ${mdl.task || mdl.pipeline || "Deep Learning"}`,
          `- **Match Score:** ${mdl.matchScore ?? 90}/100`,
          `- **URL:** ${mdl.url || "N/A"}`,
        ].join("\n")
      : `_No model selected in active session._`,
    ``,
    `## 3. Supporting Scholarly Literature (${papers.length} Indexed)`,
    ...papers.slice(0, 5).map(
      (p: any, idx: number) =>
        `${idx + 1}. **${p.title}** (${p.year || "Recent"}, ${p.venue || "Academic"}) — ${p.citationCount ?? 0} citations${p.doi ? ` | DOI: \`${p.doi}\`` : ""}`
    ),
    ``,
    `## 4. Execution Phases (${activeTemplate?.roadmapPhases?.length || 0} Milestones)`,
    ...(activeTemplate?.roadmapPhases || []).map(
      (phase) =>
        `### Phase ${phase.phaseNumber}: ${phase.title} (${phase.timeEstimate})\n${phase.summary}\n${phase.deliverables.map((d) => `- [ ] ${d}`).join("\n")}`
    ),
    ``,
  ];

  return lines.join("\n");
}

export function buildRequirementsTxt(input: BlueprintBundleInput): string {
  const combined = `${input.query} ${input.activeTemplate?.title || ""} ${input.activeTemplate?.targetModality || ""}`.toLowerCase();
  const base = [
    "# AI Dataset Explorer — Pinned Starter Dependencies",
    "torch>=2.3.0",
    "transformers>=4.44.0",
    "accelerate>=0.33.0",
    "datasets>=2.20.0",
    "peft>=0.12.0",
    "bitsandbytes>=0.43.0",
    "huggingface_hub>=0.24.0",
    "fastapi>=0.112.0",
    "uvicorn>=0.30.0",
  ];

  if (combined.includes("ct") || combined.includes("mri") || combined.includes("medical")) {
    base.push("monai>=1.3.0", "nibabel>=5.2.0", "pydicom>=2.4.0", "SimpleITK>=2.3.0");
  } else if (combined.includes("audio") || combined.includes("speech")) {
    base.push("torchaudio>=2.3.0", "librosa>=0.10.2", "soundfile>=0.12.1");
  } else if (combined.includes("video") || combined.includes("yolo") || combined.includes("detection")) {
    base.push("ultralytics>=8.2.0", "opencv-python>=4.10.0", "albumentations>=1.4.0");
  } else {
    base.push("scikit-learn>=1.5.0", "pandas>=2.2.0", "numpy>=1.26.0");
  }

  return base.join("\n") + "\n";
}

export function buildTrainScript(input: BlueprintBundleInput): string {
  const dsName = input.selectedDataset?.title || input.selectedDataset?.name || input.searchResult?.datasets?.[0]?.title || input.activeTemplate.datasets[0]?.title || "Target Dataset";
  const mdlName = input.selectedModel?.name || input.selectedModel?.id || input.searchResult?.models?.[0]?.name || input.activeTemplate.models[0]?.name || "Pretrained Backbone";

  if (input.activeTemplate?.starterCode?.trainScript) {
    return `# Target Dataset: ${dsName}\n# Target Model: ${mdlName}\n# Hardware Constraint: ${input.gpuVramGb || 24}GB VRAM\n\n${input.activeTemplate.starterCode.trainScript}`;
  }

  return `"""Starter Training Script for ${mdlName} on ${dsName}"""\nimport torch\n\ndef main():\n    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")\n    print(f"Training ${mdlName} on ${dsName} using {device}")\n\nif __name__ == "__main__":\n    main()\n`;
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportJsonBlueprintViaApi(input: BlueprintBundleInput) {
  const payload = {
    query: input.query || input.activeTemplate?.query || "Active Research Session",
    domainAndTask:
      input.searchResult?.domainAndTask ||
      `${input.activeTemplate?.domain || "AI"} · ${input.activeTemplate?.category || "Research"}`,
    intent: input.searchResult?.intent || "DATASET_SEARCH",
    constraints: input.searchResult?.interpretation || input.searchResult?.constraints || {},
    datasets: input.searchResult?.datasets || input.activeTemplate?.datasets || [],
    models: input.searchResult?.models || input.activeTemplate?.models || [],
    papers: input.searchResult?.papers || input.activeTemplate?.papers || [],
    feasibility: input.searchResult?.feasibility || null,
    hardwareProfile: input.searchResult?.hardware || input.activeTemplate?.hardwareProfile || null,
    directAnswer: input.searchResult?.answer || null,
    researchLandscape: input.searchResult?.researchLandscape || null,
    researchSynthesis: input.searchResult?.researchSynthesis || null,
    researchGraph: input.searchResult?.researchGraph || null,
  };

  try {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const text = await res.text();
      downloadTextFile(`blueprint-graph-${Date.now()}.json`, text, "application/json;charset=utf-8");
      return;
    }
  } catch {
    // Graceful client-side fallback
  }

  downloadTextFile(
    `blueprint-graph-${Date.now()}.json`,
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8"
  );
}

/**
 * Pure TypeScript uncompressed (STORE) ZIP archive generator with standard CRC32.
 * Produces valid .zip files readable on Windows, macOS, Linux, and Python zipfile without external npm packages.
 */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function downloadProjectZip(
  zipFilename: string,
  files: Array<{ name: string; content: string }>
) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);

    // Local file header (30 bytes + filename + file data)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 flag
    lv.setUint16(8, 0, true); // STORE compression
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x5421, true); // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central directory header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralSize = centralParts.reduce((acc, p) => acc + p.length, 0);
  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const blob = new Blob([...localParts, ...centralParts, endRecord] as BlobPart[], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
