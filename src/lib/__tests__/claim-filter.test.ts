import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClaimFilter } from "../store/supabase";

// Regression: an equals-form operator (`status=in.(...)`) inside a PostgREST
// or() logic tree fails to parse server-side (PGRST100), which made every
// ingest claim throw and silently killed all uploads. These tests pin the
// exact query-string grammar the claim depends on.

test("claim filter uses dot-notation operators inside the logic tree", () => {
  const f = buildClaimFilter("2026-11-18T11:00:00.000Z");
  // no column=op.value form anywhere in the tree
  assert.ok(!/=(eq|in|lt|gt|lte|gte|neq|is)\./.test(f), `equals-form operator found in: ${f}`);
  // the dot-notation operators the claim relies on are present
  assert.match(f, /status\.in\.\(uploaded,error\)/);
  assert.match(f, /status\.eq\.processing/);
  assert.match(f, /createdAt\.lt\.2026-11-18T11:00:00\.000Z/);
});

test("claim filter is a single well-formed or() tree", () => {
  const f = buildClaimFilter("2026-11-18T11:00:00.000Z");
  assert.ok(f.startsWith("or=("), `must start with or=( : ${f}`);
  let depth = 0;
  for (const ch of f) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    assert.ok(depth >= 0, `unbalanced parens in: ${f}`);
  }
  assert.equal(depth, 0, `unbalanced parens in: ${f}`);
  // both claim branches present: fresh uploads/errors, or stale processing
  assert.match(f, /and\(/, "stale-processing branch missing");
});
