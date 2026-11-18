"use client";

import { useRef, useState } from "react";
import type { ChatAnswer, DocumentMeta } from "@/lib/types";

interface Message extends ChatAnswer {
  role: "user" | "assistant";
  question?: string;
}

interface Props {
  documents: DocumentMeta[];
  onOpenCitation: (documentId: string, page: number) => void;
}

export function ChatPanel({ documents, onOpenCitation }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [scope, setScope] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const ready = documents.filter((d) => d.status === "ready");

  async function ask() {
    const question = input.trim();
    if (!question || loading) return;
    setInput("");
    setLoading(true);
    setMessages((m) => [...m, { role: "user", question, answer: "", citations: [], insufficientEvidence: false }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, documentId: scope || undefined }),
      });
      const json = (await res.json()) as ChatAnswer & { error?: string };
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          answer: json.error ?? json.answer,
          citations: json.citations ?? [],
          insufficientEvidence: json.insufficientEvidence ?? false,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", answer: "Something went wrong reaching the server.", citations: [], insufficientEvidence: false },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {messages.length === 0 && (
          <div className="mx-auto mt-16 max-w-md text-center">
            <h2 className="font-display text-3xl font-semibold">Ask your documents</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Every answer cites the exact page it came from. If the documents do not contain the
              answer, Papertrail says so instead of guessing.
            </p>
            {ready.length === 0 && (
              <p className="mt-6 rounded-xl border border-line bg-card p-4 text-sm text-warn">
                Upload a PDF first - nothing is indexed yet.
              </p>
            )}
          </div>
        )}
        <div className="mx-auto max-w-2xl space-y-5">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-sm text-paper">
                  {m.question}
                </p>
              </div>
            ) : (
              <div key={i} className="rounded-2xl rounded-bl-sm border border-line bg-card p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.answer}</p>
                {m.citations.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                    {m.citations.map((c, j) => (
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
            )
          )}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-ink-faint">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              Reading the documents...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-line bg-card px-8 py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="rounded-lg border border-line bg-paper px-2 py-2 text-xs text-ink-soft"
            aria-label="Search scope"
          >
            <option value="">All documents</option>
            {ready.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="What do the documents say about..."
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-2 text-sm outline-none placeholder:text-ink-faint focus:border-accent"
          />
          <button
            onClick={ask}
            disabled={loading || !input.trim() || ready.length === 0}
            className="rounded-lg bg-ink px-5 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-40"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
