import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/dizybrain-signal-context-fix.tsx", import.meta.url), "utf8");
const page = await readFile(new URL("../app/terminal/page.tsx", import.meta.url), "utf8");

test("DizyBrain separates current setup from the last historical signal", () => {
  assert.match(source, /Current setup:.*-leaning · Last confirmed signal:/);
  assert.match(source, /Last confirmed signal/);
  assert.match(source, /Historical:/);
});

test("DizyBrain does not invent a fixed confluence qualification threshold", () => {
  assert.doesNotMatch(source, /activeScore\s*[<>]=?\s*4/);
  assert.match(source, /Qualification is not inferred/);
  assert.match(source, /does not yet receive the active strategy threshold directly/);
});

test("terminal mounts the signal context correction", () => {
  assert.match(page, /DizyBrainSignalContextFix/);
});
