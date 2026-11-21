"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export type Theme = "dark" | "light" | "system";
export type Accent = "quantum-cyan" | "violet-cyan" | "emerald" | "amber-rose" | "blue-violet";

interface ThemeContextValue {
    theme: Theme;
    accent: Accent;
    setTheme: (t: Theme) => void;
    setAccent: (a: Accent) => void;
    resolvedTheme: "dark" | "light";
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: "dark",
    accent: "quantum-cyan",
    setTheme: () => {},
    setAccent: () => {},
    resolvedTheme: "dark",
});

export function useTheme() {
    return useContext(ThemeContext);
}

const ACCENT_VARS: Record<Accent, { from: string; to: string; glow: string; subtle: string }> = {
    "quantum-cyan": {
        from: "#38BDF8",
        to: "#0EA5E9",
        glow: "rgba(56, 189, 248, 0.18)",
        subtle: "rgba(56, 189, 248, 0.10)",
    },
    "violet-cyan": {
        from: "#8B5CF6",
        to: "#06B6D4",
        glow: "rgba(139, 92, 246, 0.24)",
        subtle: "rgba(139, 92, 246, 0.12)",
    },
    emerald: {
        from: "#10B981",
        to: "#06B6D4",
        glow: "rgba(16, 185, 129, 0.22)",
        subtle: "rgba(16, 185, 129, 0.12)",
    },
    "amber-rose": {
        from: "#F59E0B",
        to: "#F43F5E",
        glow: "rgba(245, 158, 11, 0.22)",
        subtle: "rgba(245, 158, 11, 0.12)",
    },
    "blue-violet": {
        from: "#0EA5E9",
        to: "#8B5CF6",
        glow: "rgba(14, 165, 233, 0.22)",
        subtle: "rgba(14, 165, 233, 0.12)",
    },
};

function applyTheme(resolved: "dark" | "light", accent: Accent) {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    const vars = ACCENT_VARS[accent] ?? ACCENT_VARS["quantum-cyan"];
    root.style.setProperty("--accent-from", vars.from);
    root.style.setProperty("--accent-to", vars.to);
    root.style.setProperty("--accent-glow", vars.glow);
    root.style.setProperty("--accent-bg-subtle", vars.subtle);
}

function resolveTheme(theme: Theme): "dark" | "light" {
    if (theme === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>("dark");
    const [accent, setAccentState] = useState<Accent>("quantum-cyan");
    const [resolvedTheme, setResolved] = useState<"dark" | "light">("dark");

    useEffect(() => {
        const VALID_THEMES: Theme[] = ["dark", "light", "system"];
        const VALID_ACCENTS: Accent[] = ["quantum-cyan", "violet-cyan", "emerald", "amber-rose", "blue-violet"];

        const rawTheme = localStorage.getItem("settings_theme") ?? "dark";
        const rawAccent = localStorage.getItem("settings_accent") ?? "quantum-cyan";

        const cleanTheme = rawTheme.replace(/^"|"$/g, "");
        const cleanAccent = rawAccent.replace(/^"|"$/g, "");

        const savedTheme: Theme = VALID_THEMES.includes(cleanTheme as Theme) ? (cleanTheme as Theme) : "dark";
        const savedAccent: Accent = VALID_ACCENTS.includes(cleanAccent as Accent) ? (cleanAccent as Accent) : "quantum-cyan";

        localStorage.setItem("settings_theme", savedTheme);
        localStorage.setItem("settings_accent", savedAccent);

        const resolved = resolveTheme(savedTheme);
        setThemeState(savedTheme);
        setAccentState(savedAccent);
        setResolved(resolved);
        applyTheme(resolved, savedAccent);
    }, []);

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

    const setTheme = useCallback(
        (t: Theme) => {
            const resolved = resolveTheme(t);
            setThemeState(t);
            setResolved(resolved);
            localStorage.setItem("settings_theme", t);
            applyTheme(resolved, accent);
        },
        [accent]
    );

    const setAccent = useCallback(
        (a: Accent) => {
            setAccentState(a);
            localStorage.setItem("settings_accent", a);
            applyTheme(resolvedTheme, a);
        },
        [resolvedTheme]
    );

    return (
        <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent, resolvedTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
