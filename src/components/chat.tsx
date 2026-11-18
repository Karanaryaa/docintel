"use client";

import { useEffect, useRef, useState } from "react";
import { WorkingIndicator } from "./working-indicator";
import type { ChatAnswer, DocumentMeta } from "@/lib/types";

interface Message extends ChatAnswer {
  role: "user" | "assistant";
  question?: string;
}

// Render the model's **bold** markers instead of showing literal asterisks.
function renderAnswer(text: string) {
  return text.split(/\*\*([^*]+)\*\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

interface Props {
  documents: DocumentMeta[];
  selectedId: string | null;
  onOpenCitation: (documentId: string, page: number) => void;
}

export function ChatPanel({ documents, selectedId, onOpenCitation }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [scope, setScope] = useState<string>("");
  const [confirmClear, setConfirmClear] = useState(false);

  // Chat is always scoped to one document: clicking a file in the sidebar
  // switches the chat to that file, and answers come only from that file.
  // Each file keeps its own saved chat.
  useEffect(() => {
    if (selectedId) setScope(selectedId);
  }, [selectedId]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  const ready = documents.filter((d) => d.status === "ready");

  // If the scoped document was deleted, drop back to no selection.
  useEffect(() => {
    if (scope && !ready.some((d) => d.id === scope)) setScope("");
  }, [ready, scope]);

  // Chats are saved per document in this browser only (no login, so
  // nothing is shared with other visitors) and survive reloads.
  const storageKey = (s: string) => `pt-chat:${s}`;
  const hydratedScope = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(scope));
      setMessages(raw ? (JSON.parse(raw) as Message[]) : []);
    } catch {
      setMessages([]);
    }
    hydratedScope.current = scope;
    setConfirmClear(false);
  }, [scope]);

  useEffect(() => {
    if (hydratedScope.current !== scope) return;
    try {
      localStorage.setItem(storageKey(scope), JSON.stringify(messages));
    } catch {
      // storage full or unavailable - chat still works for the session
    }
  }, [messages, scope]);

  // "Sure?" stays armed until clicked or the file is switched (scope effect
  // resets it) - a short auto-reset made the confirm easy to miss.

  // Deletes only the chat for the current scope - never the source PDF.
  function clearChat() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    try {
      localStorage.removeItem(storageKey(scope));
    } catch {
      // ignore
    }
    setMessages([]);
    setConfirmClear(false);
  }

  async function ask() {
    const question = input.trim();
    if (!question || loading || !scope) return;
    const askedScope = scope;
    setInput("");
    setLoading(true);
    setMessages((m) => [...m, { role: "user", question, answer: "", citations: [], insufficientEvidence: false }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, documentId: askedScope }),
      });
      const json = (await res.json()) as ChatAnswer & { error?: string };
      const reply: Message = {
        role: "assistant",
        answer: json.error ?? json.answer,
        citations: json.citations ?? [],
        insufficientEvidence: json.insufficientEvidence ?? false,
      };
      // If the user switched files while the answer was generating, file the
      // answer under the document it was asked about, not the one now showing.
      if (scopeRef.current !== askedScope) {
        try {
          const raw = localStorage.getItem(storageKey(askedScope));
          const arr = raw ? (JSON.parse(raw) as Message[]) : [];
          localStorage.setItem(storageKey(askedScope), JSON.stringify([...arr, reply]));
        } catch {
          // storage unavailable - the answer is lost, the chat stays consistent
        }
      } else {
        setMessages((m) => [...m, reply]);
      }
    } catch {
      if (scopeRef.current === askedScope) {
        setMessages((m) => [
          ...m,
          { role: "assistant", answer: "Something went wrong reaching the server.", citations: [], insufficientEvidence: false },
        ]);
      }
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
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{renderAnswer(m.answer)}</p>
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
            <div className="text-ink-faint">
              <WorkingIndicator label="Reading the documents" compact />
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
            className="max-w-40 truncate rounded-lg border border-line bg-paper px-2 py-2 text-xs text-ink-soft"
            aria-label="Document to chat with"
          >
            {scope === "" && <option value="">Select a document</option>}
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
            placeholder={scope ? "Ask about this document..." : "Select a document first"}
            disabled={!scope}
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-2 text-sm outline-none placeholder:text-ink-faint focus:border-accent disabled:opacity-50"
          />
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              aria-label="Delete this chat (keeps the PDF)"
              title="Delete this chat (keeps the PDF)"
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                confirmClear
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-line bg-paper text-ink-faint hover:text-ink"
              }`}
            >
              {confirmClear ? "Sure?" : "Clear"}
            </button>
          )}
          <button
            onClick={ask}
            disabled={loading || !input.trim() || !scope}
            className="rounded-lg bg-ink px-5 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-40"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
