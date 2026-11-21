"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[App Router Error Boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full obsidian-card p-8 border-rose-500/30 text-center space-y-5">
        <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/25 text-[10px] font-mono font-semibold uppercase tracking-wider">
            Workstation Recovery Shield
          </span>
          <h2 className="text-lg font-bold text-slate-100">
            Unexpected Workstation Fault
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {error.message || "A client-side rendering issue occurred. Your session state has been preserved."}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold cursor-pointer transition-lab"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry Render
          </button>
          <Link
            href="/explore"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/10 bg-[#0D111A] hover:bg-[#131926] text-xs text-slate-300 font-medium transition-lab"
          >
            <Home className="w-3.5 h-3.5" /> Reset Studio
          </Link>
        </div>

        {error.digest && (
          <p className="text-[10px] font-mono text-slate-600">
            Digest: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
