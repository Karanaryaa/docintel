import type { PageText } from "./chunk";

export interface PdfExtractResult {
  pages: PageText[];
  pageCount: number;
  /** pages with too little embedded text - likely scans needing vision OCR */
  ocrPages: number[];
}

const MIN_CHARS_PER_PAGE = 40;

/**
 * Extract per-page text from a PDF buffer using pdf.js (unpdf).
 * Works fully in-process; no external service. Pages whose embedded text
 * is thinner than MIN_CHARS_PER_PAGE are reported as OCR candidates.
 */
export async function extractPdfPages(bytes: Uint8Array): Promise<PdfExtractResult> {
  const { extractText } = await import("unpdf");
  const { text, totalPages } = await extractText(bytes, { mergePages: false });
  const pages: PageText[] = (text as string[]).map((t, i) => ({
    page: i + 1,
    text: t ?? "",
  }));
  const ocrPages = pages
    .filter((p) => p.text.replace(/\s+/g, "").length < MIN_CHARS_PER_PAGE)
    .map((p) => p.page);
  return { pages, pageCount: totalPages ?? pages.length, ocrPages };
}

/** Heuristic: does this look like an invoice/bill? */
export function looksLikeInvoice(allText: string): boolean {
  const t = allText.toLowerCase();
  const signals = ["invoice", "bill to", "amount due", "subtotal", "tax", "total due", "gst", "invoice no", "invoice number"];
  const hits = signals.filter((s) => t.includes(s)).length;
  return hits >= 3;
}
