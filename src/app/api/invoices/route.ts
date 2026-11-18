export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";


export async function GET() {
  const store = getStore();
  const [invoices, docs] = await Promise.all([store.listInvoices(), store.listDocuments()]);
  const names = new Map(docs.map((d) => [d.id, d.name]));
  return NextResponse.json({
    invoices: invoices.map((r) => ({ ...r, documentName: names.get(r.documentId) ?? r.documentId })),
  });
}

/** Retry extraction for invoice-kind documents that have no record yet (e.g. AI key was missing at upload). */
export async function POST() {
  const store = getStore();
  const [docs, existing] = await Promise.all([store.listDocuments(), store.listInvoices()]);
  const done = new Set(existing.map((r) => r.documentId));
  const pending = docs.filter((d) => d.kind === "invoice" && d.status === "ready" && !done.has(d.id));
  if (pending.length === 0) return NextResponse.json({ retried: 0, results: [] });

  const { extractInvoice } = await import("@/lib/invoice-extract");
  const chunks = await store.allChunks();
  const results: Array<{ documentId: string; ok: boolean; error?: string }> = [];
  for (const doc of pending) {
    try {
      const text = chunks
        .filter((c) => c.documentId === doc.id)
        .sort((a, b) => a.page - b.page || a.index - b.index)
        .map((c) => c.text)
        .join("\n\n");
      await extractInvoice(store, doc.id, text);
      results.push({ documentId: doc.id, ok: true });
    } catch (err) {
      results.push({ documentId: doc.id, ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "failed" });
    }
  }
  return NextResponse.json({ retried: results.length, results });
}
