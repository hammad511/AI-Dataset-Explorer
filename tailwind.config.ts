import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--bg-page)",
        foreground: "var(--text-primary)",
        obsidian: {
          950: "#07090E",
          900: "#0A0D14",
          850: "#0D111A",
          800: "#131926",
          700: "#1B2336",
        },
        quantum: {
          400: "#38BDF8",
          500: "#0EA5E9",
          600: "#0284C7",
        },
        emerald: {
          400: "#34D399",
          500: "#10B981",
        },
        amber: {
          400: "#FBBF24",
          500: "#F59E0B",
        },
        rose: {
          400: "#FB7185",
          500: "#F43F5E",
        },
      },
      fontFamily: {
        sans: ["var(--font-jakarta)", "var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      transitionTimingFunction: {
        lab: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      boxShadow: {
        "obsidian-card": "inset 0 1px 0 rgba(255,255,255,0.05), 0 16px 40px -16px rgba(0,0,0,0.65)",
        "quantum-glow": "0 0 28px rgba(56, 189, 248, 0.16)",
      },
    },
  },
  plugins: [],
};

export default config;
