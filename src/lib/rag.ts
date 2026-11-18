import { chunkPages, cosine, type PageText } from "./chunk";
import { embedPassages, embedQuery } from "./embed";
import { chat, chatStream } from "./ai";
import { getCachedAnswer, setCachedAnswer } from "./answer-cache";
import type { ChatAnswer, Chunk, Citation, DocumentMeta } from "./types";
import type { Store } from "./store/types";

const TOP_K = 6;
const MIN_SCORE = 0.25;

export async function indexDocument(
  store: Store,
  doc: DocumentMeta,
  pages: PageText[]
): Promise<number> {
  const drafts = chunkPages(pages);
  if (drafts.length === 0) return 0;
  const embeddings = await embedPassages(drafts.map((d) => d.text));
  const chunks: Chunk[] = drafts.map((d, i) => ({
    id: `${doc.id}:${d.index}`,
    documentId: doc.id,
    page: d.page,
    index: d.index,
    text: d.text,
    embedding: embeddings[i],
  }));
  await store.putChunks(chunks);
  return chunks.length;
}

interface RankedChunk extends Chunk {
  score: number;
}

async function retrieve(store: Store, question: string, documentId?: string): Promise<RankedChunk[]> {
  const q = await embedQuery(question);
  const all = await store.allChunks();
  const ranked = all
    .filter((c) => c.embedding && (!documentId || c.documentId === documentId))
    .map((c) => ({ ...c, score: cosine(q, c.embedding!) }))
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, TOP_K);
}

/**
 * Answer a question with page-level citations. The model is instructed to
 * cite only the supplied chunks and to say when the documents do not contain
 * the answer; citation markers [1], [2] map to retrieved chunks.
 */
// Trivial small talk never touches retrieval or the model: a greeting that
// went through the full pipeline once took over a minute to answer.
const SMALL_TALK = /^(hey+|hi+|hello+|yo|hiya|howdy|namaste|good (morning|afternoon|evening)|thanks?( you)?|ok(ay)?|cool|nice|great|bye|good ?night)[!.,\s]*$/i;

function smallTalkAnswer(): ChatAnswer {
  return {
    answer: "Hey! Ask me anything about this document and I'll answer with page citations.",
    citations: [],
    insufficientEvidence: false,
  };
}

async function retrieveWithFallback(
  store: Store,
  question: string,
  documentId?: string
): Promise<RankedChunk[]> {
  let ranked = await retrieve(store, question, documentId);
  if ((ranked.length === 0 || ranked[0].score < MIN_SCORE) && documentId) {
    // Generic questions about a selected document ("whats this?") don't
    // embed closely to any specific chunk. Fall back to the start of that
    // document so the model can describe it. The model still refuses when
    // the question genuinely isn't covered - only the context changes.
    const head = (await store.allChunks())
      .filter((c) => c.documentId === documentId && c.embedding)
      .sort((a, b) => a.index - b.index)
      .slice(0, 4)
      .map((c) => ({ ...c, score: 1 }));
    if (head.length > 0) ranked = head;
  }
  return ranked;
}

async function docNames(store: Store, ranked: RankedChunk[]): Promise<Map<string, string>> {
  const docs = new Map<string, string>();
  for (const c of ranked) {
    if (!docs.has(c.documentId)) {
      const meta = await store.getDocument(c.documentId);
      docs.set(c.documentId, meta?.name ?? c.documentId);
    }
  }
  return docs;
}

function buildContext(ranked: RankedChunk[], docs: Map<string, string>): string {
  return ranked
    .map(
      (c, i) => `[${i + 1}] (${docs.get(c.documentId)}, page ${c.page})\n${c.text}`
    )
    .join("\n\n---\n\n");
}

