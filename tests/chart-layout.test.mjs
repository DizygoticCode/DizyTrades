import test from "node:test";
import assert from "node:assert/strict";
import { calculateAutoFit, calculateChartLayout, calculateGoToLive, calculateHorizontalLineExtent, channelFillPolygon, clipLineToRect, extendLineToPlot, calculateProfileRowGeometry, patternLabelPosition, placeChartBubbles, stackLabels } from "../app/lib/chart/chart-layout.ts";
import { ALL_TIMEFRAMES, PROFILE_BAR_PRESETS, profileBarPreset } from "../app/lib/chart/toolbar.ts";
import { DEFAULT_APPEARANCE, isHexColour, sanitiseAppearance } from "../app/lib/chart/appearance.ts";
import { sanitiseTerminalSettings } from "../app/lib/config.ts";
import { formatPriceLineTitle } from "../app/lib/market/realtime.ts";

test("reserved profile and label lanes never overlap", () => {
  const layout = calculateChartLayout({ width: 1000, height: 500, priceScaleWidth: 72, profileEnabled: true, profileWidthPct: 20, profileMaxWidth: 240, profileInset: 8, rightLabels: true });
  assert.equal(layout.rightLabels.x + layout.rightLabels.width, layout.profile.x);
  assert.equal(layout.profile.x + layout.profile.width, layout.priceScale.x);
  assert.ok(layout.profileContent.x >= layout.profile.x);
});

