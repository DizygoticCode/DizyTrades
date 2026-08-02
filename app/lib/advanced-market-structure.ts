import type { Candle } from "./strategy";

export type VwapAnchorMode = "utc-day" | "utc-week" | "swing-high" | "swing-low" | "custom";
export type StructureLevelKind = "session" | "opening-range" | "previous-day" | "previous-week" | "vwap" | "swing";

export type StructureLevel = Readonly<{
  key: string;
  label: string;
  price: number;
  kind: StructureLevelKind;
  complete: boolean;
  distancePct: number | null;
}>;

export type VwapPoint = Readonly<{ time: number; value: number }>;
export type PivotPoint = Readonly<{ time: number; price: number; type: "high" | "low"; index: number }>;
export type StructureCluster = Readonly<{
  key: string;
  price: number;
  labels: readonly string[];
  levelKeys: readonly string[];
  distancePct: number | null;
}>;

export type AdvancedMarketStructure = Readonly<{
  asOfTime: number | null;
  referencePrice: number | null;
  sessionConvention: "UTC-00:00";
  currentDay: Readonly<{ startTime: number; open: number; high: number; low: number; close: number; candleCount: number }> | null;
  openingRange: Readonly<{ startTime: number; endTime: number; high: number; low: number; candleCount: number; complete: boolean }> | null;
  currentWeek: Readonly<{ startTime: number; open: number; high: number; low: number; close: number; candleCount: number }> | null;
  previousDay: Readonly<{ startTime: number; open: number; high: number; low: number; close: number }> | null;
  previousWeek: Readonly<{ startTime: number; endTime: number; open: number; high: number; low: number; close: number; candleCount: number }> | null;
  anchoredVwap: Readonly<{
    mode: VwapAnchorMode;
    label: string;
    anchorTime: number | null;
    value: number | null;
    sampleCount: number;
    volume: number;
    series: readonly VwapPoint[];
    available: boolean;
    reason: string | null;
  }>;
  swing: Readonly<{
    lastHigh: PivotPoint | null;
    lastLow: PivotPoint | null;
    highSequence: "HH" | "LH" | null;
    lowSequence: "HL" | "LL" | null;
    state: "bullish-expansion" | "bearish-expansion" | "transition" | "unavailable";
    pivots: readonly PivotPoint[];
  }>;
  levels: readonly StructureLevel[];
  clusters: readonly StructureCluster[];
  limitations: readonly string[];
}>;

const DAY = 86_400;
const FIFTEEN_MINUTES = 900;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const cleanCandles = (candles: readonly Candle[]) =>
  [...new Map(
    candles
      .filter(candle =>
        finite(candle.time) && finite(candle.open) && finite(candle.high) && finite(candle.low) &&
        finite(candle.close) && candle.high >= candle.low,
      )
      .map(candle => [candle.time, candle] as const),
  ).values()].sort((a, b) => a.time - b.time);

export const utcDayStart = (time: number) => Math.floor(time / DAY) * DAY;
export const utcWeekStart = (time: number) => {
  const date = new Date(time * 1_000);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return utcDayStart(time) - daysSinceMonday * DAY;
};

const aggregate = (candles: readonly Candle[], start: number, end: number) => {
  const selected = candles.filter(candle => candle.time >= start && candle.time < end);
  if (!selected.length) return null;
  return Object.freeze({
    startTime: start,
    open: selected[0].open,
    high: Math.max(...selected.map(candle => candle.high)),
    low: Math.min(...selected.map(candle => candle.low)),
    close: selected.at(-1)!.close,
    candleCount: selected.length,
  });
};

const aggregateFromBoundary = (candles: readonly Candle[], start: number, end: number) => {
  if (!candles.some(candle => candle.time === start)) return null;
  return aggregate(candles, start, end);
};

