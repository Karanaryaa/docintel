export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { processDocument } from "@/lib/pipeline";

export const maxDuration = 300; // Hobby max with fluid compute (default-enabled)

/**
 * Internal ingest worker. The upload route fires this via after(): ingest
 * then runs in a normal request context (pdfjs image rendering does not
 * survive the after() sandbox - buffers there cannot be cloned/transferred).
 * Guarded by the server-only AI key as the token; the id is an unguessable
 * UUID and processing is idempotent.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (req.headers.get("x-internal-token") !== process.env.AI_API_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const store = getStore();
  const doc = await store.getDocument(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (doc.status === "ready") {
    return NextResponse.json({ ok: true, status: doc.status });
  }
  // Atomic claim: only one runner proceeds; a concurrent or duplicate fire
  // gets 202 while the first finishes. Error docs are retryable.
  const claimed = store.claimDocument ? await store.claimDocument(id) : true;
  if (!claimed) {
    return NextResponse.json({ ok: true, status: "processing" }, { status: 202 });
  }
  await processDocument(store, doc);
  const final = await store.getDocument(id);
  return NextResponse.json({ ok: true, status: final?.status });
}
