export type DocStatus = "uploaded" | "processing" | "ready" | "error";

export interface DocumentMeta {
  id: string;
  name: string;
  sizeBytes: number;
  pageCount: number;
  status: DocStatus;
  error?: string;
  createdAt: string;
  /** local file path in dev, blob key when deployed */
  storageKey: string;
  /** pages that had too little embedded text and need vision OCR */
  ocrPages: number[];
  kind: "invoice" | "document";
  /** live human-readable ingest stage, shown while status is processing */
  progress?: string;
}

export interface Chunk {
  id: string;
  documentId: string;
  page: number;
  index: number;
  text: string;
  embedding?: number[];
}

export interface Citation {
  documentId: string;
  documentName: string;
  page: number;
  excerpt: string;
}

export interface ChatAnswer {
  answer: string;
  citations: Citation[];
  insufficientEvidence: boolean;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
}

export interface InvoiceFields {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string | null;
  lineItems: InvoiceLineItem[];
  subtotal: number | null;
  taxAmount: number | null;
  taxRate: number | null;
  total: number | null;
}

export type FlagSeverity = "error" | "warning" | "info";

export interface InvoiceFlag {
  code:
    | "LINE_SUM_MISMATCH"
    | "TOTAL_MISMATCH"
    | "MISSING_FIELD"
    | "DUPLICATE_INVOICE"
    | "DATE_INCONSISTENT"
    | "TAX_MISMATCH";
  severity: FlagSeverity;
  message: string;
  expected?: number;
  actual?: number;
}

export interface InvoiceRecord {
  documentId: string;
  fields: InvoiceFields;
  flags: InvoiceFlag[];
  extractedAt: string;
}
