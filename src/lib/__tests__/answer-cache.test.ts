import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeQuestion } from "../answer-cache";

test("cache keys ignore case, surrounding whitespace and repeated spaces", () => {
  assert.equal(normalizeQuestion("  Whats in Unit 3?  "), normalizeQuestion("whats in unit 3?"));
  assert.equal(normalizeQuestion("whats  in   unit 3?"), "v2:whats in unit 3?");
  assert.notEqual(normalizeQuestion("whats in unit 3"), normalizeQuestion("whats in unit 4"));
});
