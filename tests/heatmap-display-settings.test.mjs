import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {DEFAULT_HEATMAP_DISPLAY_TUNING,HEATMAP_DISPLAY_STORAGE_KEY,readHeatmapDisplayTuning,writeHeatmapDisplayTuning} from "../app/lib/order-flow/heatmap.ts";

const portalPath=new URL("../app/heatmap-settings-portal.tsx",import.meta.url),layoutPath=new URL("../app/layout.tsx",import.meta.url),primitivePath=new URL("../app/lib/chart/dizyflow-primitive.ts",import.meta.url);

test("general settings mount the complete heatmap display controls",async()=>{
 const [portal,layout,primitive]=await Promise.all([readFile(portalPath,"utf8"),readFile(layoutPath,"utf8"),readFile(primitivePath,"utf8")]);
 assert.match(layout,/HeatmapSettingsPortal/);
 assert.match(layout,/heatmap-settings\.css/);
 for(const label of ["Colour palette","Band height","Minimum slice width","Time-slice aggregation","Price grouping","Manual grouping step"])assert.match(portal,new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
 assert.match(portal,/Bookmap/);
 assert.match(portal,/Thermal/);
 assert.match(portal,/Ocean/);
 assert.match(primitive,/HEATMAP_DISPLAY_EVENT/);
 assert.match(primitive,/tuning\.minimumTimePixels,tuning\.minimumPricePixels/);
 assert.match(primitive,/effectiveTimeBucketMs:effectiveTimeSlice/);
 assert.match(primitive,/heatmapColour\(Math\.max\(\.14,normal\),tuning\.palette\)/);
});

test("heatmap display tuning persists as one bounded browser setting",()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const saved=writeHeatmapDisplayTuning({palette:"ocean",minimumTimePixels:9,minimumPricePixels:11,timeSliceMs:30000,priceGrouping:"manual",manualPriceStep:25},storage);
 assert.equal(values.has(HEATMAP_DISPLAY_STORAGE_KEY),true);
 assert.deepEqual(readHeatmapDisplayTuning(storage),saved);
 assert.equal(saved.palette,"ocean");
 assert.equal(saved.minimumTimePixels,9);
 assert.equal(saved.minimumPricePixels,11);
 assert.equal(saved.timeSliceMs,30000);
 assert.equal(saved.manualPriceStep,25);
 assert.equal(DEFAULT_HEATMAP_DISPLAY_TUNING.minimumPricePixels,7);
 assert.equal(DEFAULT_HEATMAP_DISPLAY_TUNING.minimumTimePixels,6);
});
