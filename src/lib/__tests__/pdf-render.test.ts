import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderPageToPng } from "../pdf-render.js";

test("renders a PDF page containing vector graphics (Path2D regression)", async () => {
  const bytes = new Uint8Array(readFileSync("scripts/fixtures/vector.pdf"));
  const png = await renderPageToPng(bytes, 1);
  assert.ok(png.length > 5000, "expected a non-trivial PNG");
  assert.equal(png[0], 0x89); // PNG magic
});
