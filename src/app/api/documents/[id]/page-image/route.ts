export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { renderPageToPng } from "@/lib/pdf-render";

/** Server-rendered PNG of one PDF page (unpdf + napi-rs canvas). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pageParam = Number(new URL(_req.url).searchParams.get("page") ?? "1");
  const store = getStore();
  const doc = await store.getDocument(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const bytes = await store.getDocumentBytes(id);

  let png: Uint8Array;
  try {
    png = await renderPageToPng(bytes, pageParam);
  } catch (err) {
    return NextResponse.json(
      { error: `render failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}` },
      { status: 422 }
    );
  }
  return new NextResponse(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=300" },
  });
}
