import test from "node:test";
import assert from "node:assert/strict";
import { calculateAutoFit, calculateChartLayout, patternLabelPosition, placeChartBubbles, stackLabels } from "../app/lib/chart/chart-layout.ts";
import { DEFAULT_APPEARANCE, isHexColour, sanitiseAppearance } from "../app/lib/chart/appearance.ts";
import { sanitiseTerminalSettings } from "../app/lib/config.ts";
import { formatPriceLineTitle } from "../app/lib/market/realtime.ts";

test("reserved profile and label lanes never overlap", () => {
  const layout = calculateChartLayout({ width: 1000, height: 500, priceScaleWidth: 72, profileEnabled: true, profileWidthPct: 20, profileMaxWidth: 240, profileInset: 8, rightLabels: true });
  assert.equal(layout.rightLabels.x + layout.rightLabels.width, layout.profile.x);
  assert.equal(layout.profile.x + layout.profile.width, layout.priceScale.x);
  assert.ok(layout.profileContent.x >= layout.profile.x);
});

test("bubble collision layout clamps to the candle plot and reserved top lane", () => {
  const plot={x:12,y:0,width:240,height:180};
  const bubbles=placeChartBubbles([{id:"a",anchorX:250,anchorY:70,width:90,height:24},{id:"b",anchorX:248,anchorY:70,width:90,height:24}],plot,48);
  assert.ok(bubbles.every(b=>b.x>=plot.x&&b.x+b.width<=plot.x+plot.width&&b.y>=48));
  assert.notEqual(bubbles[0].y,bubbles[1].y);
});

test("small screens retain bounded responsive lanes", () => {
  const layout = calculateChartLayout({ width: 320, height: 300, profileEnabled: true, profileWidthPct: 30, profileMaxWidth: 320, profileInset: 20, rightLabels: true });
  assert.ok(layout.profile.width <= 320 * .36);
  assert.ok(layout.candles.width >= 0);
  assert.ok(layout.priceScale.x + layout.priceScale.width <= 320);
});

test("auto fit reserves the latest candle left of overlays", () => {
  const layout = calculateChartLayout({ width: 1000, height: 500, priceScaleWidth: 65, profileEnabled: true, profileWidthPct: 20, profileMaxWidth: 240, profileInset: 6, rightLabels: true });
  const fit = calculateAutoFit({ candleCount: 800, desiredCount: 125, barSpacing: 7, layout });
  assert.ok(fit.latestMaximumX < layout.rightLabels.x);
  assert.ok(fit.visibleCount >= 1 && fit.visibleCount <= 180);
});

test("collision layout is deterministic, separated, and clamped", () => {
  const input = [{ id: "r", y: 3 }, { id: "s", y: 5 }, { id: "x", y: 98 }];
  const first = stackLabels(input, 100, 18, 4), second = stackLabels(input, 100, 18, 4);
  assert.deepEqual(first, second);
  assert.ok(first.every(item => item.placedY >= 9 && item.placedY <= 91));
  assert.ok(Math.abs(first[1].placedY - first[0].placedY) >= 22);
});

test("pattern positions clamp to the candle plot", () => {
  const plot = { x: 10, y: 10, width: 200, height: 100 };
  for (const placement of ["above", "inside", "below", "left", "right"]) {
    const point = patternLabelPosition({ x: 190, y: 5, width: 30, height: 100 }, placement, { width: 70, height: 20 }, plot, 12);
    assert.ok(point.x >= plot.x && point.x + 70 <= plot.x + plot.width);
    assert.ok(point.y >= plot.y && point.y + 20 <= plot.y + plot.height);
  }
});

test("appearance migration deeply restores defaults and rejects invalid colours", () => {
  const migrated = sanitiseTerminalSettings({ view: { supportResistance: false, appearance: { chart: { background: "red", grid: "#123456" }, opacity: { grid: 99, labels: -4 } }, srLabelPlacement: "bad" } });
  assert.equal(migrated.view.supportResistance, false);
  assert.equal(migrated.view.appearance.chart.background, DEFAULT_APPEARANCE.chart.background);
  assert.equal(migrated.view.appearance.chart.grid, "#123456");
  assert.equal(migrated.view.appearance.chart.axisText, DEFAULT_APPEARANCE.chart.axisText);
  assert.equal(migrated.view.appearance.opacity.grid, 1);
  assert.equal(migrated.view.appearance.opacity.labels, 0);
  assert.equal(migrated.view.srLabelPlacement, "right-before-profile");
  assert.equal(isHexColour("#abcdef"), true);
  assert.equal(isHexColour("#abcd"), false);
  assert.equal(sanitiseAppearance({ preset: "unknown" }).preset, "dizy-dark");
});

test("price marker countdown title respects toggle", () => {
  assert.equal(formatPriceLineTitle(469, true), "⏱ 07:49");
  assert.equal(formatPriceLineTitle(0, true), "⏱ Closing…");
  assert.equal(formatPriceLineTitle(469, false), "");
});
