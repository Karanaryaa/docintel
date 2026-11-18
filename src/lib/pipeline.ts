import { extractPdfPages, looksLikeInvoice } from "./pdf-extract";
import { renderPageToPng, extractEmbeddedPagePng } from "./pdf-render";
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
  const say = (progress: string) => store.updateDocument(doc.id, { progress }).catch(() => {});
  await store.updateDocument(doc.id, { status: "processing", progress: "Extracting text" });
  try {
    const bytes = await store.getDocumentBytes(doc.id);
    const { pages, pageCount, ocrPages } = await extractPdfPages(bytes);

    // Vision-OCR the pages with no embedded text layer (scans), a few at a
    // time so a long scan does not run its pages strictly one-by-one.
    const finalPages: PageText[] = [...pages];
    const ocrDone: number[] = [];
    let ocrError: string | undefined;
    if (ocrPages.length > 0) {
      let finished = 0;
      let cursor = 0;
      await say(`Reading scanned pages 0/${ocrPages.length}`);
      const worker = async () => {
        const describe = (err: unknown) => {
          const e = err instanceof Error ? err : new Error(String(err));
          const frame = e.stack?.split("\n").find((l) => l.includes("at "))?.trim().slice(0, 120) ?? "";
          return `${e.message.slice(0, 150)} [${frame}]`;
        };
        while (cursor < ocrPages.length) {
          const p = ocrPages[cursor++];
          try {
            let dataUrl: string;
            try {
              // Prefer the embedded scan image: pg.render can fail on image
              // pages inside serverless background tasks (after()).
              const png =
                (await extractEmbeddedPagePng(bytes, p).catch(() => null)) ??
                (await renderPageToPng(bytes, p));
              dataUrl = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
            } catch (err) {
              throw new Error(`render p${p}: ${describe(err)}`);
            }
            let text: string;
            try {
              text = await ocrPageImage(dataUrl);
            } catch (err) {
              throw new Error(`ocr p${p}: ${describe(err)}`);
            }
            const idx = finalPages.findIndex((fp) => fp.page === p);
            if (idx >= 0 && text.trim()) {
              finalPages[idx] = { page: p, text };
              ocrDone.push(p);
            }
          } catch (err) {
            // keep the (thin) native text if OCR fails for a page, but
            // record the first failure so it is visible on the document
            ocrError ??= err instanceof Error ? err.message.slice(0, 280) : "OCR failed";
          }
          finished++;
          await say(`Reading scanned pages ${finished}/${ocrPages.length}`);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(4, ocrPages.length) }, () => worker())
      );
    }

    await say("Indexing for search");
    // Never mark a document ready when nothing readable came out of it -
    // that would let chats answer from an empty index without any sign.
    const usableChars = finalPages.reduce((n, p) => n + p.text.replace(/\s+/g, "").length, 0);
    if (usableChars < 40) {
      await store.updateDocument(doc.id, {
        status: "error",
        progress: null,
        pageCount,
        error:
          "No readable text could be extracted from this PDF" +
          (ocrError ? ` - scan OCR failed: ${ocrError.slice(0, 180)}` : ". It may be empty."),
      });
      return;
    }
    const chunkCount = await indexDocument(store, doc, finalPages);
    const allText = finalPages.map((p) => p.text).join("\n\n");
    const isInvoice = looksLikeInvoice(allText);
    let invoiceError: string | undefined;
    if (isInvoice) {
      await say("Checking invoice fields");
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
      ocrPages: [...ocrDone].sort((a, b) => a - b),
      kind: isInvoice ? "invoice" : "document",
      progress: null,
      ...(invoiceError ? { error: `invoice extraction: ${invoiceError}` } : {}),
      ...(ocrError ? { error: `OCR failed on some pages: ${ocrError}` } : {}),
    });
    void chunkCount;
  } catch (err) {
    await store.updateDocument(doc.id, {
      status: "error",
      progress: null,
      error: err instanceof Error ? err.message.slice(0, 400) : "processing failed",
    });
  }
}