const hasExactRange = (candles: readonly Candle[], start: number, end: number, step: number) => {
  const times = new Set(candles.map(candle => candle.time));
  for (let time = start; time < end; time += step) if (!times.has(time)) return false;
  return true;
};

const distance = (price: number, reference: number | null) =>
  reference !== null && reference !== 0 && finite(reference) ? (price - reference) / reference * 100 : null;

export function confirmedPivots(candles: readonly Candle[], wing = 3): PivotPoint[] {
  const source = cleanCandles(candles);
  const size = Math.max(1, Math.min(10, Math.floor(wing)));
  const result: PivotPoint[] = [];
  for (let index = size; index < source.length - size; index++) {
    const candle = source[index];
    const left = source.slice(index - size, index);
    const right = source.slice(index + 1, index + size + 1);
    const high = left.every(item => candle.high > item.high) && right.every(item => candle.high >= item.high);
    const low = left.every(item => candle.low < item.low) && right.every(item => candle.low <= item.low);
    if (high) result.push(Object.freeze({ time: candle.time, price: candle.high, type: "high", index }));
    if (low) result.push(Object.freeze({ time: candle.time, price: candle.low, type: "low", index }));
  }
  return result.sort((a, b) => a.time - b.time || a.type.localeCompare(b.type)).slice(-40);
}

export function swingStructure(candles: readonly Candle[]): AdvancedMarketStructure["swing"] {
  const pivots = confirmedPivots(candles);
  const highs = pivots.filter(pivot => pivot.type === "high");
  const lows = pivots.filter(pivot => pivot.type === "low");
  const lastHigh = highs.at(-1) ?? null;
  const lastLow = lows.at(-1) ?? null;
  const highSequence = highs.length >= 2 ? (highs.at(-1)!.price > highs.at(-2)!.price ? "HH" : "LH") : null;
  const lowSequence = lows.length >= 2 ? (lows.at(-1)!.price > lows.at(-2)!.price ? "HL" : "LL") : null;
  const state = highSequence === "HH" && lowSequence === "HL"
    ? "bullish-expansion"
    : highSequence === "LH" && lowSequence === "LL"
      ? "bearish-expansion"
      : highSequence && lowSequence
        ? "transition"
        : "unavailable";
  return Object.freeze({ lastHigh, lastLow, highSequence, lowSequence, state, pivots: Object.freeze(pivots) });
}

export function cumulativeVwap(
  candles: readonly Candle[],
  anchorTime: number | null,
): Readonly<{ series: readonly VwapPoint[]; value: number | null; sampleCount: number; volume: number }> {
  if (anchorTime === null) return Object.freeze({ series: Object.freeze([]), value: null, sampleCount: 0, volume: 0 });
  let weighted = 0;
  let volume = 0;
  let sampleCount = 0;
  const series: VwapPoint[] = [];
  for (const candle of cleanCandles(candles)) {
    if (candle.time < anchorTime || !finite(candle.volume) || candle.volume <= 0) continue;
    const typical = (candle.high + candle.low + candle.close) / 3;
    weighted += typical * candle.volume;
    volume += candle.volume;
    sampleCount++;
    series.push(Object.freeze({ time: candle.time, value: weighted / volume }));
  }
  return Object.freeze({ series: Object.freeze(series), value: series.at(-1)?.value ?? null, sampleCount, volume });
}

