"use client";

import { useState } from "react";
import type { Citation, DocumentMeta } from "@/lib/types";

interface Props {
  documents: DocumentMeta[];
  onOpenCitation: (documentId: string, page: number) => void;
}

export function ComparePanel({ documents, onOpenCitation }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ comparison: string; citations: Citation[] } | null>(null);

  const ready = documents.filter((d) => d.status === "ready");

  function toggle(id: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: [...picked], topic: topic || undefined }),
      });
      const json = await res.json();
      if (json.error) alert(json.error);
      else setResult(json);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-display text-2xl font-semibold">Compare documents</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Pick two or more documents. Papertrail lines up what they agree on, where they differ,
          and what only one of them says - each point cited.
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {ready.map((d) => (
            <label
              key={d.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition ${
                picked.has(d.id) ? "border-accent bg-accent/5" : "border-line bg-card hover:border-ink-faint"
              }`}
            >
              <input
                type="checkbox"
                checked={picked.has(d.id)}
                onChange={() => toggle(d.id)}
                className="accent-[#1d4ed8]"
              />
              <span className="min-w-0 truncate">{d.name}</span>
            </label>
          ))}
          {ready.length === 0 && (
            <p className="col-span-2 rounded-xl border border-line bg-card p-4 text-sm text-warn">
              Upload at least two PDFs first.
            </p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Focus (optional): e.g. payment terms, totals, deadlines"
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-2 text-sm outline-none placeholder:text-ink-faint focus:border-accent"
          />
          <button
            onClick={run}
            disabled={picked.size < 2 || loading}
            className="rounded-lg bg-ink px-5 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-40"
          >
            {loading ? "Comparing..." : "Compare"}
          </button>
        </div>

        {result && (
          <div className="mt-6 rounded-xl border border-line bg-card p-5">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.comparison}</p>
            {result.citations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                {result.citations.map((c, j) => (
                  <button
                    key={j}
                    onClick={() => onOpenCitation(c.documentId, c.page)}
                    title={c.excerpt}
                    className="rounded-full border border-accent/30 bg-accent/5 px-2.5 py-1 text-[11px] font-medium text-accent-deep transition hover:bg-accent/15"
                  >
                    [{j + 1}] {c.documentName} · p.{c.page}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
