import test from "node:test";
import assert from "node:assert/strict";
import { chunkPages, cosine } from "../chunk.ts";

test("short page becomes a single chunk with its page number", () => {
  const chunks = chunkPages([{ page: 3, text: "Total due: Rs 4,800." }]);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].page, 3);
  assert.match(chunks[0].text, /4,800/);
});

test("long page splits into overlapping chunks, never crossing pages", () => {
  const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about contract terms.`).join(" ");
  const chunks = chunkPages([
    { page: 1, text: long },
    { page: 2, text: "Second page content." },
  ]);
  assert.ok(chunks.length > 2);
  const pages = new Set(chunks.map((c) => c.page));
  assert.deepEqual([...pages].sort(), [1, 2]);
  for (const c of chunks) assert.ok(c.text.length <= 1100, `chunk too long: ${c.text.length}`);
  // overlap: consecutive page-1 chunks share text
  const p1 = chunks.filter((c) => c.page === 1);
  if (p1.length > 1) {
    const tail = p1[0].text.slice(-80);
    assert.ok(p1[1].text.includes(tail.slice(0, 40)), "expected overlap between chunks");
  }
});

test("empty pages produce no chunks", () => {
  assert.equal(chunkPages([{ page: 1, text: "   " }]).length, 0);
});

test("cosine similarity basics", () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([], [1]), 0);
});