test("bubble collision layout keeps anchor x and respects the reserved top lane", () => {
  const plot={x:12,y:0,width:240,height:180};
  const bubbles=placeChartBubbles([{id:"a",anchorX:250,anchorY:70,width:90,height:24},{id:"b",anchorX:248,anchorY:70,width:90,height:24}],plot,48);
  assert.equal(bubbles.length,2);
  assert.ok(bubbles.every(b=>b.x===b.anchorX-b.width/2&&b.y>=48));
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

test("toolbar exposes every timeframe in order and preserves minute/month case", () => {
  assert.deepEqual(ALL_TIMEFRAMES, ["1m", "5m", "15m", "30m", "1h", "4h", "8h", "1d", "1w", "1M"]);
  assert.notEqual(ALL_TIMEFRAMES[0], ALL_TIMEFRAMES.at(-1));
});

test("go to live preserves zoom span and reserved overlay space", () => {
  const layout = calculateChartLayout({ width: 1000, height: 500, priceScaleWidth: 65, profileEnabled: true, profileWidthPct: 20, profileMaxWidth: 240, profileInset: 6, rightLabels: true });
  const live = calculateGoToLive({ candleCount: 800, currentRange: { from: 620.5, to: 700.5 }, barSpacing: 7, layout });
  assert.equal(live.to - live.from, 80);
  assert.ok(live.reservedBars > 2);
  assert.ok(live.to > 799);
});

test("volume profile settings migrate, default, clamp, and map presets", () => {
  assert.equal(sanitiseTerminalSettings({ view: { volumeRows: 80 } }).view.volumeRows, 80);
  assert.equal(sanitiseTerminalSettings({ view: {} }).view.volumeRows, 64);
  assert.equal(sanitiseTerminalSettings({ view: { volumeRows: 2 } }).view.volumeRows, 12);
  assert.equal(sanitiseTerminalSettings({ view: { volumeRows: 999 } }).view.volumeRows, 240);
  assert.deepEqual(PROFILE_BAR_PRESETS, { Large: 24, Medium: 48, Small: 80, "Very small": 120 });
  assert.equal(profileBarPreset(48), "Medium");
  assert.equal(profileBarPreset(64), "Custom");
});

test("dense profile geometry remains finite, positive, and non-overlapping", () => {
  for (const rows of [24, 64, 120, 240]) {
    const extent = 400 / rows;
    const row = calculateProfileRowGeometry(100, 100 + extent, rows);
    assert.ok(Number.isFinite(row.y) && Number.isFinite(row.height));
    assert.ok(row.height > 0 && row.height <= extent + 1e-9);
    assert.ok(row.y + row.height <= 100 + extent + 1e-9);
  }
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

import { calculateFibLabelLayout } from "../app/lib/chart/chart-layout.ts";

test("Fibonacci labels are bounded rounded-box geometry with ratio-only text", () => {
  const plot = { x: 12, y: 0, width: 400, height: 260 };
  const labels = calculateFibLabelLayout({
    levels: [
      { ratio: 0, label: "FIB 0", lineY: 60, textWidth: 32 },
      { ratio: .5, label: "FIB 0.5", lineY: 61, textWidth: 42 },
      { ratio: .618, label: "FIB 0.618", lineY: 62, textWidth: 52 },
    ],
    placement: "left-edge", plot, leftX: 12, rightBoundary: 390, latestX: 250,
    offset: 10, labelHeight: 20, horizontalPadding: 7, top: 44, bottom: 236, gap: 3,
  });
  assert.ok(labels.every(label => label.width > 0 && label.height > 0));
  assert.ok(labels.every(label => label.x >= plot.x && label.x + label.width <= plot.x + plot.width));
  assert.ok(labels.every(label => /^FIB (0|0\.5|0\.618)$/.test(label.text)));
  assert.ok(labels.every((label, index) => index === 0 || label.y >= labels[index - 1].y + labels[index - 1].height + 3));
  assert.ok(labels.some(label => label.connector));
  assert.equal(labels.find(label => label.ratio === .5).emphasis, 1);
  assert.equal(labels.find(label => label.ratio === .618).emphasis, 2);
  assert.deepEqual(labels.map(label => label.id), ["fib-0", "fib-500", "fib-618"]);
});

test("old appearances gain Fib box defaults while custom Fib colours survive", () => {
  const migrated = sanitiseAppearance({ structure: { fibonacciLine: "#123456", fibonacciText: "#abcdef", fibonacciLabelBorder: "invalid" } });
  assert.equal(migrated.structure.fibonacciLine, "#123456");
  assert.equal(migrated.structure.fibonacciText, "#abcdef");
  assert.equal(migrated.structure.fibonacciLabelBackground, "#5A3A0B");
  assert.equal(migrated.structure.fibonacciLabelBorder, "#FFC75E");
});

test("anchored line extension modes use and respect the safe plot",()=>{const plot={x:10,y:10,width:100,height:80},anchors=[{x:30,y:70},{x:70,y:30}];assert.deepEqual(extendLineToPlot(anchors,plot,"none"),{start:anchors[0],end:anchors[1]});assert.equal(extendLineToPlot(anchors,plot,"left").start.x,10);assert.equal(extendLineToPlot(anchors,plot,"right").end.x,90);const both=extendLineToPlot(anchors,plot,"both");assert.equal(both.start.x,10);assert.equal(both.end.x,90);for(const point of [both.start,both.end])assert.ok(point.x<=110&&point.y<=90);});
test("line clipping handles rising falling horizontal vertical and degenerate input",()=>{const plot={x:0,y:0,width:50,height:50};for(const anchors of [[{x:-10,y:40},{x:60,y:10}],[{x:-10,y:10},{x:60,y:40}],[{x:-10,y:25},{x:60,y:25}],[{x:25,y:-10},{x:25,y:60}],[{x:20,y:20},{x:20,y:20}]]){const line=extendLineToPlot(anchors,plot,"both");assert.ok(line);for(const value of [line.start.x,line.start.y,line.end.x,line.end.y])assert.ok(Number.isFinite(value));}assert.equal(clipLineToRect({x:Number.NaN,y:0},{x:2,y:2},plot),null);});
test("horizontal extents never enter the reserved profile lane",()=>{const safe={x:12,y:0,width:500,height:300};assert.deepEqual(calculateHorizontalLineExtent(100,200,safe,"both"),{startX:12,endX:512});assert.ok(calculateHorizontalLineExtent(100,900,safe,"right").endX<=512);});
test("channel polygon follows parallel boundaries",()=>{const upper=extendLineToPlot([{x:20,y:20},{x:60,y:30}],{x:0,y:0,width:100,height:100},"right"),lower=extendLineToPlot([{x:20,y:40},{x:60,y:50}],{x:0,y:0,width:100,height:100},"right");assert.ok(upper&&lower);assert.equal((upper.end.y-upper.start.y)/(upper.end.x-upper.start.x),(lower.end.y-lower.start.y)/(lower.end.x-lower.start.x));const polygon=channelFillPolygon(upper,lower);assert.equal(polygon.length,4);assert.ok(polygon[0].y<polygon[3].y&&polygon[1].y<polygon[2].y);});
test("line visual settings migrate and clamp safely",()=>{const view=sanitiseTerminalSettings({view:{srLineExtension:"bad",fibLineExtension:"left",pivotTrendlineWidth:99,lrBoundaryWidth:0,lrChannelFillOpacity:1}}).view;assert.equal(view.srLineExtension,"both");assert.equal(view.fibLineExtension,"left");assert.equal(view.pivotTrendlineWidth,5);assert.equal(view.lrBoundaryWidth,1);assert.equal(view.lrChannelFillOpacity,.4);});
test("legacy regression colour seeds new channel colours",()=>{const migrated=sanitiseAppearance({indicators:{regression:"#123456"}});assert.equal(migrated.indicators.regressionBasis,"#123456");assert.equal(migrated.indicators.regressionUpper,"#123456");assert.equal(migrated.indicators.regressionLower,"#123456");});
test("global and manual extension settings migrate without changing individual categories",()=>{const view=sanitiseTerminalSettings({view:{globalLineExtensionOverride:"both",fadeExtendedPortions:false,manualRayExtension:"left",srLineExtension:"none",fibLineExtension:"right"}}).view;assert.equal(view.globalLineExtensionOverride,"both");assert.equal(view.fadeExtendedPortions,false);assert.equal(view.manualRayExtension,"left");assert.equal(view.srLineExtension,"none");assert.equal(view.fibLineExtension,"right");const restored=sanitiseTerminalSettings({view:{...view,globalLineExtensionOverride:"individual"}}).view;assert.equal(restored.srLineExtension,"none");assert.equal(restored.fibLineExtension,"right")});

test("event bubbles discard off-screen anchors without edge stacking", () => {
  const plot={x:10,y:0,width:200,height:300};
  const result=placeChartBubbles([{id:"old",anchorX:-500,anchorY:100,width:40,height:20},{id:"visible",anchorX:80,anchorY:100,width:40,height:20}],plot);
  assert.deepEqual(result.map(item=>item.id),["visible"]);
  assert.equal(result[0].x,60);
});

test("bubble lanes remain vertical and deterministic", () => {
  const plot={x:0,y:0,width:300,height:300},items=[{id:"b",anchorX:100,anchorY:150,width:50,height:20},{id:"a",anchorX:100,anchorY:150,width:50,height:20}];
  const result=placeChartBubbles(items,plot,0);
  assert.deepEqual(result.map(item=>item.id),["a","b"]);
  assert.ok(result.every(item=>item.x===75));
});
