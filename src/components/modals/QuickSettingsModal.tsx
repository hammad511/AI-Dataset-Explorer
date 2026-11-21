"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Settings, X, Sun, Moon, Monitor, ExternalLink, LogOut, LogIn, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import type { Theme, Accent } from "@/context/ThemeContext";

interface QuickSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickSettingsModal({ isOpen, onClose }: QuickSettingsModalProps) {
  const { data: session } = useSession();
  const { theme, accent, setTheme, setAccent } = useTheme();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const userInitial = session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || "G";
  const userName = session?.user?.name || session?.user?.email?.split("@")[0] || "Guest Researcher";
  const userEmail = session?.user?.email || "Sign in to sync sessions across devices";

  const accents: { id: Accent; label: string; dot: string }[] = [
    { id: "quantum-cyan", label: "Quantum Cyan", dot: "from-sky-400 to-cyan-500" },
    { id: "emerald", label: "Verification Emerald", dot: "from-emerald-400 to-teal-500" },
    { id: "violet-cyan", label: "Electric Violet", dot: "from-violet-500 to-cyan-400" },
    { id: "amber-rose", label: "Signal Amber", dot: "from-amber-400 to-rose-500" },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-2xl obsidian-card border border-strong shadow-2xl p-5 z-10 space-y-5">
        <div className="flex items-center justify-between border-b border-subtle pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-subtle border border-accent/40 text-accent-from flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-primary">Workspace Preferences</h3>
              <p className="text-[11px] font-mono text-faint">Theme, accents &amp; account</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-card-subtle hover:bg-card-hover border border-subtle text-muted hover:text-primary flex items-center justify-center transition-lab"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-page border border-subtle">
          <div className="w-10 h-10 rounded-xl bg-accent text-slate-950 font-black text-sm flex items-center justify-center shrink-0">
            {userInitial.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-primary block truncate">{userName}</span>
            <p className="text-[11px] font-mono text-faint truncate mt-0.5">{userEmail}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-faint block mb-2">
              Theme Surface
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "dark" as Theme, label: "Obsidian", Icon: Moon },
                { id: "light" as Theme, label: "Daylight", Icon: Sun },
                { id: "system" as Theme, label: "System", Icon: Monitor },
              ].map((t) => {
                const Icon = t.Icon;
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-lab flex items-center justify-center gap-1.5 ${
                      active
                        ? "border-accent bg-accent-subtle text-accent-from"
                        : "border-subtle bg-page hover:bg-card-hover text-secondary"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-faint block mb-2">
              Accent Spectrum
            </label>
            <div className="grid grid-cols-2 gap-2">
              {accents.map((acc) => {
                const active = accent === acc.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setAccent(acc.id)}
                    className={`flex items-center justify-between gap-2 p-2 rounded-xl border text-xs font-medium transition-lab ${
                      active
                        ? "border-accent bg-accent-subtle text-primary font-semibold"
                        : "border-subtle bg-page hover:bg-card-hover text-secondary"
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className={`w-3 h-3 rounded-full bg-gradient-to-r ${acc.dot} shrink-0`} />
                      <span className="truncate">{acc.label}</span>
                    </span>
                    {active && <Check className="w-3 h-3 text-accent-from shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-subtle flex items-center justify-between gap-3">
          <Link
            href="/settings"
            onClick={onClose}
            className="text-xs font-semibold text-accent-from hover:underline flex items-center gap-1"
          >
            <span>Open full settings &amp; billing</span>
            <ExternalLink className="w-3 h-3" />
          </Link>

          {session?.user ? (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold status-badge-rose border flex items-center gap-1.5"
            >
              <LogOut className="w-3 h-3" />
              Sign Out
            </button>
          ) : (
            <Link
              href="/login"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-primary bg-card-subtle border border-subtle flex items-center gap-1.5"
            >
              <LogIn className="w-3 h-3" />
              Sign In
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default QuickSettingsModal;
