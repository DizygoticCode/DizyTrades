import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/dizybrain-signal-context-fix.tsx", import.meta.url),
  "utf8",
);

test("DizyBrain current setup excludes stale historical signal text", () => {
  assert.match(source, /Current setup direction/);
  assert.match(source, /Historical signals are intentionally excluded from this view/);
  assert.doesNotMatch(source, /Last confirmed signal:/);
  assert.doesNotMatch(source, /Historical confirmed signal available/);
});
