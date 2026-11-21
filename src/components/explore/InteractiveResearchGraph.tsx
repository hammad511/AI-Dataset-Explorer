"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Network,
  Database,
  Cpu,
  BookOpen,
  Sparkles,
  ExternalLink,
  Pin,
  X,
  Compass,
} from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useSearchSession } from "@/context/SearchSessionContext";

export interface RawGraphNode {
  id: string;
  label: string;
  type: "query" | "dataset" | "model" | "paper" | "task" | "domain" | string;
  metadata?: Record<string, any>;
}

export interface RawGraphEdge {
  source: string;
  target: string;
  relationship: string;
}

interface PositionedNode extends RawGraphNode {
  x: number;
  y: number;
  category: "query" | "dataset" | "model" | "paper";
  assetRef?: any;
}

interface InteractiveResearchGraphProps {
  query: string;
  researchGraph?: {
    nodes: RawGraphNode[];
    edges: RawGraphEdge[];
  } | null;
  datasets?: any[];
  models?: any[];
  papers?: any[];
}

const NODE_COLORS: Record<
  PositionedNode["category"],
  { fill: string; stroke: string; text: string; pill: string; icon: React.ReactNode }
> = {
  query: {
    fill: "#0E1D2F",
    stroke: "#38BDF8",
    text: "#BAE6FD",
    pill: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    icon: <Compass className="w-3.5 h-3.5 text-sky-400" />,
  },
  dataset: {
    fill: "#0B201C",
    stroke: "#10B981",
    text: "#A7F3D0",
    pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    icon: <Database className="w-3.5 h-3.5 text-emerald-400" />,
  },
  model: {
    fill: "#171430",
    stroke: "#818CF8",
    text: "#C7D2FE",
    pill: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    icon: <Cpu className="w-3.5 h-3.5 text-indigo-400" />,
  },
  paper: {
    fill: "#26180B",
    stroke: "#F59E0B",
    text: "#FDE68A",
    pill: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: <BookOpen className="w-3.5 h-3.5 text-amber-400" />,
  },
};

function normalizeCategory(type: string): PositionedNode["category"] {
  const t = type.toLowerCase();
  if (t.includes("dataset")) return "dataset";
  if (t.includes("model") || t.includes("arch")) return "model";
  if (t.includes("paper") || t.includes("lit") || t.includes("citation")) return "paper";
  return "query";
}

