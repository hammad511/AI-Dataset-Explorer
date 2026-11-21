"use client";

import React, { useState } from "react";
import { X, ThumbsUp, ThumbsDown, CheckCircle2, MessageSquare } from "lucide-react";

interface UserFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateId: string;
  candidateTitle: string;
  candidateType: "dataset" | "model" | "paper";
  searchQuery: string;
}

export default function UserFeedbackModal({
  isOpen,
  onClose,
  candidateId,
  candidateTitle,
  candidateType,
  searchQuery,
}: UserFeedbackModalProps) {
  const [rating, setRating] = useState<"positive" | "negative">("positive");
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const reasons = [
    { id: "wrong_anatomy", label: "Wrong Anatomy / Organ System" },
    { id: "wrong_modality", label: "Wrong Modality (CT vs MRI)" },
    { id: "wrong_task", label: "Wrong ML Task" },
    { id: "wrong_dimensionality", label: "Wrong Dimensionality (2D vs 3D)" },
    { id: "poor_quality", label: "Poor Quality or Missing Files" },
    { id: "irrelevant", label: "Irrelevant to Prompt" },
  ];

  const toggleReason = (id: string) => {
    setSelectedReasons((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await fetch("/api/search/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery || "workspace_query",
          candidateId,
          candidateType,
          rating,
          reasons: selectedReasons,
          comment,
        }),
      });
      setSubmitted(true);
      setTimeout(() => {
        onClose();
        setSubmitted(false);
      }, 1100);
    } catch {
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-md obsidian-card border border-strong rounded-2xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-subtle pb-3">
          <h3 className="font-bold text-primary text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-accent-from" />
            <span>Search Relevance Feedback</span>
          </h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-status-emerald mx-auto" />
            <div className="font-bold text-status-emerald text-sm">Feedback Recorded</div>
            <div className="text-xs text-muted">Telemetry synced to ranking feedback log.</div>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <div>
              <span className="text-faint font-mono text-[10px] uppercase block">Candidate</span>
              <span className="font-semibold text-primary truncate block mt-0.5">{candidateTitle}</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setRating("positive")}
                className={`py-2.5 rounded-xl border flex items-center justify-center gap-2 font-semibold transition-lab ${
                  rating === "positive"
                    ? "status-badge-emerald"
                    : "bg-page border-subtle text-muted hover:text-primary"
                }`}
              >
                <ThumbsUp className="w-3.5 h-3.5" /> Relevant
              </button>
              <button
                type="button"
                onClick={() => setRating("negative")}
                className={`py-2.5 rounded-xl border flex items-center justify-center gap-2 font-semibold transition-lab ${
                  rating === "negative"
                    ? "status-badge-rose"
                    : "bg-page border-subtle text-muted hover:text-primary"
                }`}
              >
                <ThumbsDown className="w-3.5 h-3.5" /> Not Relevant
              </button>
            </div>

            {rating === "negative" && (
              <div className="space-y-1.5 pt-2 border-t border-subtle">
                <div className="font-mono text-[10px] uppercase text-faint">Failure Mode</div>
                {reasons.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-page border border-subtle cursor-pointer hover:border-strong">
                    <input
                      type="checkbox"
                      checked={selectedReasons.includes(r.id)}
                      onChange={() => toggleReason(r.id)}
                      className="rounded border-subtle"
                    />
                    <span className="text-secondary text-[11px]">{r.label}</span>
                  </label>
                ))}
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional technical note..."
                  className="w-full mt-2 rounded-lg bg-input border border-subtle px-2.5 py-2 text-xs text-primary outline-none focus:border-accent resize-none"
                />
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-muted hover:text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-lg bg-accent text-slate-950 font-bold"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
