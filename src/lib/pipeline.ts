import { extractPdfPages, looksLikeInvoice } from "./pdf-extract";
import { renderPageToDataUrl } from "./pdf-render";
import { ocrPageImage } from "./ai";
import { indexDocument } from "./rag";
import { extractInvoice } from "./invoice-extract";
import type { DocumentMeta } from "./types";
import type { Store } from "./store/types";
import type { PageText } from "./chunk";

/**
 * Full ingest pipeline for one uploaded PDF:
 * extract per-page text -> vision-OCR pages that are scans -> chunk + embed
 * -> if it looks like an invoice, extract fields and run consistency checks.
 */
export async function processDocument(store: Store, doc: DocumentMeta): Promise<void> {
  await store.updateDocument(doc.id, { status: "processing" });
  try {
    const bytes = await store.getDocumentBytes(doc.id);
    const { pages, pageCount, ocrPages } = await extractPdfPages(bytes);

    // Vision-OCR the pages with no embedded text layer (scans).
    const finalPages: PageText[] = [...pages];
    const ocrDone: number[] = [];
    for (const p of ocrPages) {
      try {
        const dataUrl = await renderPageToDataUrl(bytes, p);
        const text = await ocrPageImage(dataUrl);
        const idx = finalPages.findIndex((fp) => fp.page === p);
        if (idx >= 0 && text.trim()) {
          finalPages[idx] = { page: p, text };
          ocrDone.push(p);
        }
      } catch {
        // keep the (thin) native text if OCR fails for a page
      }
    }

    const chunkCount = await indexDocument(store, doc, finalPages);
    const allText = finalPages.map((p) => p.text).join("\n\n");
    const isInvoice = looksLikeInvoice(allText);
    let invoiceError: string | undefined;
    if (isInvoice) {
      try {
        await extractInvoice(store, doc.id, allText);
      } catch (err) {
        // Document stays usable for Q&A even if field extraction fails
        // (e.g. API key missing, model error) - it can be retried later.
        invoiceError = err instanceof Error ? err.message.slice(0, 300) : "invoice extraction failed";
      }
    }

    await store.updateDocument(doc.id, {
      status: "ready",
      pageCount,
      ocrPages: ocrDone,
      kind: isInvoice ? "invoice" : "document",
      ...(invoiceError ? { error: `invoice extraction: ${invoiceError}` } : {}),
    });
    void chunkCount;
  } catch (err) {
    await store.updateDocument(doc.id, {
      status: "error",
      error: err instanceof Error ? err.message.slice(0, 400) : "processing failed",
    });
  }
}

