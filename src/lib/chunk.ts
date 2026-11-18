export interface PageText {
  page: number;
  text: string;
}

export interface ChunkDraft {
  page: number;
  index: number;
  text: string;
}

const TARGET_CHARS = 900;
const OVERLAP_CHARS = 150;

/**
 * Split page-level text into overlapping chunks that never cross a page
 * boundary, so every chunk carries exactly one citation page.
 */
export function chunkPages(pages: PageText[]): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  let index = 0;
  for (const { page, text } of pages) {
    const clean = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!clean) continue;
    if (clean.length <= TARGET_CHARS) {
      chunks.push({ page, index: index++, text: clean });
      continue;
    }
    const sentences = clean.match(/[^.!?\n]+[.!?]?\s*/g) ?? [clean];
    let current = "";
    for (const sentence of sentences) {
      if (current.length + sentence.length > TARGET_CHARS && current.length > 0) {
        chunks.push({ page, index: index++, text: current.trim() });
        const tail = current.slice(-OVERLAP_CHARS);
        current = tail + sentence;
      } else {
        current += sentence;
      }
    }
    if (current.trim()) chunks.push({ page, index: index++, text: current.trim() });
  }
  return chunks;
}

/** Cosine similarity over equal-length vectors. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
