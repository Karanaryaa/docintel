export const dynamic = "force-dynamic";
import { NextRequest, NextResponse, after } from "next/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { randomUUID } from "node:crypto";
import { getStore } from "@/lib/store";
import type { DocumentMeta } from "@/lib/types";

export const maxDuration = 300; // Hobby max with fluid compute (default-enabled)

export async function GET() {
  const store = getStore();
  return NextResponse.json({ documents: await store.listDocuments() });
}

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`upload:${clientIp(req)}`, 12, 3_600_000))) {
    return NextResponse.json({ error: "rate limit: 12 uploads per hour" }, { status: 429 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "PDF files only" }, { status: 415 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "25 MB per document max" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = randomUUID();
  const meta: DocumentMeta = {
    id,
    name: file.name,
    sizeBytes: file.size,
    pageCount: 0,
    status: "processing",
    createdAt: new Date().toISOString(),
    storageKey: `${id}.pdf`,
    ocrPages: [],
    kind: "document",
    progress: "Queued",
  };

  const store = getStore();
  await store.putDocument(meta, bytes);
  // Ingest runs in its own normal request (fired via after): the after()
  // sandbox itself cannot clone/transfer pdfjs's raster buffers, but a
  // plain request route can - and gets its own 300s budget.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  after(async () => {
    await fetch(`${proto}://${host}/api/documents/${id}/process`, {
      method: "POST",
      headers: { "x-internal-token": process.env.AI_API_KEY ?? "" },
    }).catch(() => {});
  });
  return NextResponse.json({ document: meta }, { status: 201 });
}
