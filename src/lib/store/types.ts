import type { Chunk, DocumentMeta, InvoiceRecord } from "../types";

export interface Store {
  putDocument(meta: DocumentMeta, bytes: Uint8Array): Promise<void>;
  getDocument(id: string): Promise<DocumentMeta | null>;
  listDocuments(): Promise<DocumentMeta[]>;
  getDocumentBytes(id: string): Promise<Uint8Array>;
  updateDocument(id: string, patch: Partial<DocumentMeta>): Promise<void>;
  /**
   * Atomically claim a document for (re)processing: succeeds only when it
   * is not ready and not already being handled by a live run (a processing
   * state younger than the stale threshold). Optional; stores without it
   * are single-runner by construction.
   */
  claimDocument?(id: string): Promise<boolean>;
  putChunks(chunks: Chunk[]): Promise<void>;
  allChunks(documentId?: string): Promise<Chunk[]>;
  putInvoice(record: InvoiceRecord): Promise<void>;
  listInvoices(): Promise<InvoiceRecord[]>;
  deleteDocument(id: string): Promise<void>;
}
