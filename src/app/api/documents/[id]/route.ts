export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";


export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const doc = await getStore().getDocument(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ document: doc });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await getStore().deleteDocument(id);
  return NextResponse.json({ ok: true });
}
