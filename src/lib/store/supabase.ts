import type { Chunk, DocumentMeta, InvoiceRecord } from "../types";
import type { Store } from "./types";

/**
 * Supabase adapter used when SUPABASE_URL + SUPABASE_SECRET_KEY are set
 * (production on Vercel, where the local filesystem is ephemeral).
 * Talks PostgREST directly over fetch - no SDK. Embeddings are stored as a
 * JSON array column; similarity ranking happens in app code, which is fine
 * at this project's scale and keeps the SQL setup trivial (see scripts/).
 */
const URL = () => process.env.SUPABASE_URL!;
const KEY = () => process.env.SUPABASE_SECRET_KEY!;

/**
 * PostgREST filter for the atomic ingest claim. Logic trees (or/and) only
 * accept dot-notation operators - `status=in.(...)` fails to parse server-
 * side (PGRST100), which previously killed every claim. Kept as a pure
 * function so the exact query string is unit-testable.
 */
export function buildClaimFilter(staleBefore: string): string {
  return `or=(status.in.(uploaded,error),and(status.eq.processing,createdAt.lt.${staleBefore}))`;
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${URL()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY(),
      Authorization: `Bearer ${KEY()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export class SupabaseStore implements Store {
  async putDocument(meta: DocumentMeta, bytes: Uint8Array): Promise<void> {
    // file bytes go to Supabase Storage bucket "documents"
    const up = await fetch(`${URL()}/storage/v1/object/documents/${meta.storageKey}`, {
      method: "POST",
      headers: {
        apikey: KEY(),
        Authorization: `Bearer ${KEY()}`,
        "Content-Type": "application/pdf",
        "x-upsert": "true",
      },
      body: bytes as unknown as BodyInit,
    });
    if (!up.ok) throw new Error(`storage ${up.status}: ${(await up.text()).slice(0, 300)}`);
    await rest("documents", { method: "POST", body: JSON.stringify(meta) });
  }

  async getDocument(id: string): Promise<DocumentMeta | null> {
    const rows = await rest<DocumentMeta[]>(`documents?id=eq.${id}&limit=1`);
    return rows[0] ?? null;
  }

  async listDocuments(): Promise<DocumentMeta[]> {
    return rest<DocumentMeta[]>("documents?order=createdAt.desc");
  }

  async getDocumentBytes(id: string): Promise<Uint8Array> {
    const doc = await this.getDocument(id);
    if (!doc) throw new Error(`document ${id} not found`);
    const res = await fetch(`${URL()}/storage/v1/object/documents/${doc.storageKey}`, {
      headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}` },
    });
    if (!res.ok) throw new Error(`storage ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async updateDocument(id: string, patch: Partial<DocumentMeta>): Promise<void> {
    await rest(`documents?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async claimDocument(id: string): Promise<boolean> {
    // Claimable: not ready, and either not processing or processing that
    // went stale (its uploader died mid-run). The conditional UPDATE is the
    // atomic claim: two concurrent claimants cannot both match.
    const staleBefore = new Date(Date.now() - 6 * 60_000).toISOString();
    const filter = buildClaimFilter(staleBefore);
    const rows = await rest<Array<{ id: string }>>(
      `documents?id=eq.${id}&${filter}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "processing", progress: "Queued" }),
      }
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  async putChunks(chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const docId = chunks[0].documentId;
    await rest(`chunks?documentId=eq.${docId}`, { method: "DELETE" });
    // PostgREST bulk insert in batches
    for (let i = 0; i < chunks.length; i += 200) {
      await rest("chunks", { method: "POST", body: JSON.stringify(chunks.slice(i, i + 200)) });
    }
  }

  async allChunks(documentId?: string): Promise<Chunk[]> {
    // Filter server-side: pulling every chunk of every document (with full
    // embedding vectors) took 7-8s per question before this. Page through
    // results: PostgREST caps a response at 1000 rows, and one real document
    // already holds 878 chunks.
    const filter = documentId ? `&documentId=eq.${documentId}` : "";
    const out: Chunk[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await rest<Chunk[]>(`chunks?select=*${filter}&order=index.asc&offset=${offset}`);
      out.push(...page);
      if (page.length < 1000) return out;
    }
  }

  async putInvoice(record: InvoiceRecord): Promise<void> {
    await rest("invoices", {
      method: "POST",
      body: JSON.stringify(record),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    });
  }

  async listInvoices(): Promise<InvoiceRecord[]> {
    return rest<InvoiceRecord[]>("invoices?select=*");
  }

  async deleteDocument(id: string): Promise<void> {
    await rest(`chunks?documentId=eq.${id}`, { method: "DELETE" });
    await rest(`invoices?documentId=eq.${id}`, { method: "DELETE" });
    const doc = await this.getDocument(id);
    await rest(`documents?id=eq.${id}`, { method: "DELETE" });
    if (doc) {
      await fetch(`${URL()}/storage/v1/object/documents/${doc.storageKey}`, {
        method: "DELETE",
        headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}` },
      });
    }
  }
}
