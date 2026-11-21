"use client";

import Link from "next/link";
import { Cpu } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-subtle bg-rail/80 mt-auto relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2 space-y-3">
            <Link href="/" className="inline-flex items-center gap-2.5 group">
              <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-slate-950 font-bold shadow-accent-sm">
                <Cpu className="w-4 h-4" />
              </div>
              <span className="font-bold text-base tracking-tight text-primary">
                AI Dataset Explorer
              </span>
            </Link>
            <p className="text-xs text-muted max-w-md leading-relaxed">
              Obsidian Research Lab workstation unifying live dataset discovery, model architecture matching, VRAM memory profiling, peer-reviewed verification spans, and reproducible code generation.
            </p>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md status-badge-emerald border text-[11px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              7 Live Scientific Sources Active
            </div>
          </div>

          <div className="space-y-2.5">
            <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-faint">Workstation</h4>
            <ul className="space-y-1.5 text-xs text-muted">
              <li><Link href="/explore" className="hover:text-primary transition-lab">Explore Studio</Link></li>
              <li><Link href="/benchmark" className="hover:text-primary transition-lab">Benchmark Matrix</Link></li>
              <li><Link href="/roadmap" className="hover:text-primary transition-lab">Roadmap &amp; Code Studio</Link></li>
              <li><Link href="/settings" className="hover:text-primary transition-lab">Quota &amp; Billing</Link></li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-faint">Indexed Hubs</h4>
            <ul className="space-y-1.5 text-xs font-mono text-muted">
              <li>Hugging Face Datasets &amp; Models</li>
              <li>Kaggle Competition &amp; Open Data</li>
              <li>Semantic Scholar &amp; OpenAlex</li>
              <li>arXiv · PubMed · Crossref</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-subtle flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-mono text-faint">
          <p>© {new Date().getFullYear()} AI Dataset Explorer · Crafted by Hammad Ali Tariq</p>
          <p>Zero-Hallucination Grounding · Next.js 16 + FastAPI</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
