export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";


/** Streams the original PDF for the in-app viewer. Never public - app route only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = getStore();
  const doc = await store.getDocument(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const bytes = await store.getDocumentBytes(id);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.name)}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
