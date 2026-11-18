import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Chunk, DocumentMeta, InvoiceRecord } from "../types";
import type { Store } from "./types";

const DATA = path.join(process.cwd(), ".data");
const FILES = path.join(DATA, "files");

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(DATA, name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(name: string, value: unknown): Promise<void> {
  await mkdir(DATA, { recursive: true });
  await writeFile(path.join(DATA, name), JSON.stringify(value, null, 2));
}

export class LocalStore implements Store {
  async putDocument(meta: DocumentMeta, bytes: Uint8Array): Promise<void> {
    await mkdir(FILES, { recursive: true });
    await writeFile(path.join(FILES, meta.storageKey), bytes);
    const docs = await readJson<DocumentMeta[]>("documents.json", []);
    docs.push(meta);
    await writeJson("documents.json", docs);
  }

  async getDocument(id: string): Promise<DocumentMeta | null> {
    const docs = await readJson<DocumentMeta[]>("documents.json", []);
    return docs.find((d) => d.id === id) ?? null;
  }

  async listDocuments(): Promise<DocumentMeta[]> {
    const docs = await readJson<DocumentMeta[]>("documents.json", []);
    return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getDocumentBytes(id: string): Promise<Uint8Array> {
    const doc = await this.getDocument(id);
    if (!doc) throw new Error(`document ${id} not found`);
    return new Uint8Array(await readFile(path.join(FILES, doc.storageKey)));
  }

  async updateDocument(id: string, patch: Partial<DocumentMeta>): Promise<void> {
    const docs = await readJson<DocumentMeta[]>("documents.json", []);
    const i = docs.findIndex((d) => d.id === id);
    if (i >= 0) {
      docs[i] = { ...docs[i], ...patch };
      await writeJson("documents.json", docs);
    }
  }

  async putChunks(chunks: Chunk[]): Promise<void> {
    const existing = await readJson<Chunk[]>("chunks.json", []);
    const ids = new Set(chunks.map((c) => c.documentId));
    const kept = existing.filter((c) => !ids.has(c.documentId));
    await writeJson("chunks.json", kept.concat(chunks));
  }

  async allChunks(): Promise<Chunk[]> {
    return readJson<Chunk[]>("chunks.json", []);
  }

  async putInvoice(record: InvoiceRecord): Promise<void> {
    const existing = await readJson<InvoiceRecord[]>("invoices.json", []);
    const kept = existing.filter((r) => r.documentId !== record.documentId);
    await writeJson("invoices.json", kept.concat(record));
  }

  async listInvoices(): Promise<InvoiceRecord[]> {
    return readJson<InvoiceRecord[]>("invoices.json", []);
  }

  async deleteDocument(id: string): Promise<void> {
    const docs = await readJson<DocumentMeta[]>("documents.json", []);
    await writeJson("documents.json", docs.filter((d) => d.id !== id));
    const chunks = await readJson<Chunk[]>("chunks.json", []);
    await writeJson("chunks.json", chunks.filter((c) => c.documentId !== id));
    const invoices = await readJson<InvoiceRecord[]>("invoices.json", []);
    await writeJson("invoices.json", invoices.filter((r) => r.documentId !== id));
  }
}
