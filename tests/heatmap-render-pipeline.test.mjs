import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolbarPath = new URL("../app/order-flow-toolbar.tsx", import.meta.url);
const primitivePath = new URL(
  "../app/lib/chart/dizyflow-primitive.ts",
  import.meta.url,
);
const storePath = new URL(
  "../app/lib/order-flow/render-store.ts",
  import.meta.url,
);

test("toolbar keeps heatmap and depth analysis out of its compact control row", async () => {
  const source = await readFile(toolbarPath, "utf8");
  assert.match(source, /\["marketDepthVisible", "Market Depth"\]/);
  assert.match(source, /dizyflow-brain-open/);
  assert.doesNotMatch(
    source,
    /market-depth-summary|Heatmap render:|heatmapObservationsRetained|Resting orders can be cancelled/,
  );
});

test("heatmap rows use tuned Bookmap screen geometry and the effective display bin", async () => {
  const source = await readFile(primitivePath, "utf8");

  assert.match(
    source,
    /bookmapHeatmapCellRect\(\s*x1,\s*x2,\s*Number\(y1\),\s*Number\(y2\),\s*tuning\.minimumTimePixels,\s*tuning\.minimumPricePixels,/,
  );
  assert.match(
    source,
    /priceToCoordinate\(segment\.price \+ displayStep\)/,
  );
  assert.doesNotMatch(
    source,
    /priceToCoordinate\(segment\.price \+ snapshot\.priceStep\)/,
  );
  assert.match(
    source,
    /settings\.heatmapVisible,\s*settings\.heatmap,\s*tuning/,
  );
  assert.match(source, /const overlapX = Math\.min\(1\.25/);
  assert.match(source, /bid \+ ask/);
});

test("heatmap and market depth stay below candles while executions paint above them", async () => {
  const source = await readFile(primitivePath, "utf8");
  assert.match(
    source,
    /new FlowPaneView\(this, "background", "bottom"\)/,
  );
  assert.match(
    source,
    /new FlowPaneView\(this, "foreground", "top"\)/,
  );
  assert.match(
    source,
    /if \(layer === "foreground"\) \{\s*this\.paintBubbles/s,
  );
  assert.match(source, /this\.paintHeatmap\(context/);
  assert.match(source, /this\.paintMarketDepth\(context/);
});

test("retained heatmap invalidation follows tile publications rather than array length alone", async () => {
  const primitive = await readFile(primitivePath, "utf8");
  const store = await readFile(storePath, "utf8");
  assert.match(primitive, /snapshot\.heatmapRevision/);
  assert.match(store, /heatmapRevision:number/);
  assert.match(
    store,
    /next\.heatmapTiles===undefined\?this\.snapshot\.heatmapRevision:this\.snapshot\.heatmapRevision\+1/,
  );
  assert.match(primitive, /heatmapMinimumCellWidthPx/);
  assert.match(primitive, /heatmapMinimumCellHeightPx/);
});
