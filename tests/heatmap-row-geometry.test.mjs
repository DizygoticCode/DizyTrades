import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const primitivePath = new URL("../app/lib/chart/dizyflow-primitive.ts", import.meta.url);

test("heatmap rows use the effective display bin instead of the raw exchange tick", async () => {
  const source = await readFile(primitivePath, "utf8");

  assert.match(
    source,
    /priceToCoordinate\(segment\.price\+displayStep\)/,
    "Bookmap-style rows must span the effective visible price bin",
  );
  assert.doesNotMatch(
    source,
    /priceToCoordinate\(segment\.price\+s\.priceStep\)/,
    "raw exchange ticks collapse BTC liquidity bands into hairlines",
  );
});
