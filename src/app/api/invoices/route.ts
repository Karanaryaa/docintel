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
