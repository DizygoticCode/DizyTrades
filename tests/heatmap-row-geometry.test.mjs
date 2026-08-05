import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {bookmapHeatmapCellRect} from "../app/lib/order-flow/heatmap.ts";
import {FlowRenderStore} from "../app/lib/order-flow/render-store.ts";
import {DEFAULT_ORDER_FLOW_SETTINGS} from "../app/lib/order-flow/settings.ts";

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

test("subpixel exchange slices become visible Bookmap cells without moving their centre",()=>{
  const rect=bookmapHeatmapCellRect(100,100.12,220,220.55);
  assert.ok(rect);
  assert.ok(rect.width>=2.5);
  assert.ok(rect.height>=3);
  assert.ok(Math.abs(rect.left+rect.width/2-100.06)<1e-9);
  assert.ok(Math.abs(rect.top+rect.height/2-220.275)<1e-9);
});

test("already visible cells are never shrunk",()=>{
  const rect=bookmapHeatmapCellRect(10,28,40,47);
  assert.ok(rect);
  assert.ok(rect.width>=18);
  assert.ok(rect.height>=7);
});

test("tile publications advance a retained-canvas revision even when cell count is unchanged",()=>{
  const store=new FlowRenderStore(DEFAULT_ORDER_FLOW_SETTINGS);
  assert.equal(store.getSnapshot().heatmapRevision,0);
  store.update({heatmapTiles:[]});
  assert.equal(store.getSnapshot().heatmapRevision,1);
  store.update({heatmapTiles:[]});
  assert.equal(store.getSnapshot().heatmapRevision,2);
  store.update({trades:[]});
  assert.equal(store.getSnapshot().heatmapRevision,2);
  store.destroy();
});
