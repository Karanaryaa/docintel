import type { Chunk, DocumentMeta, InvoiceRecord } from "../types";

export interface Store {
  putDocument(meta: DocumentMeta, bytes: Uint8Array): Promise<void>;
  getDocument(id: string): Promise<DocumentMeta | null>;
  listDocuments(): Promise<DocumentMeta[]>;
  getDocumentBytes(id: string): Promise<Uint8Array>;
  updateDocument(id: string, patch: Partial<DocumentMeta>): Promise<void>;
  putChunks(chunks: Chunk[]): Promise<void>;
  allChunks(): Promise<Chunk[]>;
  putInvoice(record: InvoiceRecord): Promise<void>;
  listInvoices(): Promise<InvoiceRecord[]>;
  deleteDocument(id: string): Promise<void>;
}
