"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Cpu,
  Compass,
  GitCompareArrows,
  Map,
  Settings,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  ArrowRight,
  PanelLeft,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useSearchSession } from "@/hooks/useSearchSession";

export interface NavbarProps {
  className?: string;
  variant?: "landing" | "app";
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export function Navbar({ className = "", variant = "landing", onToggleSidebar, isSidebarOpen }: NavbarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const { pinnedAssets } = useSearchSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    if (profileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [profileMenuOpen]);

  const handleSignOut = async () => {
    setProfileMenuOpen(false);
    setMobileMenuOpen(false);
    try {
      localStorage.removeItem("aide_recent_searches_guest");
      localStorage.removeItem("aide_session_u_guest_query_v3");
      localStorage.removeItem("aide_session_u_guest_results_v3");
      localStorage.removeItem("aide_session_u_guest_pinned_v3");
    } catch {}
    await signOut({ callbackUrl: "/" });
  };

  const userInitial = session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || "U";
  const userName = session?.user?.name || session?.user?.email || "Researcher";
  const userEmail = session?.user?.email || "";

  const navLinks = [
    { href: "/", label: "Overview", icon: null },
    { href: "/explore", label: "Explore", icon: Compass },
    {
      href: "/benchmark",
      label: "Benchmarks",
      icon: GitCompareArrows,
      badge: pinnedAssets.length > 0 ? pinnedAssets.length : null,
    },
    { href: "/roadmap", label: "Roadmap", icon: Map },
  ];

  return (
    <header className={`sticky top-0 z-50 w-full glass-nav transition-lab isolate ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-slate-950 font-bold text-sm shadow-accent-sm group-hover:scale-105 transition-lab">
            <Cpu className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-primary">
              AI Dataset Explorer
            </span>
            <span className="text-[10px] text-faint font-mono -mt-0.5 hidden sm:block">
              Obsidian Research Lab · v2.4
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1 bg-card/80 p-1 rounded-xl border border-subtle">
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href !== "/" && pathname?.startsWith(link.href)) ||
              (link.href === "/roadmap" && pathname?.startsWith("/roadmaps")) ||
              (link.href === "/benchmark" && pathname?.startsWith("/search"));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-lab flex items-center gap-1.5 ${
                  isActive
                    ? "bg-card-hover text-primary border border-strong font-semibold shadow-xs"
                    : "text-muted hover:text-primary hover:bg-card-subtle border border-transparent"
                }`}
              >
                <span>{link.label}</span>
                {typeof link.badge === "number" && (
                  <span className="px-1.5 py-0.2 rounded-md bg-accent-subtle text-accent-from border border-accent/30 font-mono text-[10px] font-bold tabular-nums">
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {variant === "app" && onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className={`w-8 h-8 rounded-lg border border-subtle bg-card hover:bg-card-hover flex items-center justify-center transition-lab ${
                isSidebarOpen ? "text-accent-from border-accent/40" : "text-muted hover:text-primary"
              }`}
              title="Toggle sidebar"
              aria-label="Toggle sidebar"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="w-8 h-8 rounded-lg border border-subtle bg-card hover:bg-card-hover text-muted hover:text-primary flex items-center justify-center transition-lab"
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            aria-label="Toggle theme"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-slate-700" />
            )}
          </button>

          {!session?.user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="hidden sm:inline-flex px-3 py-1.5 text-xs font-medium text-secondary hover:text-primary hover:bg-card-hover border border-transparent hover:border-subtle rounded-lg transition-lab"
              >
                Sign In
              </Link>
              <Link
                href="/explore"
                className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-accent text-slate-950 shadow-accent-sm hover:brightness-110 transition-lab flex items-center gap-1.5"
              >
                <span>Open Workstation</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/explore"
                className="hidden sm:inline-flex px-3.5 py-1.5 text-xs font-bold rounded-lg bg-accent text-slate-950 shadow-accent-sm hover:brightness-110 transition-lab items-center gap-1.5"
              >
                <span>Launch Lab</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>

              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="w-8 h-8 rounded-lg bg-accent-subtle border border-accent/40 text-accent-from font-bold text-xs flex items-center justify-center hover:bg-sky-500/20 transition-lab"
                  title={`Signed in as ${userName}`}
                  aria-label="User profile"
                  aria-expanded={profileMenuOpen}
                >
                  {userInitial.toUpperCase()}
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-xl obsidian-card p-1.5 z-50 shadow-2xl">
                    <div className="px-3 py-2 border-b border-subtle">
                      <p className="text-xs font-bold text-primary truncate">{userName}</p>
                      <p className="text-[11px] font-mono text-faint truncate">{userEmail}</p>
                    </div>
                    <div className="py-1 space-y-0.5">
                      <Link
                        href="/explore"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-secondary hover:text-primary hover:bg-card-hover transition-lab"
                      >
                        <Compass className="w-3.5 h-3.5 text-accent-from" />
                        <span>Explore Studio</span>
                      </Link>
                      <Link
                        href="/benchmark"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-secondary hover:text-primary hover:bg-card-hover transition-lab"
                      >
                        <GitCompareArrows className="w-3.5 h-3.5 text-accent-from" />
                        <span>Benchmark Lab</span>
                      </Link>
                      <Link
                        href="/roadmap"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-secondary hover:text-primary hover:bg-card-hover transition-lab"
                      >
                        <Map className="w-3.5 h-3.5 text-accent-from" />
                        <span>Pipeline Roadmap</span>
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-secondary hover:text-primary hover:bg-card-hover transition-lab"
                      >
                        <Settings className="w-3.5 h-3.5 text-muted" />
                        <span>Settings & Quota</span>
                      </Link>
                    </div>
                    <div className="pt-1 border-t border-subtle">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-status-rose hover:bg-rose-500/10 transition-lab"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden w-8 h-8 rounded-lg border border-subtle bg-card hover:bg-card-hover text-secondary flex items-center justify-center transition-lab"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-subtle bg-rail px-4 pt-2 pb-5 space-y-2">
          <nav className="flex flex-col space-y-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href !== "/" && pathname?.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg transition-lab ${
                    isActive
                      ? "bg-accent-subtle text-accent-from border border-accent/30"
                      : "text-secondary hover:text-primary hover:bg-card-hover"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link
              href="/settings"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 text-xs font-semibold text-secondary hover:text-primary hover:bg-card-hover rounded-lg"
            >
              Settings & Billing
            </Link>
          </nav>

          <div className="pt-2 border-t border-subtle flex flex-col gap-2">
            {!session?.user ? (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center px-4 py-2 text-xs font-semibold text-secondary border border-subtle rounded-lg"
              >
                Sign In
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full text-center px-4 py-2 text-xs font-semibold text-status-rose bg-rose-500/10 border border-rose-500/20 rounded-lg"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar;
