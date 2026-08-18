"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export type Theme  = "dark" | "light" | "system";
export type Accent = "violet-cyan" | "emerald" | "amber-rose" | "blue-violet";

interface ThemeContextValue {
    theme:  Theme;
    accent: Accent;
    setTheme:  (t: Theme)  => void;
    setAccent: (a: Accent) => void;
    resolvedTheme: "dark" | "light"; // what's actually applied (system resolved)
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: "dark", accent: "violet-cyan",
    setTheme: () => {}, setAccent: () => {},
    resolvedTheme: "dark",
});

export function useTheme() {
    return useContext(ThemeContext);
}

// CSS custom properties per accent
const ACCENT_VARS: Record<Accent, { from: string; to: string; glow: string }> = {
    "violet-cyan":  { from: "#8B5CF6", to: "#06B6D4", glow: "rgba(139,92,246,0.4)"  },
    "emerald":      { from: "#10B981", to: "#06B6D4", glow: "rgba(16,185,129,0.4)"   },
    "amber-rose":   { from: "#F59E0B", to: "#EF4444", glow: "rgba(245,158,11,0.4)"   },
    "blue-violet":  { from: "#3B82F6", to: "#8B5CF6", glow: "rgba(59,130,246,0.4)"   },
};

function applyTheme(resolved: "dark" | "light", accent: Accent) {
    const root = document.documentElement;

    // ── theme ────────────────────────────────────────────────────────────
    root.setAttribute("data-theme", resolved);

    // ── accent CSS vars ──────────────────────────────────────────────────
    // Guard: fall back to violet-cyan if accent is invalid/undefined
    const vars = ACCENT_VARS[accent] ?? ACCENT_VARS["violet-cyan"];
    root.style.setProperty("--accent-from", vars.from);
    root.style.setProperty("--accent-to",   vars.to);
    root.style.setProperty("--accent-glow", vars.glow);
}

function resolveTheme(theme: Theme): "dark" | "light" {
    if (theme === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme,  setThemeState]  = useState<Theme>("dark");
    const [accent, setAccentState] = useState<Accent>("violet-cyan");
    const [resolvedTheme, setResolved] = useState<"dark" | "light">("dark");

    // Load from localStorage on mount
    useEffect(() => {
        // Strip JSON.stringify wrapping if the value was saved by the old useLocalState
        // hook (which called JSON.stringify, storing '"violet-cyan"' instead of 'violet-cyan')
        const VALID_THEMES:  Theme[]  = ["dark", "light", "system"];
        const VALID_ACCENTS: Accent[] = ["violet-cyan", "emerald", "amber-rose", "blue-violet"];

        const rawTheme  = localStorage.getItem("settings_theme")  ?? "dark";
        const rawAccent = localStorage.getItem("settings_accent") ?? "violet-cyan";

        // Remove surrounding quotes added by JSON.stringify if present
        const cleanTheme  = rawTheme.replace(/^"|"$/g,  "");
        const cleanAccent = rawAccent.replace(/^"|"$/g, "");

        const savedTheme:  Theme  = VALID_THEMES.includes(cleanTheme   as Theme)  ? (cleanTheme  as Theme)  : "dark";
        const savedAccent: Accent = VALID_ACCENTS.includes(cleanAccent as Accent) ? (cleanAccent as Accent) : "violet-cyan";

        // Re-save cleaned values so future loads don't need stripping
        localStorage.setItem("settings_theme",  savedTheme);
        localStorage.setItem("settings_accent", savedAccent);

        const resolved = resolveTheme(savedTheme);
        setThemeState(savedTheme);
        setAccentState(savedAccent);
        setResolved(resolved);
        applyTheme(resolved, savedAccent);
    }, []);

    // React to system theme changes when theme === "system"
    useEffect(() => {
        if (theme !== "system") return;
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = () => {
            const resolved = resolveTheme("system");
            setResolved(resolved);
            applyTheme(resolved, accent);
        };
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, [theme, accent]);

    const setTheme = useCallback((t: Theme) => {
        const resolved = resolveTheme(t);
        setThemeState(t);
        setResolved(resolved);
        localStorage.setItem("settings_theme", t);
        applyTheme(resolved, accent);
    }, [accent]);

    const setAccent = useCallback((a: Accent) => {
        setAccentState(a);
        localStorage.setItem("settings_accent", a);
        applyTheme(resolvedTheme, a);
    }, [resolvedTheme]);

    return (
        <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent, resolvedTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
