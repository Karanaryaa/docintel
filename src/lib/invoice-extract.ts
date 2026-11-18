import { chatJson } from "./groq";
import { checkInvoice } from "./invoice-checks";
import type { InvoiceFields, InvoiceRecord } from "./types";
import type { Store } from "./store/types";

const SCHEMA_HINT = `{
  "vendorName": string | null,
  "invoiceNumber": string | null,
  "invoiceDate": "YYYY-MM-DD" | null,
  "dueDate": "YYYY-MM-DD" | null,
  "currency": string | null (3-letter code or symbol as printed),
  "lineItems": [{ "description": string, "quantity": number | null, "unitPrice": number | null, "amount": number | null }],
  "subtotal": number | null,
  "taxAmount": number | null,
  "taxRate": number | null (percent, e.g. 18 for 18%),
  "total": number | null
}`;

/** LLM extraction of invoice fields, followed by deterministic checks. */
export async function extractInvoice(
  store: Store,
  documentId: string,
  fullText: string
): Promise<InvoiceRecord> {
  const text = fullText.slice(0, 24000);
  const fields = await chatJson<InvoiceFields>([
    {
      role: "system",
      content:
        "Extract structured fields from the invoice text the user provides. " +
        `Reply with a single JSON object of exactly this shape:\n${SCHEMA_HINT}\n` +
        "Use null for anything not printed on the document. Numbers must be plain JSON numbers, no currency symbols or commas. Never invent values.",
    },
    { role: "user", content: text },
  ]);

  const others = (await store.listInvoices()).filter((r) => r.documentId !== documentId);
  const flags = checkInvoice(fields, others, documentId);
  const record: InvoiceRecord = {
    documentId,
    fields,
    flags,
    extractedAt: new Date().toISOString(),
  };
  await store.putInvoice(record);
  return record;
}
