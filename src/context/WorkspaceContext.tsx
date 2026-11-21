"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { GpuVramCapacity } from "@/lib/workstation/vramEstimator";

export interface ProviderHealthSnapshot {
  status: string;
  timestamp: number;
  providers: {
    huggingface: { online: boolean; label: string };
    kaggle: { online: boolean; label: string };
    openalex: { online: boolean; label: string };
    arxiv: { online: boolean; label: string };
    pubmed: { online: boolean; enhancedRateLimit?: boolean; label: string };
    semanticScholar: { online: boolean; optionalKey?: boolean; label: string };
    crossref: { online: boolean; label: string };
  };
  llm: {
    activeProvider: string;
    model: string;
    hasGemini: boolean;
    hasFallbackLlm: boolean;
  };
}

export interface QuotaUsageSnapshot {
  todayCount: number;
  dailyLimit: number;
  remainingRequestsToday: number;
  usedPercentage: number;
  planName: string;
  planTier: string;
}

export type ModalityPreference = "all" | "vision" | "nlp" | "multimodal" | "tabular" | "audio";

interface WorkspaceContextValue {
  isRailCollapsed: boolean;
  setIsRailCollapsed: (v: boolean | ((p: boolean) => boolean)) => void;
  isMobileRailOpen: boolean;
  setIsMobileRailOpen: (v: boolean) => void;
  isAssistantOpen: boolean;
  setIsAssistantOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  assistantWidth: number;
  setAssistantWidth: (w: number) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  pendingAssistantPrompt: string | null;
  askAssistant: (prompt: string) => void;
  clearPendingAssistantPrompt: () => void;

  // Global Research Constraints shared between Landing Composer, Explore, Benchmark, Roadmap & Assistant
  gpuConstraintGb: GpuVramCapacity;
  setGpuConstraintGb: (gb: GpuVramCapacity) => void;
  commercialOnly: boolean;
  setCommercialOnly: (val: boolean) => void;
  modalityPreference: ModalityPreference;
  setModalityPreference: (m: ModalityPreference) => void;

  // Live Telemetry
  providerHealth: ProviderHealthSnapshot | null;
  quotaUsage: QuotaUsageSnapshot | null;
  refreshTelemetry: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status: authStatus } = useSession();

  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [isMobileRailOpen, setIsMobileRailOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantWidth, setAssistantWidth] = useState(400);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [pendingAssistantPrompt, setPendingAssistantPrompt] = useState<string | null>(null);

  const [gpuConstraintGb, setGpuConstraintGbState] = useState<GpuVramCapacity>(24);
  const [commercialOnly, setCommercialOnlyState] = useState<boolean>(false);
  const [modalityPreference, setModalityPreferenceState] = useState<ModalityPreference>("all");

  const [providerHealth, setProviderHealth] = useState<ProviderHealthSnapshot | null>(null);
  const [quotaUsage, setQuotaUsage] = useState<QuotaUsageSnapshot | null>(null);

  // Restore saved workspace constraints on mount
  useEffect(() => {
    try {
      const savedGpu = Number(localStorage.getItem("aide_gpu_constraint_gb"));
      if ([8, 16, 24, 80].includes(savedGpu)) {
        setGpuConstraintGbState(savedGpu as GpuVramCapacity);
      }
      const savedCommercial = localStorage.getItem("aide_commercial_only");
      if (savedCommercial === "true") setCommercialOnlyState(true);
      const savedMod = localStorage.getItem("aide_modality_pref") as ModalityPreference | null;
      if (savedMod && ["all", "vision", "nlp", "multimodal", "tabular", "audio"].includes(savedMod)) {
        setModalityPreferenceState(savedMod);
      }
      const savedCollapsed = localStorage.getItem("aide_rail_collapsed");
      if (savedCollapsed === "true") setIsRailCollapsed(true);
    } catch {}
  }, []);

  const setGpuConstraintGb = useCallback((gb: GpuVramCapacity) => {
    setGpuConstraintGbState(gb);
    try {
      localStorage.setItem("aide_gpu_constraint_gb", String(gb));
    } catch {}
  }, []);

  const setCommercialOnly = useCallback((val: boolean) => {
    setCommercialOnlyState(val);
    try {
      localStorage.setItem("aide_commercial_only", String(val));
    } catch {}
  }, []);

  const setModalityPreference = useCallback((m: ModalityPreference) => {
    setModalityPreferenceState(m);
    try {
      localStorage.setItem("aide_modality_pref", m);
    } catch {}
  }, []);

  const toggleRailCollapsed = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    setIsRailCollapsed((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      try {
        localStorage.setItem("aide_rail_collapsed", String(next));
      } catch {}
      return next;
    });
  }, []);

  const refreshTelemetry = useCallback(async () => {
    if (pathname === "/login" || pathname === "/signup") {
      return;
    }
    try {
      const [healthRes, usageRes] = await Promise.all([
        fetch("/api/health").catch(() => null),
        authStatus === "authenticated"
          ? fetch("/api/user/usage").catch(() => null)
          : Promise.resolve(null),
      ]);
      if (healthRes && healthRes.ok) {
        const h = await healthRes.json();
        setProviderHealth(h);
      }
      if (usageRes && usageRes.ok) {
        const u = await usageRes.json();
        if (u?.success && u.usage) {
          setQuotaUsage(u.usage);
        }
      }
    } catch {}
  }, [pathname, authStatus]);

  useEffect(() => {
    refreshTelemetry();
  }, [refreshTelemetry]);

  const askAssistant = useCallback((prompt: string) => {
    setIsAssistantOpen(true);
    setPendingAssistantPrompt(prompt);
  }, []);

  const clearPendingAssistantPrompt = useCallback(() => {
    setPendingAssistantPrompt(null);
  }, []);

  // Global IDE keyboard shortcuts: Cmd/Ctrl + K, Cmd/Ctrl + I, Cmd/Ctrl + 1..4
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((p) => !p);
        return;
      }

      if (e.key.toLowerCase() === "i" && !e.shiftKey) {
        e.preventDefault();
        setIsAssistantOpen((p) => !p);
        return;
      }

      if (isInputFocused) return;

      if (e.key === "1") {
        e.preventDefault();
        router.push("/explore");
      } else if (e.key === "2") {
        e.preventDefault();
        router.push("/benchmark");
      } else if (e.key === "3") {
        e.preventDefault();
        router.push("/roadmap");
      } else if (e.key === "4") {
        e.preventDefault();
        router.push("/settings?tab=Usage");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <WorkspaceContext.Provider
      value={{
        isRailCollapsed,
        setIsRailCollapsed: toggleRailCollapsed,
        isMobileRailOpen,
        setIsMobileRailOpen,
        isAssistantOpen,
        setIsAssistantOpen,
        assistantWidth,
        setAssistantWidth,
        isCommandPaletteOpen,
        setIsCommandPaletteOpen,
        pendingAssistantPrompt,
        askAssistant,
        clearPendingAssistantPrompt,
        gpuConstraintGb,
        setGpuConstraintGb,
        commercialOnly,
        setCommercialOnly,
        modalityPreference,
        setModalityPreference,
        providerHealth,
        quotaUsage,
        refreshTelemetry,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
