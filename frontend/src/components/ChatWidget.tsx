"use client";
import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string; };

export default function ChatWidget() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { role: "assistant", content: "Hi! I'm your AI assistant. Ask me anything — about ML, datasets, code, or anything else." },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, open]);

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 100);
    }, [open]);

    const send = async () => {
        const text = input.trim();
        if (!text || loading) return;
        setInput("");
        setError(null);
        const newMessages: Message[] = [...messages, { role: "user", content: text }];
        setMessages(newMessages);
        setLoading(true);
        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: newMessages.slice(1) }), // skip greeting
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                setError(data.error || "Something went wrong. Please try again.");
            } else {
                setMessages(prev => [...prev, { role: "assistant", content: data.content }]);
            }
        } catch (e) {
            setError("Network error. Please check your connection.");
        } finally {
            setLoading(false);
        }
    };

    const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    };

    const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
    };

    return (
        <>
            {/* Floating button */}
            <button
                onClick={() => setOpen(v => !v)}
                className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.5)] transition-all hover:scale-110 active:scale-95"
                style={{ background: "linear-gradient(135deg,#7C3AED,#06B6D4)" }}
                aria-label="Open AI assistant"
            >
                {open ? (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
                    </svg>
                )}
            </button>

            {/* Chat panel */}
            {open && (
                <div
                    className="fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/[0.08] shadow-[0_0_60px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
                    style={{ background: "#0a0a0f", maxHeight: "540px" }}
                >
                    {/* Header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.07]" style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.15),rgba(6,182,212,0.1))" }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#7C3AED,#06B6D4)" }}>
                            <span className="text-white text-sm">✦</span>
                        </div>
                        <div>
                            <div className="text-sm font-bold text-white">AI Assistant</div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Powered by OpenRouter</div>
                        </div>
                        <button onClick={() => setOpen(false)} className="ml-auto text-slate-500 hover:text-white transition p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 0 }}>
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div
                                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${ m.role === "user" ? "text-white rounded-br-sm" : "text-slate-200 rounded-bl-sm border border-white/[0.07]" }`}
                                    style={ m.role === "user" ? { background: "linear-gradient(135deg,#7C3AED,#0891B2)" } : { background: "rgba(255,255,255,0.04)" }}
                                >
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                                    {[0,150,300].map(d => (
                                        <span key={d} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: d + "ms" }} />
                                    ))}
                                </div>
                            </div>
                        )}
                        {error && (
                            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* Input */}
                    <div className="border-t border-white/[0.07] p-3">
                        <div className="flex items-end gap-2 bg-white/[0.04] border border-white/[0.08] rounded-2xl px-3 py-2">
                            <textarea
                                ref={inputRef}
                                rows={1}
                                value={input}
                                onChange={autoResize}
                                onKeyDown={handleKey}
                                disabled={loading}
                                placeholder="Ask me anything..."
                                className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none resize-none overflow-hidden leading-relaxed"
                                style={{ minHeight: "22px", maxHeight: "120px" }}
                            />
                            <button
                                onClick={send}
                                disabled={loading || !input.trim()}
                                className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition hover:brightness-110 active:scale-95 disabled:opacity-40"
                                style={{ background: "linear-gradient(135deg,#7C3AED,#0891B2)" }}
                            >
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-600 text-center mt-2">Press Enter to send · Shift+Enter for new line</p>
                    </div>
                </div>
            )}
        </>
    );
}