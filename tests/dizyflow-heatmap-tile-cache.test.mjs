import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const routePath = "app/api/dizyflow/heatmap/tiles/route.ts";

test("DizyFlow heatmap tile cache retains the exact serialized payload it budgets", async () => {
  const source = await readFile(routePath, "utf8");

  assert.match(source, /const cache=new Map<string,\{payload:string;bytes:number\}>\(\)/);
  assert.match(source, /const remember=\(key:string,payload:string\)=>\{const bytes=Buffer\.byteLength\(payload\)/);
  assert.equal(source.match(/JSON\.stringify\(value\)/g)?.length, 1, "tile value must be serialized exactly once");
  assert.match(source, /const payload=JSON\.stringify\(value\);throwIfHeatmapTileBuildAborted\(request\.signal\);remember\(key,payload\);return tileResponse\(payload,"miss"\)/);
  assert.match(source, /return tileResponse\(hit\.payload,"hit"\)/);
  assert.doesNotMatch(source, /Buffer\.byteLength\(JSON\.stringify\(value\)\)/);
  assert.doesNotMatch(source, /value:LiquidityTileResponse/);
});

test("DizyFlow serialized tile responses preserve the private JSON cache contract", async () => {
  const source = await readFile(routePath, "utf8");

  assert.match(source, /new Response\(payload,\{headers:\{\"content-type\":\"application\/json\",\"cache-control\":\"private, no-store\",\"x-dizyflow-tile-cache\":status\}\}\)/);
  assert.match(source, /while\(cacheBytes>MAX_CACHE_BYTES\)/);
  assert.match(source, /cache\.delete\(key\);cache\.set\(key,hit\)/);
});
