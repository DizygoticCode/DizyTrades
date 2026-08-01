import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/dizybrain-shell.tsx", import.meta.url), "utf8");

test("DizyBrain explains live setup progression without inventing historical events", () => {
  assert.match(source, /Current setup timeline/);
  assert.match(source, /Why this is not qualified yet/);
  assert.match(source, /Historical per-candle rule events will require a dedicated rule ledger/);
  assert.match(source, /Confluence is \$\{activeScore\}\/5/);
  assert.match(source, /No confirmed-candle signal is present/);
  assert.doesNotMatch(source, /13:45|14:05|14:15|14:30/);
});
