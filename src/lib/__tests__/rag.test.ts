import { test } from "node:test";
import assert from "node:assert/strict";
import { answerQuestion } from "../rag";
import type { Store } from "../store/types";

// A store that blows up if retrieval is attempted: the greeting fast-path
// must return before any retrieval or model call happens.
const explodingStore = {
  async allChunks(): Promise<never[]> {
    throw new Error("retrieval must not run for small talk");
  },
} as unknown as Store;

test("small talk answers instantly without retrieval or the model", async () => {
  for (const q of ["hey", "Hi!", "hello", "thanks", "ok"]) {
    const start = Date.now();
    const answer = await answerQuestion(explodingStore, q, "doc-1");
    assert.ok(Date.now() - start < 100, `greeting '${q}' should not wait on the pipeline`);
    assert.equal(answer.citations.length, 0);
    assert.equal(answer.insufficientEvidence, false);
    assert.match(answer.answer, /ask me anything/i);
  }
});

test("real questions are not caught by the small-talk filter", async () => {
  // "hey what is the penalty clause?" is a question, not a greeting: it must
  // reach retrieval (which throws here), proving the filter passed it through.
  await assert.rejects(answerQuestion(explodingStore, "hey what is the penalty clause?", "doc-1"), /retrieval must not run/);
});

test("grouped citation markers like [1, 2] produce chips for every number", async () => {
  const { finalizeAnswer } = await import("../rag");
  const ranked = [1, 2, 3].map((i) => ({
    id: `d:${i}`,
    documentId: "d",
    page: i,
    index: i,
    text: `chunk text ${i}`,
    score: 0.9,
  }));
  const docs = new Map([["d", "doc.pdf"]]);
  const answer = finalizeAnswer("Rent is Rs 100 [1, 2] and deposit Rs 50 [3].", ranked as never, docs);
  assert.deepEqual(
    answer.citations.map((c) => c.page),
    [1, 2, 3]
  );
});

test("out-of-range citation numbers are dropped, not fabricated", async () => {
  const { finalizeAnswer } = await import("../rag");
  const ranked = [
    { id: "d:1", documentId: "d", page: 1, index: 1, text: "only chunk", score: 0.9 },
  ];
  const docs = new Map([["d", "doc.pdf"]]);
  const answer = finalizeAnswer("Claims [1, 9] and [99].", ranked as never, docs);
  assert.deepEqual(
    answer.citations.map((c) => c.page),
    [1]
  );
});

test("lexical fallback uses whole words: 'main' does not match 'remains'", async () => {
  const { rankLexical } = await import("../rag");
  const ranked = rankLexical(
    [{ text: "It remains to be seen; mainly speculative, domain remains." }],
    "what is the main idea"
  );
  assert.equal(ranked.length, 0);
});

test("lexical fallback demotes table-of-contents pages below prose", async () => {
  const { rankLexical } = await import("../rag");
  const toc = {
    text: "Table Of Contents CHAPTER 1: INTRODUCTION.16 CHAPTER 2: DESIRE.29 CHAPTER 3: FAITH.47 CHAPTER 4: AUTO-SUGGESTION.66 CHAPTER 5: SPECIALIZED KNOWLEDGE.73 CHAPTER 6: IMAGINATION.86",
  };
  const prose = { text: "The first chapter tells of a man who stopped digging three feet from gold." };
  const ranked = rankLexical([toc, prose], "what is the main idea of the first chapter");
  assert.equal(ranked[0].text, prose.text);
  assert.ok(ranked[0].score > ranked[1].score);
});
