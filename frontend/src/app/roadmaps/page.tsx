"use client";

import Link from "next/link";

export default function RoadmapsPage() {
    return (
        <main className="min-h-screen p-8 bg-[#07111f] text-white">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-4xl font-bold mb-4">Roadmaps</h1>
                <p className="text-lg text-slate-300 mb-8">Project roadmaps and implementation guides.</p>

                <div className="rounded-xl p-6 bg-[#0b1624] border border-white/6">
                    <p className="text-slate-300">This is a placeholder for Roadmaps. Add roadmap content here.</p>
                </div>

                <div className="mt-6">
                    <Link href="/" className="text-sm text-cyan-300">← Back to home</Link>
                </div>
            </div>
        </main>
    );
}