export async function answerQuestion(
  store: Store,
  question: string,
  documentId?: string
): Promise<ChatAnswer> {
  if (question.length <= 30 && SMALL_TALK.test(question.trim())) {
    return smallTalkAnswer();
  }
  const ranked = await retrieveWithFallback(store, question, documentId);
  if (ranked.length === 0 || ranked[0].score < MIN_SCORE) {
    return {
      answer: "I could not find anything about that in the uploaded documents.",
      citations: [],
      insufficientEvidence: true,
    };
  }

  const docs = await docNames(store, ranked);
  const context = buildContext(ranked, docs);
  const messages = buildMessages(context, question);
  const raw = await chat(messages);
  return finalizeAnswer(raw, ranked, docs);
}

function buildMessages(context: string, question: string) {
  return [
    {
      role: "system" as const,
      content:
        "You answer questions about uploaded documents. Rules: use ONLY the numbered excerpts below. " +
        "Every claim must cite its excerpt like [1] or [2]. If the excerpts do not contain the answer, " +
        'reply exactly: "The documents do not say." Never use outside knowledge. Keep answers tight.',
    },
    {
      role: "user" as const,
      content: `Excerpts:\n${context}\n\nQuestion: ${question}`,
    },
  ];
}

function finalizeAnswer(raw: string, ranked: RankedChunk[], docs: Map<string, string>): ChatAnswer {
  const insufficient = /documents do not say/i.test(raw);
  const citations: Citation[] = [];
  if (!insufficient) {
    const used = new Set<number>();
    for (const m of raw.matchAll(/\[(\d+)\]/g)) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= ranked.length) used.add(n);
    }
    for (const n of [...used].sort((a, b) => a - b)) {
      const c = ranked[n - 1];
      citations.push({
        documentId: c.documentId,
        documentName: docs.get(c.documentId) ?? c.documentId,
        page: c.page,
        excerpt: c.text.slice(0, 280),
      });
    }
  }
  return { answer: raw, citations, insufficientEvidence: insufficient };
}

export type AnswerEvent =
  | { type: "delta"; text: string }
  | { type: "final"; answer: ChatAnswer };

/**
 * Streaming variant of answerQuestion: yields answer tokens as the model
 * produces them (so the UI can show words within seconds), then a final
 * event with the parsed citations. Identical retrieval, prompt and citation
 * rules as the non-streaming path; scoped per-document answers are cached
 * (keyed by document + normalized question) so repeats return instantly.
 */
export async function* answerQuestionEvents(
  store: Store,
  question: string,
  documentId?: string
): AsyncGenerator<AnswerEvent> {
  if (question.length <= 30 && SMALL_TALK.test(question.trim())) {
    const answer = smallTalkAnswer();
    yield { type: "delta", text: answer.answer };
    yield { type: "final", answer };
    return;
  }

  if (documentId) {
    const hit = await getCachedAnswer(documentId, question).catch(() => null);
    if (hit) {
      yield { type: "delta", text: hit.answer };
      yield { type: "final", answer: hit };
      return;
    }
  }

  const ranked = await retrieveWithFallback(store, question, documentId);
  if (ranked.length === 0 || ranked[0].score < MIN_SCORE) {
    const answer: ChatAnswer = {
      answer: "I could not find anything about that in the uploaded documents.",
      citations: [],
      insufficientEvidence: true,
    };
    yield { type: "delta", text: answer.answer };
    yield { type: "final", answer };
    return;
  }

  const docs = await docNames(store, ranked);
  const context = buildContext(ranked, docs);
  const stream = await chatStream(buildMessages(context, question));

  // Parse the OpenAI-style SSE stream and forward content deltas.
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const piece = (JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> })
          .choices?.[0]?.delta?.content;
        if (piece) {
          raw += piece;
          yield { type: "delta", text: piece };
        }
      } catch {
        // partial JSON across chunks is handled via the line buffer; skip junk
      }
    }
  }

  const answer = finalizeAnswer(raw, ranked, docs);
  if (documentId) {
    await setCachedAnswer(documentId, question, answer).catch(() => {});
  }
  yield { type: "final", answer };
}
