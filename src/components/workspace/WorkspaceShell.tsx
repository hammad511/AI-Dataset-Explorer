"use client";

import React from "react";
import { LeftNavigationRail } from "./LeftNavigationRail";
import { TopCommandHeader } from "./TopCommandHeader";
import { AssistantDrawer } from "./AssistantDrawer";
import { CommandPalette } from "./CommandPalette";

interface WorkspaceShellProps {
  children: React.ReactNode;
  pageTitle?: string;
  onSelectSearch?: (query: string) => void;
  onNewSearch?: () => void;
}

export function WorkspaceShell({
  children,
  pageTitle,
  onSelectSearch,
  onNewSearch,
}: WorkspaceShellProps) {
  return (
    <div className="min-h-screen w-full flex bg-page text-primary relative overflow-x-clip">
      {/* Subtle Ambient Research Lab Glow */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 w-[680px] h-[380px] rounded-full bg-sky-500/10 blur-[130px] opacity-60" />
        <div className="absolute bottom-0 right-1/4 w-[520px] h-[380px] rounded-full bg-emerald-500/5 blur-[130px] opacity-60" />
      </div>

      {/* Zone 1: Left Collapsible Navigation Rail */}
      <LeftNavigationRail
        onSelectSearch={onSelectSearch}
        onNewSearch={onNewSearch}
      />

      {/* Zone 2: Top Command Header + Active Research Content Area */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <TopCommandHeader pageTitle={pageTitle} />
        <main className="flex-1 min-w-0 flex flex-col">{children}</main>
      </div>

      {/* Zone 3: Right Docked AI Research Assistant Drawer */}
      <AssistantDrawer />

      {/* Global ⌘K Command Palette */}
      <CommandPalette onSelectSearch={onSelectSearch} />
    </div>
  );
}

export default WorkspaceShell;
