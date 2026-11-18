export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getStore } from "@/lib/store";
import { processDocument } from "@/lib/pipeline";
import type { DocumentMeta } from "@/lib/types";

export const maxDuration = 300; // Hobby max with fluid compute (default-enabled)

export async function GET() {
  const store = getStore();
  return NextResponse.json({ documents: await store.listDocuments() });
}

export async function POST(req: NextRequest) {
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
    status: "uploaded",
    createdAt: new Date().toISOString(),
    storageKey: `${id}.pdf`,
    ocrPages: [],
    kind: "document",
  };

  const store = getStore();
  await store.putDocument(meta, bytes);
  await processDocument(store, meta);
  const final = await store.getDocument(id);
  return NextResponse.json({ document: final }, { status: 201 });
}