export function clusterStructureLevels(
  levels: readonly StructureLevel[],
  referencePrice: number | null,
  tolerancePct = .18,
): StructureCluster[] {
  const tolerance = Math.max(.01, Math.min(2, tolerancePct));
  const ordered = levels.filter(level => finite(level.price) && level.price > 0).sort((a, b) => a.price - b.price);
  const groups: StructureLevel[][] = [];
  for (const level of ordered) {
    const group = groups.at(-1);
    const mean = group ? group.reduce((sum, item) => sum + item.price, 0) / group.length : null;
    if (group && mean !== null && Math.abs(level.price - mean) / mean * 100 <= tolerance) group.push(level);
    else groups.push([level]);
  }
  return groups
    .filter(group => group.length >= 2)
    .map(group => {
      const price = group.reduce((sum, item) => sum + item.price, 0) / group.length;
      const keys = group.map(item => item.key).sort();
      return Object.freeze({
        key: keys.join("|"),
        price,
        labels: Object.freeze(group.map(item => item.label)),
        levelKeys: Object.freeze(keys),
        distancePct: distance(price, referencePrice),
      });
    })
    .sort((a, b) => Math.abs(a.distancePct ?? Infinity) - Math.abs(b.distancePct ?? Infinity) || a.price - b.price);
}

