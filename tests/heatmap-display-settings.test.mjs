import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_HEATMAP_DISPLAY_TUNING,
  HEATMAP_DISPLAY_STORAGE_KEY,
  expandHeatmapDetectionRange,
  readHeatmapDisplayTuning,
  writeHeatmapDisplayTuning,
} from "../app/lib/order-flow/heatmap.ts";

const portalPath = new URL(
  "../app/heatmap-settings-portal.tsx",
  import.meta.url,
);
const layoutPath = new URL("../app/layout.tsx", import.meta.url);
const primitivePath = new URL(
  "../app/lib/chart/dizyflow-primitive.ts",
  import.meta.url,
);
const cachePath = new URL(
  "../app/lib/order-flow/liquidity-history-cache.ts",
  import.meta.url,
);

test("general settings mount the complete heatmap display controls", async () => {
  const [portal, layout, primitive, cache] = await Promise.all([
    readFile(portalPath, "utf8"),
    readFile(layoutPath, "utf8"),
    readFile(primitivePath, "utf8"),
    readFile(cachePath, "utf8"),
  ]);
  assert.match(layout, /HeatmapSettingsPortal/);
  assert.match(layout, /heatmap-settings\.css/);
  for (const label of [
    "Colour palette",
    "Band height",
    "Minimum slice width",
    "Time-slice aggregation",
    "Detection range",
    "Price grouping",
    "Manual grouping step",
  ])
    assert.match(
      portal,
      new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  assert.match(portal, /Bookmap/);
  assert.match(portal, /Thermal/);
  assert.match(portal, /Ocean/);
  assert.match(portal, /±10%/);
  assert.match(primitive, /HEATMAP_DISPLAY_EVENT/);
  assert.match(
    primitive,
    /tuning\.minimumTimePixels,\s*tuning\.minimumPricePixels/,
  );
  assert.match(primitive, /effectiveTimeBucketMs:\s*effectiveTimeSlice/);
  assert.match(
    primitive,
    /heatmapColour\(Math\.max\(0\.18,\s*normal\),\s*tuning\.palette\)/,
  );
  assert.match(
    cache,
    /expandHeatmapDetectionRange\(\s*view\.minPrice,\s*view\.maxPrice,\s*tuning\.detectionRangeBps\s*\)/,
  );
});

test("heatmap display tuning persists as one bounded browser setting", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const saved = writeHeatmapDisplayTuning(
    {
      palette: "ocean",
      minimumTimePixels: 9,
      minimumPricePixels: 11,
      timeSliceMs: 30000,
      detectionRangeBps: 1000,
      priceGrouping: "manual",
      manualPriceStep: 25,
    },
    storage,
  );
  assert.equal(values.has(HEATMAP_DISPLAY_STORAGE_KEY), true);
  assert.deepEqual(readHeatmapDisplayTuning(storage), saved);
  assert.equal(saved.palette, "ocean");
  assert.equal(saved.minimumTimePixels, 9);
  assert.equal(saved.minimumPricePixels, 11);
  assert.equal(saved.timeSliceMs, 30000);
  assert.equal(saved.detectionRangeBps, 1000);
  assert.equal(saved.manualPriceStep, 25);
  assert.equal(DEFAULT_HEATMAP_DISPLAY_TUNING.minimumPricePixels, 8);
  assert.equal(DEFAULT_HEATMAP_DISPLAY_TUNING.minimumTimePixels, 8);
  assert.equal(DEFAULT_HEATMAP_DISPLAY_TUNING.detectionRangeBps, 500);
});

test("heatmap detection range expands around market without shrinking the visible chart", () => {
  const wide = expandHeatmapDetectionRange(63_000, 65_000, 500);
  assert.equal(wide.minPrice, 60_800);
  assert.equal(wide.maxPrice, 67_200);
  const alreadyWide = expandHeatmapDetectionRange(50_000, 78_000, 100);
  assert.deepEqual(alreadyWide, { minPrice: 50_000, maxPrice: 78_000 });
});
