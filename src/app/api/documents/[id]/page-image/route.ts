export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";

/** Server-rendered PNG of one PDF page (unpdf + napi-rs canvas). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pageParam = Number(new URL(_req.url).searchParams.get("page") ?? "1");
  const store = getStore();
  const doc = await store.getDocument(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const bytes = await store.getDocumentBytes(id);

  const { getDocumentProxy } = await import("unpdf");
  const { createCanvas } = await import("@napi-rs/canvas");
  const pdf = await getDocumentProxy(bytes);
  const pageNum = Math.min(Math.max(1, pageParam), pdf.numPages);
  const pg = await pdf.getPage(pageNum);
  const viewport = pg.getViewport({ scale: 2 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await pg.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    canvas: canvas as unknown as HTMLCanvasElement,
    viewport,
  } as unknown as Parameters<typeof pg.render>[0]).promise;

  return new NextResponse(new Uint8Array(canvas.toBuffer("image/png")), {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=300" },
  });
}