export function buildAdvancedMarketStructure(input: Readonly<{
  chartCandles: readonly Candle[];
  intradayCandles: readonly Candle[];
  dailyCandles: readonly Candle[];
  anchorMode: VwapAnchorMode;
  customAnchorTime?: number | null;
  openingRangeMinutes?: number;
  clusterTolerancePct?: number;
}>): AdvancedMarketStructure {
  const chart = cleanCandles(input.chartCandles);
  const intraday = cleanCandles(input.intradayCandles);
  const daily = cleanCandles(input.dailyCandles);
  const freshest = [chart.at(-1), intraday.at(-1), daily.at(-1)]
    .filter((candle): candle is Candle => Boolean(candle))
    .sort((a, b) => b.time - a.time)[0] ?? null;
  const asOfTime = freshest?.time ?? null;
  const referencePrice = freshest?.close ?? null;
  const limitations: string[] = [];
  if (asOfTime === null || referencePrice === null) limitations.push("Confirmed candle history is unavailable.");

  const dayStart = asOfTime === null ? 0 : utcDayStart(asOfTime);
  const weekStart = asOfTime === null ? 0 : utcWeekStart(asOfTime);
  const currentDay = asOfTime === null ? null : aggregateFromBoundary(intraday, dayStart, dayStart + DAY);
  const currentWeek = asOfTime === null ? null : aggregateFromBoundary(intraday, weekStart, weekStart + 7 * DAY);

  const openingMinutes = Math.max(15, Math.min(240, Math.round((input.openingRangeMinutes ?? 60) / 15) * 15));
  const openingEnd = dayStart + openingMinutes * 60;
  const opening = asOfTime === null ? null : aggregate(intraday, dayStart, openingEnd);
  const openingComplete = asOfTime !== null && asOfTime >= openingEnd - FIFTEEN_MINUTES &&
    hasExactRange(intraday, dayStart, openingEnd, FIFTEEN_MINUTES);
  const openingRange = opening
    ? Object.freeze({ ...opening, endTime: openingEnd, complete: openingComplete })
    : null;

  const previousDayStart = dayStart - DAY;
  const priorDaily = asOfTime === null ? null : daily.find(candle => candle.time === previousDayStart) ?? null;
  const previousDay = priorDaily
    ? Object.freeze({
        startTime: previousDayStart,
        open: priorDaily.open,
        high: priorDaily.high,
        low: priorDaily.low,
        close: priorDaily.close,
      })
    : null;

  const previousWeekStart = weekStart - 7 * DAY;
  const completePreviousWeek = asOfTime !== null && hasExactRange(daily, previousWeekStart, weekStart, DAY);
  const priorWeek = completePreviousWeek ? aggregate(daily, previousWeekStart, weekStart) : null;
  const previousWeek = priorWeek ? Object.freeze({ ...priorWeek, endTime: weekStart }) : null;

  const swing = swingStructure(chart);
  const anchorMode = input.anchorMode;
  const anchorTime = anchorMode === "utc-day"
    ? (asOfTime === null ? null : dayStart)
    : anchorMode === "utc-week"
      ? (asOfTime === null ? null : weekStart)
      : anchorMode === "swing-high"
        ? swing.lastHigh?.time ?? null
        : anchorMode === "swing-low"
          ? swing.lastLow?.time ?? null
          : finite(input.customAnchorTime)
            ? input.customAnchorTime!
            : null;
  const anchorLabel = anchorMode === "utc-day"
    ? "UTC day VWAP"
    : anchorMode === "utc-week"
      ? "UTC week VWAP"
      : anchorMode === "swing-high"
        ? "Latest confirmed swing-high VWAP"
        : anchorMode === "swing-low"
          ? "Latest confirmed swing-low VWAP"
          : "Custom anchored VWAP";
  const vwap = cumulativeVwap(chart, anchorTime);
  const anchoredVwap = Object.freeze({
    mode: anchorMode,
    label: anchorLabel,
    anchorTime,
    value: vwap.value,
    sampleCount: vwap.sampleCount,
    volume: vwap.volume,
    series: vwap.series,
    available: vwap.value !== null,
    reason: anchorTime === null
      ? "The selected anchor is unavailable."
      : vwap.value === null
        ? "No positive-volume closed candles exist after the selected anchor."
        : null,
  });

  if (!anchoredVwap.available) limitations.push(anchoredVwap.reason!);
  if (!currentDay) limitations.push("Current UTC-day levels are unavailable because the boundary candle is missing.");
  if (!previousDay) limitations.push("The exact previous UTC-day OHLC is unavailable.");
  if (!previousWeek) limitations.push("The complete previous UTC-week OHLC is unavailable.");
  if (!openingRange?.complete) limitations.push("The current UTC opening range is partial, gapped, or unavailable.");

  const level = (
    key: string,
    label: string,
    price: number | undefined,
    kind: StructureLevelKind,
    complete = true,
  ): StructureLevel | null => finite(price)
    ? Object.freeze({ key, label, price, kind, complete, distancePct: distance(price, referencePrice) })
    : null;
  const levels = [
    level("session-open", "UTC session open", currentDay?.open, "session"),
    level("session-high", "UTC session high", currentDay?.high, "session"),
    level("session-low", "UTC session low", currentDay?.low, "session"),
    level("opening-high", `${openingMinutes}m opening-range high`, openingRange?.high, "opening-range", openingRange?.complete ?? false),
    level("opening-low", `${openingMinutes}m opening-range low`, openingRange?.low, "opening-range", openingRange?.complete ?? false),
    level("previous-day-high", "Previous UTC day high", previousDay?.high, "previous-day"),
    level("previous-day-low", "Previous UTC day low", previousDay?.low, "previous-day"),
    level("previous-day-close", "Previous UTC day close", previousDay?.close, "previous-day"),
    level("previous-week-high", "Previous UTC week high", previousWeek?.high, "previous-week"),
    level("previous-week-low", "Previous UTC week low", previousWeek?.low, "previous-week"),
    level("previous-week-close", "Previous UTC week close", previousWeek?.close, "previous-week"),
    level("anchored-vwap", anchorLabel, anchoredVwap.value ?? undefined, "vwap"),
    level("swing-high", "Latest confirmed swing high", swing.lastHigh?.price, "swing"),
    level("swing-low", "Latest confirmed swing low", swing.lastLow?.price, "swing"),
  ]
    .filter((item): item is StructureLevel => Boolean(item))
    .sort((a, b) => Math.abs(a.distancePct ?? Infinity) - Math.abs(b.distancePct ?? Infinity) || a.price - b.price);

  return Object.freeze({
    asOfTime,
    referencePrice,
    sessionConvention: "UTC-00:00",
    currentDay,
    openingRange,
    currentWeek,
    previousDay,
    previousWeek,
    anchoredVwap,
    swing,
    levels: Object.freeze(levels),
    clusters: Object.freeze(clusterStructureLevels(levels, referencePrice, input.clusterTolerancePct)),
    limitations: Object.freeze([...new Set(limitations)]),
  });
}
