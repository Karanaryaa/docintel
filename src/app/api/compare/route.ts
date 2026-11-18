export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { cosine } from "@/lib/chunk";
import { embedQuery } from "@/lib/embed";
import { chat } from "@/lib/ai";
import type { Citation } from "@/lib/types";

export const maxDuration = 60; // Hobby plan cap

/**
 * Cross-document comparison: retrieves the most relevant excerpts from each
 * selected document and asks the model to compare them, citing sources.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { documentIds?: string[]; topic?: string };
  const ids = (body.documentIds ?? []).filter(Boolean);
  if (ids.length < 2) {
    return NextResponse.json({ error: "pick at least two documents" }, { status: 400 });
  }
  const topic = body.topic?.trim() || "the key terms, amounts, dates and obligations";

  const store = getStore();
  const q = await embedQuery(topic);
  const all = await store.allChunks();

  const perDoc: Array<{ name: string; excerpt: string; page: number; documentId: string }> = [];
  for (const id of ids) {
    const meta = await store.getDocument(id);
    if (!meta) continue;
    const best = all
      .filter((c) => c.documentId === id && c.embedding)
      .map((c) => ({ c, score: cosine(q, c.embedding!) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    for (const { c } of best) {
      perDoc.push({ name: meta.name, excerpt: c.text, page: c.page, documentId: id });
    }
  }

  const context = perDoc
    .map((e, i) => `[${i + 1}] (${e.name}, page ${e.page})\n${e.excerpt}`)
    .join("\n\n---\n\n");

  const raw = await chat([
    {
      role: "system",
      content:
        "You compare documents using only the numbered excerpts provided. Structure the answer as: " +
        "1) What they agree on, 2) Where they differ, 3) Anything one document has that the others lack. " +
        "Cite every claim like [1], [2]. If excerpts are insufficient for a point, say so instead of guessing.",
    },
    { role: "user", content: `Topic: ${topic}\n\nExcerpts:\n${context}` },
  ]);

  const citations: Citation[] = [];
  const used = new Set<number>();
  for (const m of raw.matchAll(/\[(\d+)\]/g)) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= perDoc.length) used.add(n);
  }
  for (const n of used) {
    const e = perDoc[n - 1];
    citations.push({ documentId: e.documentId, documentName: e.name, page: e.page, excerpt: e.excerpt.slice(0, 280) });
  }

  return NextResponse.json({ comparison: raw, citations });
}
