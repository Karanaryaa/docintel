// Local end-to-end of the parts that need no external API key:
// real PDF -> text extraction -> chunking -> local embeddings -> retrieval.
// Run: node --experimental-strip-types scripts/e2e-local.mjs
import { readFile } from "node:fs/promises";
import { LocalStore } from "../src/lib/store/local.ts";
import { extractPdfPages, looksLikeInvoice } from "../src/lib/pdf-extract.ts";
import { indexDocument } from "../src/lib/rag.ts";
import { embedQuery } from "../src/lib/embed.ts";
import { cosine } from "../src/lib/chunk.ts";

const store = new LocalStore();
const bytes = new Uint8Array(await readFile("scripts/fixtures/lease.pdf"));

const doc = {
  id: "test-lease",
  name: "lease.pdf",
  sizeBytes: bytes.length,
  pageCount: 0,
  status: "uploaded",
  createdAt: new Date().toISOString(),
  storageKey: "test-lease.pdf",
  ocrPages: [],
  kind: "document",
};
await store.putDocument(doc, bytes);

const { pages, pageCount, ocrPages } = await extractPdfPages(bytes);
console.log("extraction: pages =", pageCount, ", ocr candidates =", JSON.stringify(ocrPages));
console.log("invoice heuristic on lease (expect false):", looksLikeInvoice(pages.map((p) => p.text).join(" ")));

const n = await indexDocument(store, doc, pages);
console.log("indexed chunks:", n);

const q = await embedQuery("What is the security deposit and when is it refunded?");
const chunks = await store.allChunks();
const top = chunks
  .filter((c) => c.embedding)
  .map((c) => ({ ...c, score: cosine(q, c.embedding) }))
  .sort((a, b) => b.score - a.score)[0];

console.log("top hit: page", top.page, "score", top.score.toFixed(3));
console.log("top text:", top.text.slice(0, 120));
if (top.page !== 2) {
  console.error("FAIL: expected security-deposit question to hit page 2");
  process.exit(1);
}
if (!top.text.includes("50,000")) {
  console.error("FAIL: expected answer text in top chunk");
  process.exit(1);
}
console.log("E2E PASS: extraction + chunking + embeddings + retrieval all real and correct");
