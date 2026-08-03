import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Manual Paper reuses and always releases the shared DizyFlow depth collector", async () => {
  const source = await readFile(
    new URL("../app/lib/manual-paper-depth-source.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /acquireDepthCollector\(symbol\)/);
  assert.match(source, /finally\s*\{\s*releaseDepthCollector\(symbol\)/s);
  assert.doesNotMatch(source, /new\s+DepthCollector/);
  assert.match(source, /envelope\.snapshot\.bids\.length/);
  assert.match(source, /envelope\.snapshot\.asks\.length/);
  assert.match(source, /now\s*-\s*envelope\.receivedAt\s*<=\s*DEPTH_STALE_MS/);
});
