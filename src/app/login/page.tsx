"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { signInCredentialsSafe } from "@/lib/workstation/authClient";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import {
  Sparkles,
  ShieldCheck,
  Database,
  Cpu,
  BookOpen,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";

const NEXTAUTH_ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Invalid email or password. Please check your credentials and try again.",
  SessionRequired: "Please sign in to access this page.",
  AccessDenied: "Access denied. You do not have permission to sign in.",
  Configuration: "There is a problem with the Google OAuth configuration. Please try again or use email sign-in.",
  OAuthSignin: "There was a problem starting Google Sign-In. Please try again.",
  OAuthCallback: "There was a problem verifying your Google account. Please try again.",
  OAuthCreateAccount: "Could not create your OAuth account. Please try again.",
  EmailCreateAccount: "Could not create your account. Please try again.",
  Callback: "An authentication callback error occurred. Please try again.",
  OAuthAccountNotLinked: "This email is already linked to another sign-in method.",
  EmailSignin: "The sign-in email could not be sent. Please try again.",
  Default: "Invalid email or password. Please check your credentials and try again.",
};

function resolveAuthErrorMessage(errorCode: string): string {
  if (!errorCode) return NEXTAUTH_ERROR_MESSAGES.Default;
  if (NEXTAUTH_ERROR_MESSAGES[errorCode]) {
    return NEXTAUTH_ERROR_MESSAGES[errorCode];
  }
  if (errorCode.includes(" ")) {
    return errorCode;
  }
  return NEXTAUTH_ERROR_MESSAGES.Default;
}

