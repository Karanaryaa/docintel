/**
 * Live NVIDIA NIM eval on synthetic fixtures (scripts/fixtures + truth.json).
 * Measures extraction accuracy, Q&A citation accuracy and per-model latency.
 * Usage: AI_API_KEY=... npx tsx scripts/eval-nim.mjs [chatModelOverride]
 */
import { readFile } from "node:fs/promises";
import { extractPdfPages } from "../src/lib/pdf-extract.ts";
import { indexDocument, answerQuestion } from "../src/lib/rag.ts";
import { extractInvoice } from "../src/lib/invoice-extract.ts";
import { LocalStore } from "../src/lib/store/local.ts";
import { chat, ocrPageImage, CHAT_MODEL } from "../src/lib/ai.ts";
import { execFileSync } from "node:child_process";

const truth = JSON.parse(await readFile("scripts/fixtures/truth.json", "utf8"));
const t0 = () => performance.now();
const ms = (t) => Math.round(performance.now() - t);
const results = [];
const flush = () => { console.log(results.join("\n")); results.length = 0; };

// ---- 1. Embeddings + retrieval + Q&A with citations on lease.pdf ----
const leaseBytes = new Uint8Array(await readFile("scripts/fixtures/lease.pdf"));
let t = t0();
const lease = await extractPdfPages(leaseBytes);
results.push(`pdf extract lease: ${lease.pageCount} pages in ${ms(t)}ms`);

const store = new LocalStore();
t = t0();
const nChunks = await indexDocument(store, { id: "lease", name: "lease.pdf" }, lease.pages);
results.push(`NIM embeddings: ${nChunks} chunks in ${ms(t)}ms`);

for (const qa of truth["lease.pdf"].qa) {
  t = t0();
  const ans = await answerQuestion(store, qa.question);
  const lat = ms(t);
  const hitText = ans.answer.includes(qa.mustMention);
  const hitPage = ans.citations.some((c) => c.page === qa.expectPage);
  results.push(
    `QA "${qa.question.slice(0, 40)}..." ${lat}ms mention=${hitText} citePage=${hitPage} cites=${JSON.stringify(ans.citations.map((c) => c.page))}`
  );
}

flush();
// ---- 2. Invoice extraction + consistency checks ----
for (const f of ["invoice-clean.pdf", "invoice-badmath.pdf", "invoice-duplicate.pdf"]) {
  const bytes = new Uint8Array(await readFile(`scripts/fixtures/${f}`));
  const pdf = await extractPdfPages(bytes);
  const want = truth[f];
  t = t0();
  const rec = await extractInvoice(store, f, pdf.pages.map((p) => p.text).join("\n"));
  const lat = ms(t);
  const g = rec.fields;
  const checks = [
    g.vendorName === want.vendorName,
    g.invoiceNumber === want.invoiceNumber,
    g.total === want.total,
    g.subtotal === want.subtotal,
    (g.taxRate ?? null) === (want.taxRate ?? null),
  ];
  const flagHit = want.expectFlags.every((fl) => rec.flags.some((x) => x.code === fl || x === fl));
  results.push(
    `invoice ${f}: ${lat}ms fields=${checks.filter(Boolean).length}/5 flags=${flagHit} got=${JSON.stringify(rec.flags.map((x) => x.code ?? x))}`
  );
}

flush();
// ---- 3. Vision OCR on a rendered lease page ----
execFileSync("pdftoppm", ["-f", "1", "-l", "1", "-r", "150", "-png", "scripts/fixtures/lease.pdf", "/tmp/eval-lease"]);
const png = await readFile("/tmp/eval-lease-1.png");
t = t0();
const ocr = await ocrPageImage(`data:image/png;base64,${png.toString("base64")}`);
results.push(`vision OCR page1: ${ms(t)}ms containsRent=${ocr.includes("25,000")} len=${ocr.length}`);

flush();
// ---- 4. Chat model latency sample (default vs lightning) ----
for (const model of [CHAT_MODEL]) {
  t = t0();
  const out = await chat(
    [{ role: "user", content: "In one sentence: what does a security deposit clause usually cover?" }],
    { model, maxTokens: 128 }
  );
  results.push(`chat ${model}: ${ms(t)}ms (${out.length} chars)`);
}


flush();
