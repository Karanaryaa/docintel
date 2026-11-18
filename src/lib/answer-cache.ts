import type { ChatAnswer } from "./types";

/**
 * Per-document answer cache (Supabase table answer_cache, see
 * scripts/sql/answer-cache.sql). Scoped strictly to (document id, normalized
 * question): a re-uploaded document gets a new id, so cached answers can
 * never leak across files or survive a file being replaced. Only exists in
 * production (Supabase env present); local dev and tests skip it silently.
 */

function enabled(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

// Bump when the prompt, model or citation format changes so older cached
// answers are never served against a new answering contract.
const CACHE_VERSION = "v1";

export function normalizeQuestion(q: string): string {
  return `${CACHE_VERSION}:${q.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

interface CacheRow {
  answer: string;
  citations: ChatAnswer["citations"];
  insufficient: boolean;
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    signal: AbortSignal.timeout(5_000),
    headers: {
      apikey: process.env.SUPABASE_SECRET_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`cache ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function getCachedAnswer(documentId: string, question: string): Promise<ChatAnswer | null> {
  if (!enabled()) return null;
  const rows = await rest<CacheRow[]>(
    `answer_cache?document_id=eq.${documentId}&question=eq.${encodeURIComponent(normalizeQuestion(question))}&limit=1`
  );
  const row = rows[0];
  if (!row) return null;
  return { answer: row.answer, citations: row.citations ?? [], insufficientEvidence: row.insufficient };
}

export async function setCachedAnswer(documentId: string, question: string, answer: ChatAnswer): Promise<void> {
  if (!enabled()) return;
  await rest("answer_cache", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      document_id: documentId,
      question: normalizeQuestion(question),
      answer: answer.answer,
      citations: answer.citations,
      insufficient: answer.insufficientEvidence,
    }),
  });
}
