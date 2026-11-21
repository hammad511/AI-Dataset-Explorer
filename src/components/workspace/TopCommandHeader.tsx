"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Command,
  Download,
  FileText,
  FileJson,
  FileCode2,
  FolderArchive,
  PanelRightOpen,
  PanelRightClose,
  Menu,
  ChevronRight,
  Cpu,
  Sun,
  Moon,
  Sparkles,
} from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useSearchSession } from "@/context/SearchSessionContext";
import { useTheme } from "@/context/ThemeContext";
import {
  buildMarkdownBlueprint,
  buildRequirementsTxt,
  buildTrainScript,
  downloadProjectZip,
  downloadTextFile,
  exportJsonBlueprintViaApi,
} from "@/lib/workstation/exportUtils";
import type { GpuVramCapacity } from "@/lib/workstation/vramEstimator";

interface TopCommandHeaderProps {
  pageTitle?: string;
}

export function TopCommandHeader({ pageTitle }: TopCommandHeaderProps) {
  const {
    setIsMobileRailOpen,
    setIsCommandPaletteOpen,
    isAssistantOpen,
    setIsAssistantOpen,
    gpuConstraintGb,
    setGpuConstraintGb,
  } = useWorkspace();
  const { query, searchResult, activeTemplate, selectedDataset, selectedModel } = useSearchSession();
  const { resolvedTheme, setTheme } = useTheme();

  const [exportOpen, setExportOpen] = useState(false);
  const [gpuOpen, setGpuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const gpuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
      if (gpuRef.current && !gpuRef.current.contains(e.target as Node)) {
        setGpuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const parsedDomain =
    searchResult?.summary?.domain && searchResult.summary.domain !== "unknown"
      ? searchResult.summary.domain
      : searchResult?.analysis?.domain || activeTemplate?.domain || "ML Research";

  const parsedModality =
    searchResult?.summary?.dataType && searchResult.summary.dataType !== "Unknown"
      ? searchResult.summary.dataType
      : searchResult?.analysis?.data_modality || activeTemplate?.targetModality || "Multi-Modal";

  const parsedTask =
    searchResult?.summary?.task && searchResult.summary.task !== "unknown"
      ? searchResult.summary.task
      : searchResult?.analysis?.task || activeTemplate?.category || "Discovery";

  const bundleInput = {
    query,
    searchResult,
    activeTemplate,
    selectedDataset,
    selectedModel,
    gpuVramGb: gpuConstraintGb,
  };

  const gpuOptions: { gb: GpuVramCapacity; label: string }[] = [
    { gb: 8, label: "8GB · RTX 3070 / L4" },
    { gb: 16, label: "16GB · T4 / RTX 4080" },
    { gb: 24, label: "24GB · RTX 4090 / A10G" },
    { gb: 80, label: "80GB · NVIDIA A100" },
  ];

  return (
    <header className="sticky top-0 z-20 h-[52px] glass-nav px-3 sm:px-5 flex items-center justify-between gap-3 shrink-0">
      {/* Left: Mobile Trigger + Active Session Breadcrumb */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setIsMobileRailOpen(true)}
          className="md:hidden w-8 h-8 rounded-lg border border-subtle bg-card hover:bg-card-hover text-secondary flex items-center justify-center shrink-0"
          aria-label="Open navigation menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Active Search Session Breadcrumb */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          {pageTitle && (
            <>
              <span className="text-xs font-bold text-primary whitespace-nowrap shrink-0">
                {pageTitle}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-dimmed shrink-0 hidden sm:block" />
            </>
          )}

          <div className="hidden sm:flex items-center gap-1.5 min-w-0">
            <span
              className="px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-[11px] font-medium text-secondary truncate max-w-[140px]"
              title={`Domain: ${parsedDomain}`}
            >
              {parsedDomain}
            </span>
            <span
              className="px-2 py-0.5 rounded-md status-badge-cyan border text-[10px] font-mono font-semibold truncate max-w-[115px]"
              title={`Modality: ${parsedModality}`}
            >
              {parsedModality}
            </span>
            <span
              className="hidden xl:inline-block px-2 py-0.5 rounded-md bg-card-subtle border border-subtle text-[10px] font-mono text-muted truncate max-w-[140px]"
              title={`Target Task: ${parsedTask}`}
            >
              {parsedTask}
            </span>
          </div>
        </div>
      </div>

      {/* Center: Global ⌘K Command Palette Trigger */}
      <button
        type="button"
        onClick={() => setIsCommandPaletteOpen(true)}
        className="flex items-center justify-between gap-3 h-8 px-3 rounded-lg bg-input border border-subtle hover:border-strong text-muted hover:text-primary transition-lab w-44 sm:w-64 md:w-72 shrink-0 group"
      >
        <span className="flex items-center gap-2 text-xs truncate">
          <Command className="w-3.5 h-3.5 text-accent-from shrink-0" />
          <span className="truncate">Command palette or search...</span>
        </span>
        <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-card-subtle border border-subtle font-mono text-[10px] text-faint group-hover:text-secondary">
          ⌘K
        </kbd>
      </button>

      {/* Right: Quick Action Cluster */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Hardware Constraint Tag Selector */}
        <div className="relative hidden lg:block" ref={gpuRef}>
          <button
            type="button"
            onClick={() => setGpuOpen((p) => !p)}
            className="h-8 px-2.5 rounded-lg border border-subtle bg-card hover:bg-card-hover text-[11px] font-mono font-semibold text-secondary flex items-center gap-1.5 transition-lab tabular-nums"
            title="Active GPU VRAM constraint"
          >
            <Cpu className="w-3.5 h-3.5 text-accent-from" />
            <span>{gpuConstraintGb}GB VRAM</span>
          </button>

          {gpuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl obsidian-card p-1.5 z-50 shadow-2xl">
              <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-faint border-b border-subtle mb-1">
                Target Hardware Limit
              </div>
              {gpuOptions.map((opt) => (
                <button
                  key={opt.gb}
                  type="button"
                  onClick={() => {
                    setGpuConstraintGb(opt.gb);
                    setGpuOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg font-mono text-[11px] flex items-center justify-between transition-lab ${
                    gpuConstraintGb === opt.gb
                      ? "bg-accent-subtle text-accent-from font-semibold"
                      : "text-secondary hover:bg-card-hover"
                  }`}
                >
                  <span>{opt.label}</span>
                  {gpuConstraintGb === opt.gb && <span>●</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Export Blueprint Dropdown */}
        <div className="relative" ref={exportRef}>
          <button
            type="button"
            onClick={() => setExportOpen((p) => !p)}
            className="h-8 px-2.5 rounded-lg border border-subtle bg-card hover:bg-card-hover hover:border-strong text-xs font-semibold text-secondary hover:text-primary flex items-center gap-1.5 transition-lab"
          >
            <Download className="w-3.5 h-3.5 text-accent-from" />
            <span className="hidden sm:inline">Export</span>
          </button>

          {exportOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-60 rounded-xl obsidian-card p-1.5 z-50 shadow-2xl space-y-0.5">
              <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-faint border-b border-subtle mb-1">
                Export Active Blueprint
              </div>
              <button
                type="button"
                onClick={() => {
                  downloadTextFile("blueprint.md", buildMarkdownBlueprint(bundleInput), "text/markdown;charset=utf-8");
                  setExportOpen(false);
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-secondary hover:text-primary hover:bg-card-hover flex items-center gap-2.5 transition-lab"
              >
                <FileText className="w-3.5 h-3.5 text-accent-from" />
                <div>
                  <div className="font-semibold">Markdown Spec</div>
                  <div className="text-[10px] text-faint font-mono">blueprint.md</div>
                </div>
              </button>

              <button
                type="button"
                onClick={async () => {
                  setExportOpen(false);
                  await exportJsonBlueprintViaApi(bundleInput);
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-secondary hover:text-primary hover:bg-card-hover flex items-center gap-2.5 transition-lab"
              >
                <FileJson className="w-3.5 h-3.5 text-status-emerald" />
                <div>
                  <div className="font-semibold">JSON Graph & Spec</div>
                  <div className="text-[10px] text-faint font-mono">POST /api/export</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  downloadTextFile("train.py", buildTrainScript(bundleInput), "text/x-python;charset=utf-8");
                  setExportOpen(false);
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-secondary hover:text-primary hover:bg-card-hover flex items-center gap-2.5 transition-lab"
              >
                <FileCode2 className="w-3.5 h-3.5 text-status-amber" />
                <div>
                  <div className="font-semibold">Starter train.py</div>
                  <div className="text-[10px] text-faint font-mono">PyTorch training loop</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  downloadProjectZip(`${activeTemplate.id || "ai-blueprint"}-starter.zip`, [
                    { name: "blueprint.md", content: buildMarkdownBlueprint(bundleInput) },
                    { name: "train.py", content: buildTrainScript(bundleInput) },
                    { name: "dataset_loader.py", content: activeTemplate.starterCode.datasetLoader },
                    { name: "inference_fastapi.py", content: activeTemplate.starterCode.inferenceApi },
                    { name: "requirements.txt", content: buildRequirementsTxt(bundleInput) },
                    { name: "setup_and_download.sh", content: activeTemplate.starterCode.setupScript },
                  ]);
                  setExportOpen(false);
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-secondary hover:text-primary hover:bg-card-hover flex items-center gap-2.5 transition-lab"
              >
                <FolderArchive className="w-3.5 h-3.5 text-status-violet" />
                <div>
                  <div className="font-semibold">Starter Bundle (.zip)</div>
                  <div className="text-[10px] text-faint font-mono">Full code + specs archive</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Theme Switcher */}
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="w-8 h-8 rounded-lg border border-subtle bg-card hover:bg-card-hover text-muted hover:text-primary flex items-center justify-center transition-lab"
          title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
          aria-label="Toggle theme"
        >
          {resolvedTheme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        {/* Toggle AI Assistant Drawer (⌘I) */}
        <button
          type="button"
          onClick={() => setIsAssistantOpen((p) => !p)}
          className={`h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-lab ${
            isAssistantOpen
              ? "bg-accent text-slate-950 border-transparent shadow-accent-sm font-bold"
              : "bg-card hover:bg-card-hover border-subtle hover:border-strong text-secondary hover:text-primary"
          }`}
          title="Toggle AI Research Assistant Drawer (⌘I)"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Copilot</span>
          {isAssistantOpen ? (
            <PanelRightClose className="w-3.5 h-3.5 hidden sm:block" />
          ) : (
            <PanelRightOpen className="w-3.5 h-3.5 hidden sm:block" />
          )}
          <kbd
            className={`hidden xl:inline text-[10px] font-mono px-1 rounded ${
              isAssistantOpen ? "bg-black/15 text-slate-950" : "bg-card-subtle text-faint"
            }`}
          >
            ⌘I
          </kbd>
        </button>
      </div>
    </header>
  );
}
