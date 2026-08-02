import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdvancedMarketStructure,
  clusterStructureLevels,
  confirmedPivots,
  cumulativeVwap,
  utcDayStart,
  utcWeekStart,
} from "../app/lib/advanced-market-structure.ts";

const ts = value => Math.floor(Date.parse(value) / 1_000);
const bar = (time, open, high = open + 1, low = open - 1, close = open, volume = 1) => ({
  time,
  open,
  high,
  low,
  close,
  volume,
});

const currentDayStart = ts("2026-01-12T00:00:00.000Z");
const previousWeekStart = ts("2026-01-05T00:00:00.000Z");
const intraday = [
  bar(currentDayStart, 100, 102, 99, 101, 2),
  bar(currentDayStart + 900, 101, 103, 100, 102, 3),
  bar(currentDayStart + 1_800, 102, 104, 101, 103, 4),
  bar(currentDayStart + 2_700, 103, 105, 102, 104, 5),
];
const daily = Array.from({ length: 7 }, (_, index) => {
  const open = 90 + index;
  return bar(previousWeekStart + index * 86_400, open, open + 4, open - 3, open + 2, 100 + index);
});

const build = overrides => buildAdvancedMarketStructure({
  chartCandles: intraday,
  intradayCandles: intraday,
  dailyCandles: daily,
  anchorMode: "utc-day",
  openingRangeMinutes: 60,
  clusterTolerancePct: .18,
  ...overrides,
});

test("UTC day and Monday-week boundaries are deterministic", () => {
  const sunday = ts("2026-08-02T16:00:00.000Z");
  assert.equal(utcDayStart(sunday), ts("2026-08-02T00:00:00.000Z"));
  assert.equal(utcWeekStart(sunday), ts("2026-07-27T00:00:00.000Z"));
  assert.equal(utcWeekStart(ts("2026-08-03T00:00:00.000Z")), ts("2026-08-03T00:00:00.000Z"));
});

test("freshest confirmed intraday evidence defines current structure", () => {
  const staleDailyChart = [daily.at(-1)];
  const result = build({ chartCandles: staleDailyChart });
  assert.equal(result.asOfTime, currentDayStart + 2_700);
  assert.equal(result.referencePrice, 104);
  assert.equal(result.currentDay?.startTime, currentDayStart);
  assert.equal(result.currentDay?.open, 100);
  assert.equal(result.currentDay?.high, 105);
  assert.equal(result.currentDay?.low, 99);
  assert.equal(result.openingRange?.complete, true);
  assert.equal(result.previousDay?.startTime, ts("2026-01-11T00:00:00.000Z"));
  assert.equal(result.previousWeek?.startTime, previousWeekStart);
  assert.equal(result.previousWeek?.candleCount, 7);
});

test("opening range completeness requires every exact 15-minute candle", () => {
  const gapped = intraday.filter(candle => candle.time !== currentDayStart + 900);
  const result = build({ chartCandles: gapped, intradayCandles: gapped });
  assert.equal(result.openingRange?.complete, false);
  assert.ok(result.limitations.includes("The current UTC opening range is partial, gapped, or unavailable."));
  assert.equal(result.levels.find(level => level.key === "opening-high")?.complete, false);
});

test("session open is unavailable when the UTC boundary candle is missing", () => {
  const missingBoundary = intraday.slice(1);
  const result = build({ chartCandles: missingBoundary, intradayCandles: missingBoundary });
  assert.equal(result.currentDay, null);
  assert.equal(result.levels.some(level => level.key === "session-open"), false);
  assert.ok(result.limitations.some(message => message.includes("boundary candle is missing")));
});

test("previous day and week require the exact complete UTC periods", () => {
  const missingPreviousDay = daily.filter(candle => candle.time !== ts("2026-01-11T00:00:00.000Z"));
  const result = build({ dailyCandles: missingPreviousDay });
  assert.equal(result.previousDay, null);
  assert.equal(result.previousWeek, null);
  assert.ok(result.limitations.includes("The exact previous UTC-day OHLC is unavailable."));
  assert.ok(result.limitations.includes("The complete previous UTC-week OHLC is unavailable."));
});

test("cumulative VWAP uses only positive-volume candles at or after its anchor", () => {
  const candles = [
    bar(0, 10, 10, 10, 10, 1),
    bar(900, 20, 20, 20, 20, 3),
    bar(1_800, 30, 30, 30, 30, 0),
  ];
  const all = cumulativeVwap(candles, 0);
  assert.equal(all.sampleCount, 2);
  assert.equal(all.volume, 4);
  assert.equal(all.value, 17.5);
  assert.deepEqual(all.series.map(point => point.value), [10, 17.5]);
  const anchored = cumulativeVwap(candles, 900);
  assert.equal(anchored.sampleCount, 1);
  assert.equal(anchored.value, 20);
});

test("future custom anchors remain explicitly unavailable", () => {
  const result = build({ anchorMode: "custom", customAnchorTime: currentDayStart + 86_400 });
  assert.equal(result.anchoredVwap.available, false);
  assert.equal(result.anchoredVwap.sampleCount, 0);
  assert.equal(result.anchoredVwap.reason, "No positive-volume closed candles exist after the selected anchor.");
});

test("pivots require the configured right wing and never confirm the final bars", () => {
  const highs = [1, 2, 3, 6, 3, 2, 5, 3, 2, 1, 10];
  const candles = highs.map((high, index) => bar(index * 900, high - 1, high, high - 2, high - 1));
  const pivots = confirmedPivots(candles, 2).filter(pivot => pivot.type === "high");
  assert.deepEqual(pivots.map(pivot => pivot.index), [3, 6]);
  assert.equal(pivots.some(pivot => pivot.index === 10), false);
});

test("level clusters are deterministic, bounded and reference-relative", () => {
  const levels = [
    { key: "a", label: "A", price: 100, kind: "session", complete: true, distancePct: null },
    { key: "b", label: "B", price: 100.1, kind: "previous-day", complete: true, distancePct: null },
    { key: "c", label: "C", price: 103, kind: "swing", complete: true, distancePct: null },
  ];
  const clusters = clusterStructureLevels(levels, 100.05, .2);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].levelKeys, ["a", "b"]);
  assert.equal(clusters[0].price, 100.05);
  assert.equal(clusters[0].distancePct, 0);
});
