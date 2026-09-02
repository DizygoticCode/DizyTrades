import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("self-hosted DizyFlow capacity remains explicitly bounded and configurable", async () => {
  const example = await readFile(".env.example", "utf8");
  const registry = await readFile("app/lib/order-flow/depth-collector-impl.ts", "utf8");
  const tapes = await readFile("app/lib/order-flow/liquidity-tape-impl.ts", "utf8");
  const tiles = await readFile("app/api/dizyflow/heatmap/tiles/route.ts", "utf8");

  assert.match(example, /^DIZYFLOW_ARCHIVE_ENABLED=true$/m);
  assert.match(example, /^DIZYQUANT_CAMPAIGN_RECORDER_ENABLED=true$/m);
  assert.match(example, /^DIZYFLOW_MAX_COLLECTORS=3$/m);
  assert.match(example, /^DIZYFLOW_MAX_TAPES=3$/m);
  assert.match(example, /^DIZYFLOW_TILE_CACHE_MB=12$/m);

  assert.match(registry, /process\.env\.DIZYFLOW_MAX_COLLECTORS/);
  assert.match(registry, /throw Error\("DizyFlow collector capacity reached"\)/);
  assert.match(tapes, /DIZYFLOW_MAX_TAPES/);
  assert.match(tapes, /throw Error\("DizyFlow tape capacity reached"\)/);
  assert.match(tiles, /process\.env\.DIZYFLOW_TILE_CACHE_MB/);
});
