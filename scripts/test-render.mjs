import { readFileSync } from "node:fs";
import { renderPageToPng } from "../src/lib/pdf-render.ts";
const bytes = new Uint8Array(readFileSync("scripts/fixtures/scanned.pdf"));
try {
  const png = await renderPageToPng(bytes, 1);
  console.log("RENDER OK bytes:", png.length);
} catch (e) {
  console.log("RENDER FAIL:", (e.stack || e.message || String(e)).slice(0, 500));
}