function truncateLabel(label: string, max = 26): string {
  if (!label) return "Untitled";
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export default function InteractiveResearchGraph({
  query,
  researchGraph,
  datasets = [],
  models = [],
  papers = [],
}: InteractiveResearchGraphProps) {
  const { askAssistant } = useWorkspace();
  const { isAssetPinned, togglePinAsset } = useSearchSession();

  const [filterType, setFilterType] = useState<"all" | PositionedNode["category"]>("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  const draggingNodeRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const panningRef = useRef<{
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);

  // Build normalized graph nodes & edges from backend researchGraph or live assets
  const { baseNodes, edges } = useMemo(() => {
    const rawNodes: RawGraphNode[] = [];
    const rawEdges: RawGraphEdge[] = [];

    if (researchGraph?.nodes && researchGraph.nodes.length > 1) {
      for (const n of researchGraph.nodes) {
        rawNodes.push(n);
      }
      for (const e of researchGraph.edges || []) {
        rawEdges.push(e);
      }
    } else {
      const rootId = "query-root";
      rawNodes.push({
        id: rootId,
        label: query || "Research Session",
        type: "query",
        metadata: {
          datasetsCount: datasets.length,
          modelsCount: models.length,
          papersCount: papers.length,
        },
      });

      const topDatasets = datasets.slice(0, 4);
      const topModels = models.slice(0, 4);
      const topPapers = papers.slice(0, 4);

      topDatasets.forEach((ds, idx) => {
        const nid = `ds-${ds.id || idx}`;
        rawNodes.push({
          id: nid,
          label: ds.name || ds.title || `Dataset ${idx + 1}`,
          type: "dataset",
          metadata: {
            source: ds.source,
            license: ds.license,
            size: ds.size,
            rows: ds.rows,
            url: ds.url,
            matchScore: ds.matchScore ?? ds.relevanceScore,
            asset: ds,
          },
        });
        rawEdges.push({ source: rootId, target: nid, relationship: "targets_data" });
      });

      topModels.forEach((m, idx) => {
        const nid = `mod-${m.id || idx}`;
        rawNodes.push({
          id: nid,
          label: m.name || m.id || `Model ${idx + 1}`,
          type: "model",
          metadata: {
            source: m.source,
            framework: m.framework,
            task: m.task,
            paramsCount: m.paramsCount,
            url: m.url,
            matchScore: m.matchScore ?? m.relevanceScore,
            asset: m,
          },
        });
        if (topDatasets[idx % Math.max(1, topDatasets.length)]) {
          const dsId = `ds-${topDatasets[idx % topDatasets.length].id || idx % topDatasets.length}`;
          rawEdges.push({ source: dsId, target: nid, relationship: "trains_backbone" });
        } else {
          rawEdges.push({ source: rootId, target: nid, relationship: "evaluates_model" });
        }
      });

      topPapers.forEach((p, idx) => {
        const nid = `pap-${p.id || idx}`;
        rawNodes.push({
          id: nid,
          label: p.title || `Paper ${idx + 1}`,
          type: "paper",
          metadata: {
            source: p.source,
            year: p.year,
            citations: p.citations ?? p.citationCount,
            doi: p.doi,
            url: p.url,
            asset: p,
          },
        });
        if (topModels[idx % Math.max(1, topModels.length)]) {
          const mId = `mod-${topModels[idx % topModels.length].id || idx % topModels.length}`;
          rawEdges.push({ source: mId, target: nid, relationship: "grounded_by" });
        } else {
          rawEdges.push({ source: rootId, target: nid, relationship: "cites_literature" });
        }
      });
    }

    // Group by column lane for clean layered layout (ViewBox 1040 x 560)
    const buckets: Record<PositionedNode["category"], RawGraphNode[]> = {
      query: [],
      dataset: [],
      model: [],
      paper: [],
    };
    rawNodes.forEach((n) => {
      buckets[normalizeCategory(n.type)].push(n);
    });

    const laneX: Record<PositionedNode["category"], number> = {
      query: 130,
      dataset: 400,
      model: 670,
      paper: 920,
    };

    const positioned: PositionedNode[] = [];
    (Object.keys(buckets) as Array<PositionedNode["category"]>).forEach((cat) => {
      const list = buckets[cat];
      const spacing = 500 / (list.length + 1);
      list.forEach((n, idx) => {
        const matchedDataset =
          cat === "dataset"
            ? n.metadata?.asset ||
              datasets.find((d) => d.id === n.id || d.name === n.label || `ds-${d.id}` === n.id)
            : undefined;
        const matchedModel =
          cat === "model"
            ? n.metadata?.asset ||
              models.find((m) => m.id === n.id || m.name === n.label || `mod-${m.id}` === n.id)
            : undefined;
        const matchedPaper =
          cat === "paper"
            ? n.metadata?.asset ||
              papers.find((p) => p.id === n.id || p.title === n.label || `pap-${p.id}` === n.id)
            : undefined;

        positioned.push({
          ...n,
          category: cat,
          x: laneX[cat],
          y: Math.round(30 + spacing * (idx + 1)),
          assetRef: matchedDataset || matchedModel || matchedPaper,
        });
      });
    });

    return { baseNodes: positioned, edges: rawEdges };
  }, [researchGraph, query, datasets, models, papers]);

  // Reset custom dragged coordinates when the graph topology changes
  useEffect(() => {
    setNodePositions({});
    setSelectedNodeId(baseNodes[0]?.id ?? null);
  }, [baseNodes]);

  const nodesWithPositions = useMemo(() => {
    return baseNodes.map((n) => {
      const custom = nodePositions[n.id];
      return custom ? { ...n, x: custom.x, y: custom.y } : n;
    });
  }, [baseNodes, nodePositions]);

  const visibleNodes = useMemo(() => {
    if (filterType === "all") return nodesWithPositions;
    return nodesWithPositions.filter((n) => n.category === filterType || n.category === "query");
  }, [nodesWithPositions, filterType]);

  const visibleNodeMap = useMemo(() => {
    const map = new Map<string, PositionedNode>();
    visibleNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [visibleNodes]);

  const visibleEdges = useMemo(() => {
    return edges.filter((e) => visibleNodeMap.has(e.source) && visibleNodeMap.has(e.target));
  }, [edges, visibleNodeMap]);

  const activeFocusId = hoveredNodeId || selectedNodeId;
  const connectedIds = useMemo(() => {
    const set = new Set<string>();
    if (!activeFocusId) return set;
    set.add(activeFocusId);
    visibleEdges.forEach((e) => {
      if (e.source === activeFocusId) set.add(e.target);
      if (e.target === activeFocusId) set.add(e.source);
    });
    return set;
  }, [activeFocusId, visibleEdges]);

  const selectedNode = useMemo(
    () => visibleNodes.find((n) => n.id === selectedNodeId) || null,
    [visibleNodes, selectedNodeId]
  );

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingNodeRef.current) {
      const dx = (e.clientX - draggingNodeRef.current.startX) / zoom;
      const dy = (e.clientY - draggingNodeRef.current.startY) / zoom;
      const id = draggingNodeRef.current.id;
      const nextX = draggingNodeRef.current.origX + dx;
      const nextY = draggingNodeRef.current.origY + dy;
      setNodePositions((prev) => ({
        ...prev,
        [id]: { x: nextX, y: nextY },
      }));
    } else if (panningRef.current) {
      const dx = e.clientX - panningRef.current.startX;
      const dy = e.clientY - panningRef.current.startY;
      setPan({
        x: panningRef.current.origPanX + dx,
        y: panningRef.current.origPanY + dy,
      });
    }
  };

  const handleSvgPointerUp = () => {
    draggingNodeRef.current = null;
    panningRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom((z) => Math.min(2.2, Math.max(0.5, Number((z + delta).toFixed(2)))));
  };

  const selectedPinned = useMemo(() => {
    if (!selectedNode?.assetRef) return false;
    if (selectedNode.category !== "dataset" && selectedNode.category !== "model") return false;
    const assetId = String(selectedNode.assetRef.id || selectedNode.assetRef.ref || selectedNode.label);
    return isAssetPinned(assetId);
  }, [selectedNode, isAssetPinned]);

  const handlePinSelected = () => {
    if (!selectedNode?.assetRef) return;
    if (selectedNode.category === "dataset" || selectedNode.category === "model") {
      const asset = selectedNode.assetRef;
      const assetId = String(asset.id || asset.ref || asset.name || selectedNode.label);
      togglePinAsset({
        id: assetId,
        type: selectedNode.category,
        title: String(asset.title || asset.name || selectedNode.label),
        subtitle: String(asset.subtitle || asset.architecture || asset.task || selectedNode.category),
        source: String(asset.source || (selectedNode.category === "model" ? "Hugging Face" : "Dataset")),
        score: Number(asset.matchScore ?? asset.relevanceScore ?? 75),
        badge: selectedNode.category === "model" ? "Model" : "Dataset",
        url: asset.url,
        data: asset,
        pinnedAt: Date.now(),
      });
    }
  };

  return (
    <div className="obsidian-card overflow-hidden flex flex-col">
      {/* Graph Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.07] bg-[#0A0D14]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
            <Network className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Interactive Knowledge &amp; Provenance Graph</h3>
            <p className="text-[11px] text-slate-400">
              Drag nodes to inspect topology &bull; Scroll to zoom &bull; Click any node to audit lineage
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filters */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#07090E] border border-white/[0.07]">
            {(["all", "dataset", "model", "paper"] as const).map((t) => {
              const active = filterType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilterType(t)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-lab cursor-pointer ${
                    active
                      ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                      : "text-slate-400 hover:text-slate-200 border border-transparent"
                  }`}
                >
                  {t === "all" ? `All (${nodesWithPositions.length})` : `${t}s`}
                </button>
              );
            })}
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#07090E] border border-white/[0.07]">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
              className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-white/5 cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] text-slate-300 px-1.5 tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.15).toFixed(2))))}
              className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-white/5 cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Reset graph layout"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
                setNodePositions({});
              }}
              className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-white/5 cursor-pointer"
              title="Reset zoom & layout"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Split: SVG Canvas + Node Inspection Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[540px]">
        <div className="lg:col-span-8 relative bg-[#07090E] bg-lab-grid overflow-hidden select-none">
          {/* Lane Headers Overlay */}
          <div className="pointer-events-none absolute top-3 left-4 right-4 flex justify-between text-[10px] font-mono uppercase tracking-widest text-slate-500">
            <span>01. Intent Query</span>
            <span>02. Curated Datasets</span>
            <span>03. Model Backbones</span>
            <span>04. Peer-Reviewed Evidence</span>
          </div>

          <svg
            viewBox="0 0 1060 560"
            className="w-full h-[520px] lg:h-[560px] cursor-grab active:cursor-grabbing touch-none"
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerLeave={handleSvgPointerUp}
            onWheel={handleWheel}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).tagName === "svg") {
                panningRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  origPanX: pan.x,
                  origPanY: pan.y,
                };
              }
            }}
          >
            <defs>
              <marker
                id="edge-arrow"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#475569" />
              </marker>
              <marker
                id="edge-arrow-active"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#38BDF8" />
              </marker>
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {visibleEdges.map((edge, idx) => {
                const src = visibleNodeMap.get(edge.source);
                const tgt = visibleNodeMap.get(edge.target);
                if (!src || !tgt) return null;

                const isHighlighted =
                  activeFocusId &&
                  (edge.source === activeFocusId || edge.target === activeFocusId);

                const midX = (src.x + tgt.x) / 2;
                const pathD = `M ${src.x + 88} ${src.y} C ${midX} ${src.y}, ${midX} ${tgt.y}, ${tgt.x - 88} ${tgt.y}`;

                return (
                  <g key={`${edge.source}-${edge.target}-${idx}`}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={isHighlighted ? "#38BDF8" : "rgba(148,163,184,0.22)"}
                      strokeWidth={isHighlighted ? 2.2 : 1.25}
                      strokeDasharray={isHighlighted ? undefined : "4 4"}
                      markerEnd={isHighlighted ? "url(#edge-arrow-active)" : "url(#edge-arrow)"}
                    />
                    {isHighlighted && (
                      <text
                        x={midX}
                        y={(src.y + tgt.y) / 2 - 6}
                        textAnchor="middle"
                        fill="#7DD3FC"
                        fontSize="10"
                        fontFamily="var(--font-mono), monospace"
                      >
                        {edge.relationship}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {visibleNodes.map((node) => {
                const palette = NODE_COLORS[node.category];
                const isSelected = node.id === selectedNodeId;
                const isDimmed =
                  activeFocusId !== null && !connectedIds.has(node.id);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{
                      opacity: isDimmed ? 0.35 : 1,
                      cursor: "pointer",
                      transition: "opacity 150ms ease",
                    }}
                    onPointerEnter={() => setHoveredNodeId(node.id)}
                    onPointerLeave={() => setHoveredNodeId(null)}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                      draggingNodeRef.current = {
                        id: node.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: node.x,
                        origY: node.y,
                      };
                    }}
                  >
                    <rect
                      x={-88}
                      y={-28}
                      width={176}
                      height={56}
                      rx={10}
                      fill={palette.fill}
                      stroke={isSelected ? "#38BDF8" : palette.stroke}
                      strokeWidth={isSelected ? 2.4 : 1.3}
                    />
                    <text
                      x={-74}
                      y={-8}
                      fill={palette.stroke}
                      fontSize="9.5"
                      fontWeight={700}
                      fontFamily="var(--font-mono), monospace"
                    >
                      {node.category.toUpperCase()}
                    </text>
                    <text
                      x={-74}
                      y={12}
                      fill="#F1F5F9"
                      fontSize="11.5"
                      fontWeight={600}
                      fontFamily="var(--font-sans), sans-serif"
                    >
                      {truncateLabel(node.label, 21)}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Node Inspection Side Panel */}
        <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-white/[0.07] bg-[#0D111A] p-5 flex flex-col justify-between gap-4">
          {selectedNode ? (
            <>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${
                      NODE_COLORS[selectedNode.category].pill
                    }`}
                  >
                    {NODE_COLORS[selectedNode.category].icon}
                    {selectedNode.category}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedNodeId(null)}
                    className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/5 cursor-pointer"
                    title="Clear selection"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <h4 className="text-base font-bold text-slate-100 leading-snug">
                    {selectedNode.label}
                  </h4>
                  <p className="text-[11px] font-mono text-slate-500 mt-1 break-all">
                    ID: {selectedNode.id}
                  </p>
                </div>

                {/* Metadata Grid */}
                <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Node Metadata &amp; Relationships
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedNode.metadata &&
                      Object.entries(selectedNode.metadata)
                        .filter(([k, v]) => k !== "asset" && v !== undefined && v !== null && k !== "url")
                        .slice(0, 6)
                        .map(([k, v]) => (
                          <div
                            key={k}
                            className="p-2.5 rounded-lg bg-[#07090E] border border-white/[0.06]"
                          >
                            <div className="text-[10px] text-slate-500 capitalize">{k}</div>
                            <div className="text-xs font-mono text-slate-200 truncate mt-0.5 tabular-nums">
                              {typeof v === "object" ? JSON.stringify(v) : String(v)}
                            </div>
                          </div>
                        ))}
                  </div>

                  {/* Connected edges summary */}
                  <div className="pt-2 space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Connected Graph Links
                    </div>
                    {edges
                      .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                      .slice(0, 5)
                      .map((e, idx) => {
                        const peerId = e.source === selectedNode.id ? e.target : e.source;
                        const peer = visibleNodeMap.get(peerId);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => peer && setSelectedNodeId(peer.id)}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.05] text-left transition-lab cursor-pointer"
                          >
                            <span className="text-xs text-slate-300 truncate max-w-[180px]">
                              {peer?.label || peerId}
                            </span>
                            <span className="font-mono text-[10px] text-sky-400 shrink-0">
                              {e.relationship}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/[0.07]">
                <button
                  type="button"
                  onClick={() =>
                    askAssistant(
                      `Analyze how "${selectedNode.label}" (${selectedNode.category}) integrates into this ML pipeline, including compatibility risks and best alternatives.`
                    )
                  }
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-semibold transition-lab cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Ask Copilot
                </button>

                {selectedNode.assetRef &&
                  (selectedNode.category === "dataset" || selectedNode.category === "model") && (
                    <button
                      type="button"
                      onClick={handlePinSelected}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-lab cursor-pointer ${
                        selectedPinned
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                          : "bg-white/[0.03] hover:bg-white/[0.07] border-white/10 text-slate-200"
                      }`}
                    >
                      <Pin className="w-3.5 h-3.5" />
                      {selectedPinned ? "Pinned" : "Pin"}
                    </button>
                  )}

                {(selectedNode.metadata?.url || selectedNode.assetRef?.url) && (
                  <a
                    href={selectedNode.metadata?.url || selectedNode.assetRef?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-slate-200 text-xs font-medium transition-lab"
                  >
                    Open <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
              <Network className="w-10 h-10 text-slate-600 mb-3" />
              <p className="text-sm font-semibold text-slate-300">Select a Node to Inspect</p>
              <p className="text-xs text-slate-500 mt-1">
                Click any query, dataset, model, or literature node on the canvas to inspect metadata and provenance links.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
