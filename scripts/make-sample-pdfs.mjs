// Generates synthetic test PDFs with known ground truth.
// Run: node scripts/make-sample-pdfs.mjs  -> writes scripts/fixtures/*.pdf + truth.json
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "scripts", "fixtures");

async function makePdf(filename, lines) {
  const pdf = await PDFDocument.create();
  const font = await pdf.addPage([612, 792]) && await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.getPage(0);
  let y = 750;
  for (const [text, isBold] of lines) {
    page.drawText(text, { x: 50, y, size: isBold ? 14 : 11, font: isBold ? bold : font, color: rgb(0.1, 0.1, 0.1) });
    y -= isBold ? 24 : 16;
  }
  await writeFile(path.join(OUT, filename), await pdf.save());
}

const truth = {
  "invoice-clean.pdf": {
    vendorName: "Acme Traders",
    invoiceNumber: "INV-2026-001",
    invoiceDate: "2026-01-05",
    dueDate: "2026-02-05",
    subtotal: 4000,
    taxAmount: 720,
    taxRate: 18,
    total: 4720,
    expectFlags: [],
  },
  "invoice-badmath.pdf": {
    vendorName: "Bright Supplies Co",
    invoiceNumber: "BS-991",
    invoiceDate: "2026-01-10",
    dueDate: "2026-02-10",
    subtotal: 5000, // line items sum to 4000 -> LINE_SUM_MISMATCH; 5000+900=5900 != stated total
    taxAmount: 900,
    taxRate: 18,
    total: 5200,
    expectFlags: ["LINE_SUM_MISMATCH", "TOTAL_MISMATCH", "TAX_MISMATCH"],
  },
  "invoice-duplicate.pdf": {
    vendorName: "Acme Traders",
    invoiceNumber: "INV-2026-001", // same vendor + number as invoice-clean -> DUPLICATE_INVOICE
    invoiceDate: "2026-01-06",
    dueDate: null,
    subtotal: 1000,
    taxAmount: null,
    taxRate: null,
    total: 1000,
    expectFlags: ["DUPLICATE_INVOICE"],
  },
};

await mkdir(OUT, { recursive: true });

await makePdf("invoice-clean.pdf", [
  ["TAX INVOICE", true],
  ["Acme Traders, 14 Market Road, Ludhiana 141001"],
  ["Invoice Number: INV-2026-001"],
  ["Invoice Date: 2026-01-05"],
  ["Due Date: 2026-02-05"],
  ["Bill To: Karan Arya, Phagwara"],
  ["", false],
  ["Items:", true],
  ["Widgets (10 x Rs 300) - Rs 3000"],
  ["Consulting service (1 x Rs 1000) - Rs 1000"],
  ["", false],
  ["Subtotal: Rs 4000"],
  ["GST 18%: Rs 720"],
  ["Total: Rs 4720"],
  ["Payment terms: 30 days. Thank you for your business."],
]);

await makePdf("invoice-badmath.pdf", [
  ["INVOICE", true],
  ["Bright Supplies Co, Delhi 110002"],
  ["Invoice Number: BS-991"],
  ["Invoice Date: 2026-01-10"],
  ["Due Date: 2026-02-10"],
  ["Bill To: Karan Arya"],
  ["", false],
  ["Items:", true],
  ["Paper reams (20 x Rs 150) - Rs 3000"],
  ["Delivery (1 x Rs 1000) - Rs 1000"],
  ["", false],
  ["Subtotal: Rs 5000"],
  ["GST 18%: Rs 900"],
  ["Total: Rs 5200"],
]);

await makePdf("invoice-duplicate.pdf", [
  ["TAX INVOICE", true],
  ["Acme Traders, 14 Market Road, Ludhiana 141001"],
  ["Invoice Number: INV-2026-001"],
  ["Invoice Date: 2026-01-06"],
  ["Bill To: Karan Arya, Phagwara"],
  ["", false],
  ["Items:", true],
  ["Late fee (1 x Rs 1000) - Rs 1000"],
  ["", false],
  ["Subtotal: Rs 1000"],
  ["Total: Rs 1000"],
]);

// A two-page general document for Q&A citation tests.
{
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const p1 = pdf.addPage([612, 792]);
  p1.drawText("Office Lease Summary", { x: 50, y: 750, size: 14, font });
  p1.drawText("The monthly rent is Rs 25,000 payable by the 5th of each month.", { x: 50, y: 720, size: 11, font });
  p1.drawText("The lease term is 11 months starting 1 March 2026.", { x: 50, y: 704, size: 11, font });
  const p2 = pdf.addPage([612, 792]);
  p2.drawText("Termination", { x: 50, y: 750, size: 14, font });
  p2.drawText("Either party may terminate with 2 months written notice.", { x: 50, y: 720, size: 11, font });
  p2.drawText("The security deposit of Rs 50,000 is refundable within 30 days of vacating.", { x: 50, y: 704, size: 11, font });
  await writeFile(path.join(OUT, "lease.pdf"), await pdf.save());
  truth["lease.pdf"] = {
    qa: [
      { question: "What is the security deposit and when is it refunded?", mustMention: "50,000", expectPage: 2 },
      { question: "How much is the monthly rent?", mustMention: "25,000", expectPage: 1 },
    ],
  };
}

await writeFile(path.join(OUT, "truth.json"), JSON.stringify(truth, null, 2));
console.log("fixtures written:", Object.keys(truth).join(", "));
