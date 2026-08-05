import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {bookmapHeatmapCellRect,DEFAULT_HEATMAP_DISPLAY_TUNING,heatmapColour,sanitiseHeatmapDisplayTuning} from "../app/lib/order-flow/heatmap.ts";
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

test("subpixel exchange slices use the larger Bookmap defaults without moving their centre",()=>{
  const rect=bookmapHeatmapCellRect(100,100.12,220,220.55);
  assert.ok(rect);
  assert.ok(rect.width>=DEFAULT_HEATMAP_DISPLAY_TUNING.minimumTimePixels);
  assert.ok(rect.height>=DEFAULT_HEATMAP_DISPLAY_TUNING.minimumPricePixels);
  assert.ok(Math.abs(rect.left+rect.width/2-100.06)<1e-9);
  assert.ok(Math.abs(rect.top+rect.height/2-220.275)<1e-9);
});

test("display tuning can enlarge cells while retaining their projected centre",()=>{
  const rect=bookmapHeatmapCellRect(20,20.1,40,40.2,12,14);
  assert.ok(rect);
  assert.equal(rect.width,12);
  assert.equal(rect.height,14);
  assert.ok(Math.abs(rect.left+rect.width/2-20.05)<1e-9);
  assert.ok(Math.abs(rect.top+rect.height/2-40.1)<1e-9);
});

test("already visible cells are never shrunk",()=>{
  const rect=bookmapHeatmapCellRect(10,28,40,47);
  assert.ok(rect);
  assert.ok(rect.width>=18);
  assert.ok(rect.height>=7);
});

test("heatmap display tuning is bounded and palette presets are distinct",()=>{
  const value=sanitiseHeatmapDisplayTuning({palette:"thermal",minimumTimePixels:99,minimumPricePixels:1,timeSliceMs:30000,priceGrouping:"manual",manualPriceStep:50});
  assert.equal(value.palette,"thermal");
  assert.equal(value.minimumTimePixels,24);
  assert.equal(value.minimumPricePixels,3);
  assert.equal(value.timeSliceMs,30000);
  assert.equal(value.priceGrouping,"manual");
  assert.equal(value.manualPriceStep,50);
  assert.notEqual(heatmapColour(.7,"bookmap"),heatmapColour(.7,"thermal"));
  assert.notEqual(heatmapColour(.7,"bookmap"),heatmapColour(.7,"ocean"));
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
