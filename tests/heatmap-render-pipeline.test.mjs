import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolbarPath = new URL("../app/order-flow-toolbar.tsx", import.meta.url);
const primitivePath = new URL(
  "../app/lib/chart/dizyflow-primitive.ts",
  import.meta.url,
);

test("heatmap render pipeline is visible whenever the live heatmap is enabled", async () => {
  const source = await readFile(toolbarPath, "utf8");

  assert.match(source, /data-testid="heatmap-render-pipeline"/);
  assert.match(source, /Heatmap render:/);
  assert.match(source, /heatmapObservationsRetained/);
  assert.match(source, /heatmapCandidateCells/);
  assert.match(source, /heatmapProjectedCells/);
  assert.match(source, /heatmapCellsDrawn/);
  assert.match(source, /lastRendererError/);
  assert.match(source, /renderer\.failure/);
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
