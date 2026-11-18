import { readFileSync } from "node:fs";
import { extractPdfPages } from "../src/lib/pdf-extract.ts";
const bytes = new Uint8Array(readFileSync("scripts/fixtures/scanned.pdf"));
const r = await extractPdfPages(bytes);
console.log("pages:", r.pageCount, "ocrPages:", r.ocrPages, "textlens:", r.pages.map(p=>p.text.length));
