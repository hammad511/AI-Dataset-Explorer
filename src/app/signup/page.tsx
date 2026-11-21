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
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

async function registerUser(data: { name: string; email: string; password: string }) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res;
}

function SignupContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTarget = searchParams?.get("redirect_to") || searchParams?.get("callbackUrl") || "/explore";
  const isSafe = rawTarget.startsWith("/") && !rawTarget.startsWith("//") && !rawTarget.includes("\\");
  const targetUrl = isSafe ? rawTarget : "/explore";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <main className="min-h-screen bg-[#07090E] text-slate-100 grid grid-cols-1 lg:grid-cols-2">
      {/* Left Registration Column */}
      <div className="flex flex-col justify-between p-6 sm:p-10 lg:p-14">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5">
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
              Create Researcher Account
            </h1>
            <p className="text-xs text-slate-400">
              Unlock saved search sessions, side-by-side VRAM benchmarking, and starter code ZIP exports.
            </p>
          </div>

          <div className="obsidian-card p-6 sm:p-7 space-y-5">
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);

                const cleanName = name.trim();
                const cleanEmail = email.trim();

                if (cleanName.length < 2) {
                  setError("Please enter your full name (at least 2 characters).");
                  return;
                }
                if (!cleanEmail) {
                  setError("Please enter a valid email address.");
                  return;
                }
                if (password.length < 8) {
                  setError("Password must be at least 8 characters long.");
                  return;
                }
                if (password.length > 128) {
                  setError("Password cannot exceed 128 characters.");
                  return;
                }

                setIsLoading(true);
                try {
                  const res = await registerUser({ name: cleanName, email: cleanEmail, password });
                  if (res.ok) {
                    const { ok } = await signInCredentialsSafe(cleanEmail, password);
                    if (ok) {
                      window.location.assign(targetUrl);
                    } else {
                      router.push(`/login?registered=true&redirect_to=${encodeURIComponent(targetUrl)}`);
                    }
                  } else {
                    const err = await res.json().catch(() => ({ message: "Registration failed" }));
                    setError(err.message || err.error || "Registration failed");
                  }
                } catch {
                  setError("Unable to register. Please check your network connection.");
                } finally {
                  setIsLoading(false);
                }
              }}
            >
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
                  htmlFor="name"
                >
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  className="w-full rounded-xl border border-white/10 bg-[#07090E] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-sky-500/60 transition-lab"
                  placeholder="Ada Lovelace"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

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
                  placeholder="ada@example.com"
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
                  <span className="font-mono text-[10px] text-slate-500">Min. 8 chars</span>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
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
                {isLoading ? "Creating Account..." : "Create Free Account →"}
              </button>
            </form>

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
            Already have an account?{" "}
            <Link
              href={
                targetUrl !== "/explore"
                  ? `/login?redirect_to=${encodeURIComponent(targetUrl)}`
                  : "/login"
              }
              className="font-semibold text-sky-400 hover:text-sky-300 underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>

        <div className="text-[11px] font-mono text-slate-600 text-center lg:text-left">
          Free Researcher Tier Included &bull; Zero Credit Card Required
        </div>
      </div>

      {/* Right Obsidian Feature Showcase */}
      <div className="hidden lg:flex flex-col justify-between p-10 bg-[#0A0D14] bg-lab-grid border-l border-white/[0.07] relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-emerald-500/10 blur-[120px]" />

        <div className="space-y-2 relative z-10">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
            <Sparkles className="w-3.5 h-3.5" /> Built for Applied ML Teams
          </span>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight leading-snug pt-2">
            Every recommendation audited against real benchmarks and license files.
          </h2>
        </div>

        <div className="space-y-3 relative z-10 my-8">
          {[
            {
              icon: <Database className="w-4 h-4 text-emerald-400" />,
              title: "7-Provider Federated Discovery",
              desc: "Simultaneous querying across Hugging Face, Kaggle, OpenAlex, ArXiv, Semantic Scholar, PubMed & Crossref.",
            },
            {
              icon: <Cpu className="w-4 h-4 text-sky-400" />,
              title: "Live GPU Memory & QLoRA Sizing",
              desc: "Know exact weights, optimizer, gradients, and activation memory on 8GB–80GB hardware before provisioning.",
            },
            {
              icon: <BookOpen className="w-4 h-4 text-amber-400" />,
              title: "Anti-Hallucination Citation Spans",
              desc: "Inspect exact literal evidence spans linking candidate datasets and models to peer-reviewed literature.",
            },
          ].map((item) => (
            <div key={item.title} className="obsidian-card p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#07090E] border border-white/10 flex items-center justify-center shrink-0">
                {item.icon}
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-100">{item.title}</h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 text-[11px] text-slate-400 relative z-10">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Commercial-Safe License Screening
          </span>
          <span>&bull;</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-sky-400" /> Password Hashing &amp; CSRF Protection
          </span>
        </div>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#07090E]" />}>
      <SignupContent />
    </Suspense>
  );
}
