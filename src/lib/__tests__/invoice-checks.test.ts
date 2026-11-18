import test from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "../invoice-checks.ts";
import type { InvoiceFields } from "../types.ts";

const clean: InvoiceFields = {
  vendorName: "Acme Traders",
  invoiceNumber: "INV-001",
  invoiceDate: "2026-01-05",
  dueDate: "2026-02-05",
  currency: "INR",
  lineItems: [
    { description: "Widgets", quantity: 10, unitPrice: 300, amount: 3000 },
    { description: "Service", quantity: 1, unitPrice: 1000, amount: 1000 },
  ],
  subtotal: 4000,
  taxAmount: 720,
  taxRate: 18,
  total: 4720,
};

test("a consistent invoice produces no flags", () => {
  assert.deepEqual(checkInvoice(clean), []);
});

test("line-item sum mismatch is caught with numbers", () => {
  const bad = { ...clean, subtotal: 5000 };
  const flags = checkInvoice(bad);
  const f = flags.find((f) => f.code === "LINE_SUM_MISMATCH");
  assert.ok(f);
  assert.equal(f.actual, 4000);
  assert.equal(f.expected, 5000);
});

test("total that does not equal subtotal + tax is caught", () => {
  const bad = { ...clean, total: 5000 };
  const flags = checkInvoice(bad);
  assert.ok(flags.some((f) => f.code === "TOTAL_MISMATCH"));
});

test("tax rate inconsistency is caught", () => {
  const bad = { ...clean, taxAmount: 400 }; // 18% of 4000 = 720
  const flags = checkInvoice(bad);
  assert.ok(flags.some((f) => f.code === "TAX_MISMATCH"));
});

test("due date before invoice date is caught", () => {
  const bad = { ...clean, dueDate: "2025-12-01" };
  const flags = checkInvoice(bad);
  assert.ok(flags.some((f) => f.code === "DATE_INCONSISTENT"));
});

test("missing required fields are caught", () => {
  const bad = { ...clean, vendorName: null, total: null };
  const flags = checkInvoice(bad);
  assert.equal(flags.filter((f) => f.code === "MISSING_FIELD").length, 2);
});

test("duplicate invoice number from same vendor in another document is caught", () => {
  const other = { documentId: "doc-b", fields: { ...clean } };
  const flags = checkInvoice(clean, [other], "doc-a");
  assert.ok(flags.some((f) => f.code === "DUPLICATE_INVOICE"));
});

test("same number from a different vendor is not a duplicate", () => {
  const other = { documentId: "doc-b", fields: { ...clean, vendorName: "Other Co" } };
  const flags = checkInvoice(clean, [other], "doc-a");
  assert.ok(!flags.some((f) => f.code === "DUPLICATE_INVOICE"));
});

test("small rounding differences within tolerance pass", () => {
  const ok = { ...clean, total: 4720.05 };
  assert.deepEqual(checkInvoice(ok), []);
});
