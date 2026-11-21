"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles,
  X,
  Send,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  Trash2,
  Cpu,
  Terminal,
  GripVertical,
} from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useSearchSession } from "@/context/SearchSessionContext";

interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  feedback?: "positive" | "negative" | null;
}

/**
 * Safe pure-React Markdown + Fenced Code Block renderer.
 * Avoids dangerouslySetInnerHTML cleanly to satisfy XSS security rules.
 */
function SafeMarkdownMessage({ content }: { content: string }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const segments = content.split(/(```[\s\S]*?```)/g);

  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={idx} className="font-semibold text-primary">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={idx}
            className="px-1 py-0.5 rounded bg-card-subtle border border-subtle font-mono text-[11px] text-accent-from"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-2.5 text-xs leading-relaxed text-secondary">
      {segments.map((seg, i) => {
        if (seg.startsWith("```") && seg.endsWith("```")) {
          const inner = seg.slice(3, -3);
          const firstNewline = inner.indexOf("\n");
          const lang = firstNewline > -1 ? inner.slice(0, firstNewline).trim() : "code";
          const codeBody = firstNewline > -1 ? inner.slice(firstNewline + 1) : inner;

          return (
            <div key={i} className="rounded-xl border border-subtle bg-code overflow-hidden my-2">
              <div className="px-3 py-1.5 border-b border-subtle bg-white/[0.02] flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase text-faint flex items-center gap-1.5">
                  <Terminal className="w-3 h-3 text-accent-from" />
                  {lang || "snippet"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(codeBody);
                    setCopiedIdx(i);
                    setTimeout(() => setCopiedIdx(null), 1600);
                  }}
                  className="text-[10px] font-mono text-muted hover:text-primary flex items-center gap-1 transition-lab"
                >
                  {copiedIdx === i ? <Check className="w-3 h-3 text-status-emerald" /> : <Copy className="w-3 h-3" />}
                  {copiedIdx === i ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="p-3 overflow-x-auto font-mono text-[11px] text-sky-200 leading-relaxed">
                <code>{codeBody}</code>
              </pre>
            </div>
          );
        }

        const lines = seg.split("\n").filter((l, idx, arr) => !(l === "" && idx === arr.length - 1));
        return (
          <div key={i} className="space-y-1.5">
            {lines.map((line, lineIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lineIdx} className="h-1" />;
              if (trimmed.startsWith("### ")) {
                return (
                  <h4 key={lineIdx} className="text-xs font-bold text-primary pt-1">
                    {renderInline(trimmed.slice(4))}
                  </h4>
                );
              }
              if (trimmed.startsWith("## ")) {
                return (
                  <h3 key={lineIdx} className="text-sm font-bold text-primary pt-1">
                    {renderInline(trimmed.slice(3))}
                  </h3>
                );
              }
              if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2 pl-1">
                    <span className="text-accent-from mt-0.5 text-[10px]">◆</span>
                    <span className="flex-1">{renderInline(trimmed.slice(2))}</span>
                  </div>
                );
              }
              return <p key={lineIdx}>{renderInline(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export function AssistantDrawer() {
  const {
    isAssistantOpen,
    setIsAssistantOpen,
    assistantWidth,
    setAssistantWidth,
    pendingAssistantPrompt,
    clearPendingAssistantPrompt,
    gpuConstraintGb,
  } = useWorkspace();

  const { query, searchResult, selectedDataset, selectedModel, activeTemplate } = useSearchSession();

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [conversationId] = useState(() => `copilot_${Date.now()}`);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef(false);

  const sessionContextPayload = {
    query: query || activeTemplate?.query || "",
    gpuVramGb: gpuConstraintGb,
    domain: searchResult?.summary?.domain || activeTemplate?.domain,
    modality: searchResult?.summary?.dataType || activeTemplate?.targetModality,
    topDatasets: (searchResult?.datasets || activeTemplate?.datasets || []).slice(0, 3).map((d: any) => ({
      id: d.id,
      name: d.title || d.name,
      license: d.license,
      modality: d.modality,
      matchScore: d.matchScore,
    })),
    topModels: (searchResult?.models || activeTemplate?.models || []).slice(0, 3).map((m: any) => ({
      id: m.id,
      name: m.name,
      architecture: m.architecture,
      paramsCount: m.paramsCount || m.parameters,
      matchScore: m.matchScore,
    })),
    focusedDataset: selectedDataset ? selectedDataset.title || selectedDataset.name : undefined,
    focusedModel: selectedModel ? selectedModel.name || selectedModel.id : undefined,
    feasibility: searchResult?.feasibility || undefined,
    hardware: searchResult?.hardware || activeTemplate?.hardwareProfile || undefined,
  };

  const sendMessage = useCallback(
    async (textToSend: string) => {
      const clean = textToSend.trim();
      if (!clean || isSending) return;

      const userMsg: AssistantMessage = {
        id: `u_${Date.now()}`,
        role: "user",
        content: clean,
        timestamp: Date.now(),
      };

      const nextThread = [...messages, userMsg];
      setMessages(nextThread);
      setInput("");
      setIsSending(true);

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            messages: nextThread.map((m) => ({ role: m.role, content: m.content })),
            context: sessionContextPayload,
          }),
        });

        const data = await res.json().catch(() => null);
        let replyText =
          data?.answer ||
          data?.message ||
          data?.analysis?.ai_analysis ||
          data?.error?.message ||
          "Assistant response unavailable right now. Please retry.";

        if (data?.success && !data?.answer && Array.isArray(data?.datasets) && data.datasets.length > 0) {
          replyText = `### Session Intelligence\nFound **${data.datasets.length} datasets**, **${data.models?.length || 0} models**, and **${data.papers?.length || 0} papers** matching your inquiry.\n\n- Top dataset: **${data.datasets[0].title || data.datasets[0].name}**\n- Recommended architecture: **${data.models?.[0]?.name || data.models?.[0]?.id || "Baseline Transformer"}**`;
        }

        const assistantMsg: AssistantMessage = {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: replyText,
          timestamp: Date.now(),
          feedback: null,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: "assistant",
            content: "Network interruption while reaching `/api/assistant`. Please try again.",
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsSending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, isSending, conversationId, query, gpuConstraintGb, selectedDataset, selectedModel]
  );

  // Consume prompts dispatched from Graph nodes or Cards ("Ask AI about this node")
  useEffect(() => {
    if (isAssistantOpen && pendingAssistantPrompt) {
      const prompt = pendingAssistantPrompt;
      clearPendingAssistantPrompt();
      sendMessage(prompt);
    }
  }, [isAssistantOpen, pendingAssistantPrompt, clearPendingAssistantPrompt, sendMessage]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  // Drag resize handler on desktop
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const newWidth = Math.min(480, Math.max(360, window.innerWidth - e.clientX));
      setAssistantWidth(newWidth);
    };
    const onUp = () => {
      resizingRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setAssistantWidth]);

  const handleFeedback = async (msgId: string, rating: "positive" | "negative") => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, feedback: rating } : m)));
    try {
      await fetch("/api/search/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchId: searchResult?.searchId || conversationId,
          query: query || "assistant_copilot",
          candidateId: msgId,
          candidateType: "model",
          rating,
          reasons: [],
        }),
      });
    } catch {}
  };

  if (!isAssistantOpen) return null;

  const promptChips = [
    `Compare top 2 models for my ${gpuConstraintGb}GB GPU`,
    "Check commercial license risks",
    "Generate QLoRA config",
  ];

  const renderDrawerInner = () => (
    <div className="flex flex-col h-full bg-rail border-l border-subtle relative">
      {/* Resize Drag Handle (Desktop) */}
      <div
        onMouseDown={() => {
          resizingRef.current = true;
        }}
        className="hidden lg:flex absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize items-center justify-center group z-20"
        title="Drag to resize copilot width"
      >
        <div className="w-0.5 h-10 rounded-full bg-subtle group-hover:bg-accent-from transition-colors flex items-center justify-center">
          <GripVertical className="w-3 h-3 text-faint opacity-0 group-hover:opacity-100" />
        </div>
      </div>

      {/* Header */}
      <div className="h-[52px] px-4 border-b border-subtle flex items-center justify-between gap-2 shrink-0 bg-page/60">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-accent-subtle border border-accent/40 text-accent-from flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-primary truncate">Research Copilot</h3>
            <p className="text-[10px] font-mono text-faint truncate">
              Context: {query ? `"${query.slice(0, 26)}"` : activeTemplate?.id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="w-7 h-7 rounded-lg text-faint hover:text-status-rose hover:bg-card-hover flex items-center justify-center transition-lab"
              title="Clear thread"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsAssistantOpen(false)}
            className="w-7 h-7 rounded-lg text-muted hover:text-primary hover:bg-card-hover flex items-center justify-center transition-lab"
            aria-label="Close AI Assistant"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Session Context Strip */}
      <div className="px-4 py-2 border-b border-subtle bg-card/50 flex items-center justify-between gap-2 text-[10px] font-mono text-muted shrink-0">
        <span className="truncate">
          {(searchResult?.datasets?.length || activeTemplate?.datasets?.length || 0)} DS ·{" "}
          {(searchResult?.models?.length || activeTemplate?.models?.length || 0)} Models
        </span>
        <span className="flex items-center gap-1 text-accent-from shrink-0">
          <Cpu className="w-3 h-3" />
          {gpuConstraintGb}GB Target
        </span>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-2xl obsidian-card p-4 space-y-2">
              <div className="text-xs font-bold text-primary flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-status-emerald animate-pulse" />
                Session-Aware Research Assistant
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                Ask questions grounded in your active datasets, model architectures, scholarly evidence, license constraints, and{" "}
                <span className="font-mono text-primary">{gpuConstraintGb}GB</span> GPU budget.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-faint px-1">
                One-Click Prompts
              </div>
              {promptChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => sendMessage(chip)}
                  className="w-full text-left px-3 py-2 rounded-xl bg-card hover:bg-card-hover border border-subtle hover:border-accent/40 text-xs text-secondary hover:text-primary transition-lab flex items-center justify-between gap-2 group"
                >
                  <span>{chip}</span>
                  <span className="text-faint group-hover:text-accent-from font-mono text-[10px]">→</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`space-y-1.5 ${
                msg.role === "user" ? "pl-6" : ""
              }`}
            >
              <div
                className={`rounded-2xl p-3.5 ${
                  msg.role === "user"
                    ? "bg-accent-subtle border border-accent/30 text-xs text-primary"
                    : "obsidian-card"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px] font-mono text-faint">
                  <span>{msg.role === "user" ? "YOU" : "COPILOT · /api/assistant"}</span>
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {msg.role === "user" ? (
                  <p className="text-xs leading-relaxed text-primary">{msg.content}</p>
                ) : (
                  <SafeMarkdownMessage content={msg.content} />
                )}

                {msg.role === "assistant" && (
                  <div className="mt-2.5 pt-2 border-t border-subtle flex items-center justify-between">
                    <span className="text-[10px] font-mono text-faint">Helpful?</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleFeedback(msg.id, "positive")}
                        className={`p-1 rounded-md transition-lab ${
                          msg.feedback === "positive"
                            ? "bg-emerald-500/20 text-status-emerald"
                            : "text-faint hover:text-primary hover:bg-card-hover"
                        }`}
                        title="Mark response accurate & helpful"
                      >
                        <ThumbsUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(msg.id, "negative")}
                        className={`p-1 rounded-md transition-lab ${
                          msg.feedback === "negative"
                            ? "bg-rose-500/20 text-status-rose"
                            : "text-faint hover:text-primary hover:bg-card-hover"
                        }`}
                        title="Flag issue or hallucination"
                      >
                        <ThumbsDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isSending && (
          <div className="rounded-2xl obsidian-card p-3.5 flex items-center gap-2.5 text-xs text-muted">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-accent-from border-t-transparent animate-spin" />
            <span className="font-mono text-[11px]">Synthesizing grounded response...</span>
          </div>
        )}
        <div ref={scrollEndRef} />
      </div>

      {/* Quick Prompt Strip + Composer */}
      <div className="p-3 border-t border-subtle bg-page/70 space-y-2 shrink-0">
        {messages.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {promptChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => sendMessage(chip)}
                disabled={isSending}
                className="px-2.5 py-1 rounded-lg bg-card hover:bg-card-hover border border-subtle text-[10px] font-medium text-muted hover:text-primary whitespace-nowrap shrink-0 transition-lab"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Ask about VRAM fit, licenses, loss functions, or QLoRA..."
            className="flex-1 rounded-xl bg-input border border-subtle focus:border-accent px-3 py-2 text-xs text-primary placeholder:text-faint outline-none resize-none transition-lab"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="h-9 w-9 rounded-xl bg-accent text-slate-950 font-bold flex items-center justify-center shrink-0 hover:brightness-110 disabled:opacity-40 transition-lab"
            aria-label="Send message to Research Copilot"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Docked Right Drawer */}
      <aside
        aria-label="AI Research Assistant Drawer"
        style={{ width: `${assistantWidth}px` }}
        className="hidden lg:flex flex-col shrink-0 sticky top-0 h-screen z-20"
      >
        {renderDrawerInner()}
      </aside>

      {/* Tablet / Mobile Slide-over Overlay Drawer */}
      <div className="fixed inset-0 z-50 lg:hidden flex justify-end">
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-xs"
          onClick={() => setIsAssistantOpen(false)}
        />
        <aside className="relative w-full max-w-[400px] h-full z-10 shadow-2xl">
          {renderDrawerInner()}
        </aside>
      </div>
    </>
  );
}
