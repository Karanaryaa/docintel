import type { InvoiceFields, InvoiceFlag, InvoiceRecord } from "./types";

const TOLERANCE = 0.02; // 2% rounding tolerance

function near(a: number, b: number): boolean {
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / base <= TOLERANCE;
}

/**
 * Deterministic consistency checks over extracted invoice fields.
 * These run in code, never by asking the model, so flags are reproducible.
 */
export function checkInvoice(
  fields: InvoiceFields,
  others: Pick<InvoiceRecord, "documentId" | "fields">[] = [],
  selfDocumentId = ""
): InvoiceFlag[] {
  const flags: InvoiceFlag[] = [];

  const required: Array<[keyof InvoiceFields, string]> = [
    ["vendorName", "vendor name"],
    ["invoiceNumber", "invoice number"],
    ["invoiceDate", "invoice date"],
    ["total", "total"],
  ];
  for (const [key, label] of required) {
    if (fields[key] === null || fields[key] === "") {
      flags.push({
        code: "MISSING_FIELD",
        severity: "error",
        message: `Missing ${label}`,
      });
    }
  }

  const itemSum = fields.lineItems.reduce(
    (sum, li) => sum + (li.amount ?? 0),
    0
  );
  const hasItemAmounts = fields.lineItems.some((li) => li.amount !== null);

  if (hasItemAmounts && fields.subtotal !== null && !near(itemSum, fields.subtotal)) {
    flags.push({
      code: "LINE_SUM_MISMATCH",
      severity: "error",
      message: `Line items add up to ${round2(itemSum)} but the subtotal says ${round2(fields.subtotal)}`,
      expected: fields.subtotal,
      actual: round2(itemSum),
    });
  }

  const base = fields.subtotal ?? (hasItemAmounts ? itemSum : null);
  if (base !== null && fields.taxAmount !== null && fields.total !== null) {
    const computed = base + fields.taxAmount;
    if (!near(computed, fields.total)) {
      flags.push({
        code: "TOTAL_MISMATCH",
        severity: "error",
        message: `Subtotal + tax = ${round2(computed)} but the total says ${round2(fields.total)}`,
        expected: fields.total,
        actual: round2(computed),
      });
    }
  } else if (base !== null && fields.taxAmount === null && fields.total !== null) {
    if (!near(base, fields.total)) {
      flags.push({
        code: "TOTAL_MISMATCH",
        severity: "warning",
        message: `No tax line found, but subtotal ${round2(base)} does not equal total ${round2(fields.total)}`,
        expected: fields.total,
        actual: round2(base),
      });
    }
  }

  // Tax is judged against the itemized base when line items exist: if the
  // items sum to X and the stated rate implies a different tax than printed,
  // the invoice is internally inconsistent even when its subtotal agrees.
  const taxBase = hasItemAmounts ? itemSum : base;
  if (fields.taxRate !== null && taxBase !== null && fields.taxAmount !== null && taxBase > 0) {
    const computedTax = (taxBase * fields.taxRate) / 100;
    if (!near(computedTax, fields.taxAmount)) {
      flags.push({
        code: "TAX_MISMATCH",
        severity: "warning",
        message: `Stated tax rate ${fields.taxRate}% implies ${round2(computedTax)} tax, but the invoice says ${round2(fields.taxAmount)}`,
        expected: round2(computedTax),
        actual: fields.taxAmount,
      });
    }
  }

  if (fields.invoiceDate && fields.dueDate) {
    const issued = Date.parse(fields.invoiceDate);
    const due = Date.parse(fields.dueDate);
    if (!Number.isNaN(issued) && !Number.isNaN(due) && due < issued) {
      flags.push({
        code: "DATE_INCONSISTENT",
        severity: "warning",
        message: `Due date ${fields.dueDate} is before the invoice date ${fields.invoiceDate}`,
      });
    }
  }

  if (fields.invoiceNumber && fields.vendorName) {
    for (const other of others) {
      if (
        other.documentId !== selfDocumentId &&
        other.fields.invoiceNumber === fields.invoiceNumber &&
        (other.fields.vendorName ?? "").toLowerCase() ===
          fields.vendorName.toLowerCase()
      ) {
        flags.push({
          code: "DUPLICATE_INVOICE",
          severity: "error",
          message: `Same invoice number ${fields.invoiceNumber} from ${fields.vendorName} also appears in another uploaded document`,
        });
        break;
      }
    }
  }

  return flags;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
