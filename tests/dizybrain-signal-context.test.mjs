import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../app/dizybrain-signal-context-fix.tsx", import.meta.url),
  "utf8",
);
const page = await readFile(
  new URL("../app/terminal/page.tsx", import.meta.url),
  "utf8",
);

test("DizyBrain current setup excludes stale historical signal text", () => {
  assert.match(source, /\$\{direction\}-leaning current setup/);
  assert.match(source, /Historical signals are intentionally excluded from this view/);
  assert.doesNotMatch(
    source,
    /Current setup:.*-leaning · Last confirmed signal:/,
  );
  assert.doesNotMatch(source, /detail\.textContent = `Historical:/);
});

test("DizyBrain does not invent a fixed confluence qualification threshold", () => {
  assert.doesNotMatch(source, /activeScore\s*[<>]=?\s*4/);
  assert.match(source, /Qualification is not inferred/);
  assert.match(source, /active strategy threshold directly/);
  assert.doesNotMatch(source, /qualification threshold.*4\/5/i);
});

test("terminal mounts the signal context correction", () => {
  assert.match(page, /DizyBrainSignalContextFix/);
});