function ObsidianAuthShowcase() {
  return (
    <div className="hidden lg:flex flex-col justify-between p-10 bg-[#0A0D14] bg-lab-grid border-l border-white/[0.07] relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-sky-500/10 blur-[120px]" />

      <div className="space-y-2 relative z-10">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-[11px] font-semibold uppercase tracking-wider text-sky-300">
          <Sparkles className="w-3.5 h-3.5" /> Autonomous Research Workstation
        </span>
        <h2 className="text-2xl font-bold text-slate-100 tracking-tight leading-snug pt-2">
          From research hypothesis to verified PyTorch pipeline in seconds.
        </h2>
        <p className="text-xs text-slate-400 max-w-md leading-relaxed">
          Query 7 live scientific &amp; ML registries simultaneously with anti-hallucination citation verification and hardware VRAM simulation.
        </p>
      </div>

      {/* Live Preview Mockup Card */}
      <div className="obsidian-card p-5 space-y-4 relative z-10 my-8">
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400">
              ACTIVE BLUEPRINT PREVIEW
            </span>
            <h3 className="text-sm font-bold text-slate-100 mt-0.5">
              Clinical Pathology NER &times; BioMed-RoBERTa
            </h3>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] font-bold">
            94% Feasible
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/[0.06]">
            <div className="flex items-center gap-1 text-[10px] text-emerald-400 mb-1">
              <Database className="w-3 h-3" /> Dataset
            </div>
            <div className="font-semibold text-slate-200 truncate">BC5CDR / MIMIC</div>
            <div className="font-mono text-[10px] text-slate-500 mt-0.5">Apache-2.0</div>
          </div>
          <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/[0.06]">
            <div className="flex items-center gap-1 text-[10px] text-indigo-400 mb-1">
              <Cpu className="w-3 h-3" /> Backbone
            </div>
            <div className="font-semibold text-slate-200 truncate">BioLinkBERT</div>
            <div className="font-mono text-[10px] text-sky-400 mt-0.5">6.8 GB QLoRA</div>
          </div>
          <div className="p-2.5 rounded-lg bg-[#07090E] border border-white/[0.06]">
            <div className="flex items-center gap-1 text-[10px] text-amber-400 mb-1">
              <BookOpen className="w-3 h-3" /> Evidence
            </div>
            <div className="font-semibold text-slate-200 truncate">14 Citations</div>
            <div className="font-mono text-[10px] text-slate-500 mt-0.5">PubMed + ArXiv</div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between font-mono text-[10px] text-slate-400">
            <span>24GB A10G Memory Allocation</span>
            <span className="text-emerald-400">6.8 / 24.0 GB (28%)</span>
          </div>
          <div className="h-2 rounded-full bg-[#07090E] overflow-hidden flex">
            <div className="w-[18%] bg-sky-400" />
            <div className="w-[6%] bg-indigo-400" />
            <div className="w-[4%] bg-emerald-400" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-slate-400 relative z-10">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> Argon2 / bcrypt Security
        </span>
        <span className="font-mono text-slate-500">&bull;</span>
        <span>Synchronized Cloud Search History</span>
      </div>
    </div>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTarget = searchParams?.get("redirect_to") || searchParams?.get("callbackUrl") || "/explore";
  const isSafe = rawTarget.startsWith("/") && !rawTarget.startsWith("//") && !rawTarget.includes("\\");
  const targetUrl = isSafe ? rawTarget : "/explore";

  const [email, setEmail] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [mode, setMode] = useState<"login" | "forgot" | "reset">("login");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    const urlError = searchParams?.get("error");
    if (urlError) {
      setError(resolveAuthErrorMessage(urlError));
    }
    if (searchParams?.get("registered") === "true") {
      setInfoMessage("Account created successfully! Please sign in below.");
    }
    const urlResetToken = searchParams?.get("reset_token");
    if (urlResetToken) {
      setResetToken(urlResetToken);
      setMode("reset");
    }
  }, [searchParams]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address first.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Unable to request password reset.");
      } else {
        setInfoMessage(data.message || "If an account exists, reset instructions have been generated.");
        if (data.devResetToken) {
          setResetToken(data.devResetToken);
        }
        setMode("reset");
      }
    } catch {
      setError("Network error while requesting password reset.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!resetToken.trim()) {
      setError("Please enter your password reset token.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: resetToken.trim(),
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Password reset failed.");
      } else {
        setInfoMessage(data.message || "Password updated! You can now sign in with your new password.");
        setPassword("");
        setNewPassword("");
        setResetToken("");
        setMode("login");
      }
    } catch {
      setError("Network error while resetting password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#07090E] text-slate-100 grid grid-cols-1 lg:grid-cols-2">
      {/* Left Auth Form Column */}
      <div className="flex flex-col justify-between p-6 sm:p-10 lg:p-14">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-slate-950 font-bold shadow-[0_0_20px_rgba(56,189,248,0.25)]">
              ✦
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-slate-100 block leading-none">
                AI Dataset Explorer
              </span>
              <span className="font-mono text-[10px] text-sky-400">RESEARCH WORKSTATION</span>
            </div>
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-lab"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </Link>
        </div>

        <div className="w-full max-w-md mx-auto my-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              {mode === "login"
                ? "Sign in to Workstation"
                : mode === "forgot"
                ? "Reset Your Password"
                : "Set New Password"}
            </h1>
            <p className="text-xs text-slate-400">
              {mode === "login"
                ? "Access unlimited multi-source discovery, benchmark matrices & exportable blueprints."
                : mode === "forgot"
                ? "Enter your registered email to receive a password reset token."
                : "Paste your reset token and enter a new password."}
            </p>
          </div>

          <div className="obsidian-card p-6 sm:p-7 space-y-5">
            {mode === "login" && (
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError(null);
                  setInfoMessage(null);

                  const cleanEmail = email.trim();
                  if (!cleanEmail || !password) {
                    setError("Please enter both your email address and password.");
                    return;
                  }

                  setIsLoading(true);
                  try {
                    const { ok, error: authErr } = await signInCredentialsSafe(cleanEmail, password);
                    if (authErr) {
                      setError(resolveAuthErrorMessage(authErr));
                    } else if (ok) {
                      window.location.assign(targetUrl);
                    } else {
                      setError("Invalid email or password. Please check your credentials and try again.");
                    }
                  } catch {
                    setError("Unable to connect. Please check your internet connection and try again.");
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
                    htmlFor="email"
                  >
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="w-full rounded-xl border border-white/10 bg-[#07090E] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-sky-500/60 transition-lab"
                    placeholder="researcher@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      className="text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                      htmlFor="password"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setInfoMessage(null);
                        setMode("forgot");
                      }}
                      className="text-xs font-medium text-sky-400 hover:text-sky-300 cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-white/10 bg-[#07090E] pl-4 pr-11 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-sky-500/60 transition-lab"
                      placeholder="••••••••"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                      aria-label={showPassword ? "Hide secret" : "Reveal secret"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!hydrated || isLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-400 to-sky-500 hover:from-sky-300 hover:to-sky-400 text-slate-950 font-semibold text-sm transition-lab disabled:opacity-50 cursor-pointer shadow-[0_0_20px_rgba(56,189,248,0.2)]"
                >
                  {isLoading ? "Signing in..." : "Sign In →"}
                </button>
              </form>
            )}

            {mode === "forgot" && (
              <form className="space-y-4" onSubmit={handleForgotPassword}>
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
                    htmlFor="forgot-email"
                  >
                    Account Email Address
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="researcher@example.com"
                    className="w-full rounded-xl border border-white/10 bg-[#07090E] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500/60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? "Sending..." : "Generate Reset Token →"}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="w-full text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Back to Sign In
                </button>
              </form>
            )}

            {mode === "reset" && (
              <form className="space-y-4" onSubmit={handleResetPassword}>
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
                    htmlFor="reset-token"
                  >
                    Reset Token
                  </label>
                  <input
                    id="reset-token"
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Paste reset token"
                    className="w-full rounded-xl border border-white/10 bg-[#07090E] px-4 py-2.5 text-xs font-mono text-slate-100 outline-none focus:border-sky-500/60"
                  />
                </div>
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
                    htmlFor="new-password"
                  >
                    New Password (min 8 chars)
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-white/10 bg-[#07090E] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500/60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? "Updating..." : "Update Password →"}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="w-full text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Back to Sign In
                </button>
              </form>
            )}

            {infoMessage && (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{infoMessage}</p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-slate-500">
              <div className="h-px flex-1 bg-white/[0.08]" />
              <span>OR CONTINUE WITH</span>
              <div className="h-px flex-1 bg-white/[0.08]" />
            </div>

            <button
              type="button"
              disabled={isLoading}
              onClick={async () => {
                setError(null);
                setInfoMessage(null);
                setIsLoading(true);
                try {
                  await signIn("google", { callbackUrl: targetUrl });
                } catch {
                  setError("Unable to start Google Sign-In. Please try again.");
                  setIsLoading(false);
                }
              }}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-[#07090E] hover:bg-[#131926] px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-200 transition-lab disabled:opacity-50 cursor-pointer"
            >
              <span className="font-bold text-sky-400">G</span> Continue with Google
            </button>
          </div>

          <p className="text-center text-xs text-slate-400">
            Don&apos;t have an account?{" "}
            <Link
              href={
                targetUrl !== "/explore"
                  ? `/signup?redirect_to=${encodeURIComponent(targetUrl)}`
                  : "/signup"
              }
              className="font-semibold text-sky-400 hover:text-sky-300 underline-offset-4 hover:underline"
            >
              Sign up for free
            </Link>
          </p>
        </div>

        <div className="text-[11px] font-mono text-slate-600 text-center lg:text-left">
          Obsidian Research Lab &bull; Protected by CSRF &amp; Rate-Limit Middleware
        </div>
      </div>

      {/* Right Showcase Column */}
      <ObsidianAuthShowcase />
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#07090E]" />}>
      <LoginContent />
    </Suspense>
  );
}
