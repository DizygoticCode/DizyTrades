import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolbarPath = new URL("../app/order-flow-toolbar.tsx", import.meta.url);
const primitivePath = new URL(
  "../app/lib/chart/dizyflow-primitive.ts",
  import.meta.url,
);
const storePath = new URL("../app/lib/order-flow/render-store.ts", import.meta.url);

test("toolbar keeps heatmap and depth analysis out of its compact control row", async () => {
  const source = await readFile(toolbarPath, "utf8");
  assert.match(source, /\["marketDepthVisible", "Market Depth"\]/);
  assert.match(source, /dizyflow-brain-open/);
  assert.doesNotMatch(source, /market-depth-summary|Heatmap render:|heatmapObservationsRetained|Resting orders can be cancelled/);
});

test("heatmap rows use tuned Bookmap screen geometry and the effective display bin", async () => {
  const source = await readFile(primitivePath, "utf8");

  assert.match(
    source,
    /bookmapHeatmapCellRect\(x1,x2,Number\(y\),Number\(y2\),tuning\.minimumTimePixels,tuning\.minimumPricePixels\)/,
  );
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
    /settings\.heatmapVisible,settings\.heatmap,tuning/,
  );
});

test("retained heatmap invalidation follows tile publications rather than array length alone",async()=>{
  const primitive=await readFile(primitivePath,"utf8"),store=await readFile(storePath,"utf8");
  assert.match(primitive,/s\.heatmapRevision/);
  assert.match(store,/heatmapRevision:number/);
  assert.match(store,/next\.heatmapTiles===undefined\?this\.snapshot\.heatmapRevision:this\.snapshot\.heatmapRevision\+1/);
  assert.match(primitive,/heatmapMinimumCellWidthPx/);
  assert.match(primitive,/heatmapMinimumCellHeightPx/);
});
