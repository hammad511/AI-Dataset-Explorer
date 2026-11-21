"use client";

import React, { useState, useMemo } from "react";
import {
  FileCode2,
  Copy,
  Check,
  Download,
  FileArchive,
  BookOpen,
  Sparkles,
  Terminal,
} from "lucide-react";
import { DatasetItem } from "@/components/cards/DatasetCard";
import { ModelItem } from "@/components/cards/ModelCard";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useSearchSession } from "@/context/SearchSessionContext";
import {
  buildMarkdownBlueprint,
  buildRequirementsTxt,
  downloadProjectZip,
  downloadTextFile,
} from "@/lib/workstation/exportUtils";

interface StarterCodeHubProps {
  dataset: DatasetItem;
  model: ModelItem;
  templateTitle?: string;
  targetModality?: string;
  templateId?: string;
  starterCode: {
    setupScript: string;
    datasetLoader: string;
    trainScript: string;
    inferenceApi: string;
  };
  onDownloadNotebook?: () => void;
}

type CodeFileTab =
  | "train"
  | "loader"
  | "requirements"
  | "blueprint"
  | "setup"
  | "inference";

function renderHighlightedCode(code: string) {
  const lines = code.split("\n");

  return lines.map((line, lineIdx) => {
    const commentIdx = line.indexOf("#");
    let codePart = line;
    let commentPart = "";

    if (commentIdx !== -1 && !line.trimStart().startsWith("#!") === false) {
      codePart = line.substring(0, commentIdx);
      commentPart = line.substring(commentIdx);
    } else if (commentIdx !== -1) {
      codePart = line.substring(0, commentIdx);
      commentPart = line.substring(commentIdx);
    }

    const tokenRegex =
      /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@\w+(?:\.\w+)*|\b(?:import|from|as|def|class|return|if|else|elif|for|in|while|try|except|finally|with|async|await|None|True|False|self|raise|yield|pass|break|continue|set|echo|pip|export|chmod|mkdir|cd|rm)\b|\b\d+(?:\.\d+)?\b|[a-zA-Z_]\w*|[^\s\w"']+|\s+)/g;

    const tokens: React.ReactNode[] = [];
    let match;
    let tokenKey = 0;

    if (codePart) {
      while ((match = tokenRegex.exec(codePart)) !== null) {
        const token = match[0];
        if (token.startsWith('"') || token.startsWith("'")) {
          tokens.push(
            <span key={tokenKey++} className="text-emerald-300">
              {token}
            </span>
          );
        } else if (token.startsWith("@")) {
          tokens.push(
            <span key={tokenKey++} className="text-violet-400 font-semibold">
              {token}
            </span>
          );
        } else if (
          /^(?:import|from|as|def|class|return|if|else|elif|for|in|while|try|except|finally|with|async|await|self|raise|yield|pass|break|continue|set|echo|pip|export|chmod|mkdir|cd|rm)$/.test(
            token
          )
        ) {
          tokens.push(
            <span key={tokenKey++} className="text-sky-400 font-semibold">
              {token}
            </span>
          );
        } else if (/^(?:None|True|False)$/.test(token)) {
          tokens.push(
            <span key={tokenKey++} className="text-amber-300 font-semibold">
              {token}
            </span>
          );
        } else if (/^\d+(?:\.\d+)?$/.test(token)) {
          tokens.push(
            <span key={tokenKey++} className="text-amber-300 tabular-nums">
              {token}
            </span>
          );
        } else if (
          /^(?:torch|nn|F|DataLoader|Dataset|FastAPI|UploadFile|File|GradScaler|AdamW|CosineAnnealingLR|MONAI|SwinUNETR|UNet|Compose|LoadImaged|AutoTokenizer|AutoModelForSequenceClassification|Trainer|TrainingArguments|LoRA|LoraConfig|get_peft_model|BitsAndBytesConfig)$/.test(
            token
          )
        ) {
          tokens.push(
            <span key={tokenKey++} className="text-indigo-300 font-semibold">
              {token}
            </span>
          );
        } else {
          tokens.push(<span key={tokenKey++}>{token}</span>);
        }
      }
    }

    return (
      <div key={lineIdx} className="table-row hover:bg-white/[0.02]">
        <span className="table-cell select-none pr-4 text-right font-mono text-[11px] text-slate-600 w-9">
          {lineIdx + 1}
        </span>
        <span className="table-cell whitespace-pre">
          {tokens}
          {commentPart && (
            <span className="text-slate-500 italic">{commentPart}</span>
          )}
        </span>
      </div>
    );
  });
}

export default function StarterCodeHub({
  dataset,
  model,
  templateTitle = "Pipeline Starter Blueprint",
  targetModality = "Multimodal Deep Learning",
  templateId = "starter-pipeline",
  starterCode,
  onDownloadNotebook,
}: StarterCodeHubProps) {
  const { query, searchResult, activeTemplate } = useSearchSession();
  const { gpuConstraintGb, askAssistant } = useWorkspace();
  const [activeTab, setActiveTab] = useState<CodeFileTab>("train");
  const [copied, setCopied] = useState(false);

  const bundleInput = useMemo(
    () => ({
      query: query || templateTitle,
      searchResult,
      activeTemplate,
      selectedDataset: dataset,
      selectedModel: model,
      gpuVramGb: gpuConstraintGb,
    }),
    [query, templateTitle, searchResult, activeTemplate, dataset, model, gpuConstraintGb]
  );

  const requirementsTxt = useMemo(
    () => buildRequirementsTxt(bundleInput),
    [bundleInput]
  );
  const blueprintMd = useMemo(
    () => buildMarkdownBlueprint(bundleInput),
    [bundleInput]
  );

  const files: Array<{ key: CodeFileTab; filename: string; content: string; badge: string }> = [
    { key: "train", filename: "train.py", content: starterCode.trainScript, badge: "PY" },
    { key: "loader", filename: "dataset_loader.py", content: starterCode.datasetLoader, badge: "PY" },
    { key: "requirements", filename: "requirements.txt", content: requirementsTxt, badge: "TXT" },
    { key: "blueprint", filename: "blueprint.md", content: blueprintMd, badge: "MD" },
    { key: "setup", filename: "setup_and_download.sh", content: starterCode.setupScript, badge: "SH" },
    { key: "inference", filename: "inference_fastapi.py", content: starterCode.inferenceApi, badge: "API" },
  ];

  const activeFile = files.find((f) => f.key === activeTab) || files[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const handleDownloadActive = () => {
    downloadTextFile(activeFile.filename, activeFile.content);
  };

  const handleDownloadZip = () => {
    const slug = (templateId || "ai-blueprint").replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
    downloadProjectZip(
      `${slug}-starter.zip`,
      files.map((f) => ({ name: f.filename, content: f.content }))
    );
  };

  const handleDownloadNotebookFallback = () => {
    if (onDownloadNotebook) {
      onDownloadNotebook();
      return;
    }
    const datasetName = dataset.title || dataset.name || "Dataset";
    const modelName = model.name || model.id || "Model";

    const notebookObj = {
      cells: [
        {
          cell_type: "markdown",
          metadata: {},
          source: [
            `# ${templateTitle}\n`,
            `**Dataset:** ${datasetName}  \n`,
            `**Model:** ${modelName}  \n`,
            `**Modality:** ${targetModality}\n`,
          ],
        },
        {
          cell_type: "code",
          execution_count: null,
          metadata: {},
          outputs: [],
          source: starterCode.setupScript.split("\n").map((l) => l + "\n"),
        },
        {
          cell_type: "code",
          execution_count: null,
          metadata: {},
          outputs: [],
          source: starterCode.datasetLoader.split("\n").map((l) => l + "\n"),
        },
        {
          cell_type: "code",
          execution_count: null,
          metadata: {},
          outputs: [],
          source: starterCode.trainScript.split("\n").map((l) => l + "\n"),
        },
        {
          cell_type: "code",
          execution_count: null,
          metadata: {},
          outputs: [],
          source: starterCode.inferenceApi.split("\n").map((l) => l + "\n"),
        },
      ],
      metadata: { language_info: { name: "python" } },
      nbformat: 4,
      nbformat_minor: 2,
    };

    downloadTextFile(
      `${templateId || "pipeline"}-starter.ipynb`,
      JSON.stringify(notebookObj, null, 2),
      "application/json"
    );
  };

  return (
    <div className="obsidian-card overflow-hidden flex flex-col">
      {/* IDE Window Top Header */}
      <div className="px-4 py-3 bg-[#0A0D14] border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Terminal className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-100 truncate">
              IDE Code &amp; Artifact Studio
            </h3>
            <p className="text-[10px] font-mono text-slate-400 truncate">
              {(model.name || model.id || "Model").slice(0, 32)} &times;{" "}
              {(dataset.title || dataset.name || "Dataset").slice(0, 28)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              askAssistant(
                `Review and optimize \`${activeFile.filename}\` for ${model.name || model.id} trained on ${dataset.title || dataset.name} using a ${gpuConstraintGb}GB GPU.`
              )
            }
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-[11px] font-medium cursor-pointer"
          >
            <Sparkles className="w-3 h-3" /> Optimize
          </button>

          <button
            type="button"
            onClick={handleDownloadNotebookFallback}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-200 text-[11px] font-medium cursor-pointer"
            title="Download Jupyter Notebook (.ipynb)"
          >
            <BookOpen className="w-3 h-3 text-amber-400" /> .ipynb
          </button>

          <button
            type="button"
            onClick={handleDownloadZip}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold cursor-pointer"
            title="Download full starter bundle (.zip)"
          >
            <FileArchive className="w-3 h-3" /> Export .zip
          </button>
        </div>
      </div>

      {/* File Tabs Bar */}
      <div className="flex items-center overflow-x-auto bg-[#07090E] border-b border-white/[0.07] px-2 pt-2 gap-1">
        {files.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-[11px] font-mono border border-b-0 whitespace-nowrap transition-lab cursor-pointer ${
                isActive
                  ? "bg-[#0D111A] border-white/15 text-sky-300 font-semibold"
                  : "bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
              }`}
            >
              <FileCode2 className="w-3 h-3 shrink-0" />
              <span>{tab.filename}</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-white/[0.06] text-slate-400">
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* Code Viewport Action Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0D111A] border-b border-white/[0.06]">
        <span className="font-mono text-[11px] text-slate-400">
          {activeFile.filename} &bull; {activeFile.content.split("\n").length} lines
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownloadActive}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-[11px] cursor-pointer"
          >
            <Download className="w-3 h-3" /> File
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-[11px] font-medium cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Syntax Highlighted Code Container */}
      <div className="bg-[#07090E] p-4 overflow-x-auto max-h-[540px] overflow-y-auto font-mono text-xs leading-relaxed text-slate-200">
        <div className="table w-full">{renderHighlightedCode(activeFile.content)}</div>
      </div>
    </div>
  );
}
