import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolbarPath = new URL("../app/order-flow-toolbar.tsx", import.meta.url);
const primitivePath = new URL(
  "../app/lib/chart/dizyflow-primitive.ts",
  import.meta.url,
);

test("toolbar keeps heatmap and depth analysis out of its compact control row", async () => {
  const source = await readFile(toolbarPath, "utf8");
  assert.match(source, /\["marketDepthVisible", "Market Depth"\]/);
  assert.match(source, /dizyflow-brain-open/);
  assert.doesNotMatch(source, /market-depth-summary|Heatmap render:|heatmapObservationsRetained|Resting orders can be cancelled/);
});

test("heatmap rows use the effective display bin rather than the raw exchange tick", async () => {
  const source = await readFile(primitivePath, "utf8");

  assert.match(
    source,
    /priceToCoordinate\(segment\.price\+displayStep\)/,
  );
  assert.doesNotMatch(
    source,
    /priceToCoordinate\(segment\.price\+s\.priceStep\)/,
  );
  assert.match(
    source,
    /settings\.heatmapVisible,settings\.heatmap/,
  );
});
