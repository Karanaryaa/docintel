import { PDFDocument } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { writeFile } from "node:fs/promises";

// scanned.pdf: 3 pages, each a full-page raster image (no text layer)
const pdf = await PDFDocument.create();
for (let p = 1; p <= 3; p++) {
  const c = createCanvas(612, 792);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 612, 792);
  ctx.fillStyle = "#111"; ctx.font = "bold 22px sans-serif";
  ctx.fillText(`SCANNED LEASE PAGE ${p}`, 50, 100);
  ctx.font = "14px sans-serif";
  ctx.fillText(`Tenant agrees to clause ${p}.1 about maintenance.`, 50, 160);
  ctx.fillText(`Monthly rent: Rs ${20000 + p * 500}. Deposit: Rs 50000.`, 50, 190);
  const png = await pdf.embedPng(c.toBuffer("image/png"));
  const page = pdf.addPage([612, 792]);
  page.drawImage(png, { x: 0, y: 0, width: 612, height: 792 });
}
await writeFile("scripts/fixtures/scanned.pdf", await pdf.save());

// long.pdf: 120 text pages
const long = await PDFDocument.create();
const font = await long.embedFont("Helvetica");
for (let p = 1; p <= 120; p++) {
  const page = long.addPage([612, 792]);
  let y = 750;
  for (let i = 0; i < 20; i++) {
    page.drawText(`Page ${p} line ${i}: the quick brown fox jumps over the lazy dog ${p * 100 + i}.`, { x: 50, y, size: 10, font });
    y -= 30;
  }
}
await writeFile("/tmp/long.pdf", await long.save());
console.log("made scanned.pdf + /tmp/long.pdf");
