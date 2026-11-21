"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Compass,
  GitCompareArrows,
  Map,
  Settings,
  ShieldAlert,
  Sparkles,
  FileText,
  FileJson,
  FileCode2,
  Clock,
  Cpu,
  X,
} from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useSearchSession } from "@/context/SearchSessionContext";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import {
  buildMarkdownBlueprint,
  buildTrainScript,
  downloadTextFile,
  exportJsonBlueprintViaApi,
} from "@/lib/workstation/exportUtils";

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

const SAMPLE_PROMPTS = [
  "Clinical NER on Pathology Notes",
  "Real-Time Edge Defect Detection",
  "Multilingual Legal RAG",
  "Coronary artery segmentation CT dataset",
];

export function CommandPalette({ onSelectSearch }: { onSelectSearch?: (query: string) => void }) {
  const router = useRouter();
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    setIsAssistantOpen,
    gpuConstraintGb,
    setGpuConstraintGb,
  } = useWorkspace();
  const { query, searchResult, activeTemplate, selectedDataset, selectedModel } = useSearchSession();
  const { recentSearches } = useRecentSearches();

  const [filterText, setFilterText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setFilterText("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isCommandPaletteOpen]);

  const runSearchTarget = (q: string) => {
    setIsCommandPaletteOpen(false);
    if (onSelectSearch) {
      onSelectSearch(q);
    } else {
      router.push(`/explore?q=${encodeURIComponent(q)}`);
    }
  };

  const bundleInput = {
    query,
    searchResult,
    activeTemplate,
    selectedDataset,
    selectedModel,
    gpuVramGb: gpuConstraintGb,
  };

  const allItems: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = [
      {
        id: "nav-explore",
        group: "Views",
        label: "Open Explore Studio",
        hint: "⌘1",
        icon: Compass,
        run: () => {
          setIsCommandPaletteOpen(false);
          router.push("/explore");
        },
      },
      {
        id: "nav-benchmark",
        group: "Views",
        label: "Open Benchmark Matrix",
        hint: "⌘2",
        icon: GitCompareArrows,
        run: () => {
          setIsCommandPaletteOpen(false);
          router.push("/benchmark");
        },
      },
      {
        id: "nav-roadmap",
        group: "Views",
        label: "Open Roadmap & Code Studio",
        hint: "⌘3",
        icon: Map,
        run: () => {
          setIsCommandPaletteOpen(false);
          router.push("/roadmap");
        },
      },
      {
        id: "nav-settings",
        group: "Views",
        label: "History, Quota & Billing",
        hint: "⌘4",
        icon: Settings,
        run: () => {
          setIsCommandPaletteOpen(false);
          router.push("/settings?tab=Usage");
        },
      },
      {
        id: "nav-admin",
        group: "Views",
        label: "Provider Telemetry & Admin Console",
        icon: ShieldAlert,
        run: () => {
          setIsCommandPaletteOpen(false);
          router.push("/admin");
        },
      },
      {
        id: "act-assistant",
        group: "Actions",
        label: "Toggle AI Research Copilot Drawer",
        hint: "⌘I",
        icon: Sparkles,
        run: () => {
          setIsCommandPaletteOpen(false);
          setIsAssistantOpen((p) => !p);
        },
      },
      {
        id: "act-md",
        group: "Actions",
        label: "Export Blueprint as Markdown (.md)",
        icon: FileText,
        run: () => {
          setIsCommandPaletteOpen(false);
          downloadTextFile("blueprint.md", buildMarkdownBlueprint(bundleInput), "text/markdown");
        },
      },
      {
        id: "act-json",
        group: "Actions",
        label: "Export Blueprint JSON Graph",
        icon: FileJson,
        run: async () => {
          setIsCommandPaletteOpen(false);
          await exportJsonBlueprintViaApi(bundleInput);
        },
      },
      {
        id: "act-py",
        group: "Actions",
        label: "Download Starter train.py",
        icon: FileCode2,
        run: () => {
          setIsCommandPaletteOpen(false);
          downloadTextFile("train.py", buildTrainScript(bundleInput), "text/x-python");
        },
      },
      {
        id: "gpu-24",
        group: "Hardware",
        label: "Set GPU Constraint: 24GB (RTX 4090 / A10G)",
        icon: Cpu,
        run: () => {
          setGpuConstraintGb(24);
          setIsCommandPaletteOpen(false);
        },
      },
      {
        id: "gpu-80",
        group: "Hardware",
        label: "Set GPU Constraint: 80GB (NVIDIA A100)",
        icon: Cpu,
        run: () => {
          setGpuConstraintGb(80);
          setIsCommandPaletteOpen(false);
        },
      },
    ];

    for (const r of recentSearches.slice(0, 6)) {
      items.push({
        id: `rec-${r.id}`,
        group: "Recent Searches",
        label: r.query,
        hint: "Run",
        icon: Clock,
        run: () => runSearchTarget(r.query),
      });
    }

    for (const sp of SAMPLE_PROMPTS) {
      items.push({
        id: `sample-${sp}`,
        group: "Sample ML Prompts",
        label: sp,
        hint: "Explore",
        icon: Search,
        run: () => runSearchTarget(sp),
      });
    }

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentSearches, gpuConstraintGb, query, searchResult, activeTemplate]);

  const filteredItems = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return allItems;
    const matched = allItems.filter(
      (item) => item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q)
    );
    return [
      {
        id: "direct-search",
        group: "Run Live Search",
        label: `Search research index for "${filterText.trim()}"`,
        hint: "Enter",
        icon: Search,
        run: () => runSearchTarget(filterText.trim()),
      },
      ...matched,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterText, allItems]);

  useEffect(() => {
    setActiveIndex(0);
  }, [filterText]);

  if (!isCommandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center pt-20 sm:pt-24 px-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsCommandPaletteOpen(false);
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl obsidian-card border border-strong shadow-2xl overflow-hidden">
        {/* Search Input Row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-subtle bg-page/50">
          <Search className="w-4 h-4 text-accent-from shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setIsCommandPaletteOpen(false);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((prev) => Math.min(filteredItems.length - 1, prev + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((prev) => Math.max(0, prev - 1));
              } else if (e.key === "Enter" && filteredItems[activeIndex]) {
                e.preventDefault();
                filteredItems[activeIndex].run();
              }
            }}
            placeholder="Jump to view, rerun a recent session, export spec, or search datasets..."
            className="flex-1 bg-transparent text-sm text-primary placeholder:text-faint outline-none"
          />
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(false)}
            className="p-1 rounded-md text-faint hover:text-primary hover:bg-card-hover transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[400px] overflow-y-auto p-2 space-y-1">
          {filteredItems.map((item, idx) => {
            const Icon = item.icon;
            const selected = idx === activeIndex;
            const prevGroup = idx > 0 ? filteredItems[idx - 1].group : null;
            return (
              <React.Fragment key={item.id}>
                {item.group !== prevGroup && (
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-faint">
                    {item.group}
                  </div>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={item.run}
                  className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-xs transition-lab ${
                    selected
                      ? "bg-accent-subtle border border-accent/40 text-primary font-semibold"
                      : "text-secondary hover:bg-card-hover border border-transparent"
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${selected ? "text-accent-from" : "text-muted"}`} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.hint && (
                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-page/70 border border-subtle text-faint shrink-0">
                      {item.hint}
                    </kbd>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Footer Hint Strip */}
        <div className="px-4 py-2 border-t border-subtle bg-page/60 flex items-center justify-between text-[10px] font-mono text-faint">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>AI Dataset Explorer · ⌘K</span>
        </div>
      </div>
    </div>
  );
}
