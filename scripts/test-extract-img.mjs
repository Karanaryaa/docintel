import { readFileSync } from "node:fs";
import { extractEmbeddedPagePng } from "../src/lib/pdf-render.ts";
const bytes = new Uint8Array(readFileSync("scripts/fixtures/scanned.pdf"));
const png = await extractEmbeddedPagePng(bytes, 1);
console.log("EMBEDDED PNG:", png ? png.length + " bytes" : "null");
