import type { LiquidityObservation } from "./types.ts";

export type HeatmapSegment = {
  price: number;
  fromMs: number;
  toMs: number;
  bidQuantity: number;
  askQuantity: number;
};
export type BookmapHeatmapCellRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type HeatmapPalette = "bookmap" | "thermal" | "ocean";
export type HeatmapPriceGrouping = "auto" | "exchange" | "manual";
export type HeatmapTimeSliceMs = 0 | 5000 | 15000 | 30000 | 60000;
export type HeatmapDetectionRangeBps = 100 | 250 | 500 | 1000;
export type HeatmapDisplayTuning = {
  palette: HeatmapPalette;
  minimumTimePixels: number;
  minimumPricePixels: number;
  timeSliceMs: HeatmapTimeSliceMs;
  detectionRangeBps: HeatmapDetectionRangeBps;
  priceGrouping: HeatmapPriceGrouping;
  manualPriceStep: number;
};

export const HEATMAP_DISPLAY_STORAGE_KEY = "dizytrades:heatmap-display:v1";
export const HEATMAP_DISPLAY_EVENT = "dizytrades:heatmap-display-change";
export const DEFAULT_HEATMAP_DISPLAY_TUNING: HeatmapDisplayTuning = {
  palette: "bookmap",
  minimumTimePixels: 8,
  minimumPricePixels: 8,
  timeSliceMs: 15000,
  detectionRangeBps: 500,
  priceGrouping: "auto",
  manualPriceStep: 1,
};

const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  Number.isFinite(Number(value))
    ? Math.min(max, Math.max(min, Number(value)))
    : fallback;
const choice = <T extends string | number>(
  value: unknown,
  values: readonly T[],
  fallback: T,
): T => (values.includes(value as T) ? (value as T) : fallback);

export function sanitiseHeatmapDisplayTuning(
  value: unknown,
): HeatmapDisplayTuning {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const defaults = DEFAULT_HEATMAP_DISPLAY_TUNING;
  return {
    palette: choice(
      input.palette,
      ["bookmap", "thermal", "ocean"] as const,
      defaults.palette,
    ),
    minimumTimePixels: clamp(
      input.minimumTimePixels,
      defaults.minimumTimePixels,
      2.5,
      24,
    ),
    minimumPricePixels: clamp(
      input.minimumPricePixels,
      defaults.minimumPricePixels,
      3,
      24,
    ),
    timeSliceMs: choice(
      input.timeSliceMs,
      [0, 5000, 15000, 30000, 60000] as const,
      defaults.timeSliceMs,
    ),
    detectionRangeBps: choice(
      input.detectionRangeBps,
      [100, 250, 500, 1000] as const,
      defaults.detectionRangeBps,
    ),
    priceGrouping: choice(
      input.priceGrouping,
      ["auto", "exchange", "manual"] as const,
      defaults.priceGrouping,
    ),
    manualPriceStep: clamp(
      input.manualPriceStep,
      defaults.manualPriceStep,
      0.00000001,
      100000,
    ),
  };
}

export function readHeatmapDisplayTuning(
  storage?: Pick<Storage, "getItem"> | null,
): HeatmapDisplayTuning {
  const source =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!source) return DEFAULT_HEATMAP_DISPLAY_TUNING;
  try {
    return sanitiseHeatmapDisplayTuning(
      JSON.parse(source.getItem(HEATMAP_DISPLAY_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return DEFAULT_HEATMAP_DISPLAY_TUNING;
  }
}

export function writeHeatmapDisplayTuning(
  value: unknown,
  storage?: Pick<Storage, "setItem"> | null,
): HeatmapDisplayTuning {
  const next = sanitiseHeatmapDisplayTuning(value);
  const source =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  try {
    source?.setItem(HEATMAP_DISPLAY_STORAGE_KEY, JSON.stringify(next));
  } catch {}
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent(HEATMAP_DISPLAY_EVENT, { detail: next }),
    );
  return next;
}

export function expandHeatmapDetectionRange(
  minPrice: number,
  maxPrice: number,
  rangeBps = DEFAULT_HEATMAP_DISPLAY_TUNING.detectionRangeBps,
) {
  const low = Math.min(minPrice, maxPrice);
  const high = Math.max(minPrice, maxPrice);
  const mid = (low + high) / 2;
  if (
    !Number.isFinite(low) ||
    !Number.isFinite(high) ||
    low <= 0 ||
    high <= low ||
    !Number.isFinite(mid)
  )
    return { minPrice: low, maxPrice: high };
  const requestedHalf = (mid * Math.max(0, rangeBps)) / 10_000;
  const visibleHalf = (high - low) / 2;
  const half = Math.max(visibleHalf, requestedHalf);
  return { minPrice: Math.max(1e-8, mid - half), maxPrice: mid + half };
}

const blendHex = (from: string, to: string, ratio: number) => {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const mix = (shift: number) =>
    Math.round(((a >> shift) & 255) * (1 - ratio) + ((b >> shift) & 255) * ratio);
  return `rgb(${mix(16)},${mix(8)},${mix(0)})`;
};

const HEAT_PALETTES: Record<
  HeatmapPalette,
  readonly (readonly [number, string])[]
> = {
  bookmap: [
    [0, "#07152f"],
    [0.2, "#064fb5"],
    [0.42, "#00cde8"],
    [0.65, "#ffe34d"],
    [0.83, "#ff6a24"],
    [1, "#fffbd1"],
  ],
  thermal: [
    [0, "#160922"],
    [0.2, "#4b167a"],
    [0.42, "#d22d83"],
    [0.65, "#ff7a35"],
    [0.83, "#ffd54a"],
    [1, "#fff8d4"],
  ],
  ocean: [
    [0, "#061a25"],
    [0.2, "#07546e"],
    [0.42, "#00a6a6"],
    [0.65, "#5ee6bd"],
    [0.83, "#c9f36b"],
    [1, "#f7ffd6"],
  ],
};

export function heatmapColour(
  value: number,
  palette: HeatmapPalette = "bookmap",
) {
  const stops = HEAT_PALETTES[palette];
  const normal = Math.max(0, Math.min(1, value));
  let index = 1;
  while (index < stops.length && normal > stops[index][0]) index++;
  const [fromAt, from] = stops[index - 1];
  const [toAt, to] = stops[Math.min(index, stops.length - 1)];
  return blendHex(
    from,
    to,
    toAt === fromAt ? 0 : (normal - fromAt) / (toAt - fromAt),
  );
}

/** Generic callers retain the historical fallback; the production renderer always supplies the active display target. */
export function effectiveHeatmapPriceStep(
  pricePerPixel: number,
  exchangeTick: number,
  targetPixels = 4.5,
) {
  if (!Number.isFinite(exchangeTick) || exchangeTick <= 0) return 1;
  const desired = Math.max(exchangeTick, Math.abs(pricePerPixel) * targetPixels);
  return exchangeTick * Math.max(1, Math.round(desired / exchangeTick));
}

/**
 * Turns projected exchange-time / price-bin coordinates into a visible screen
 * cell. Very short depth slices can be fractions of a CSS pixel on 15m+
 * candles. Bookmap-style rendering keeps their centre accurate while giving
 * them enough screen area to read as continuous resting-liquidity bands.
 */
export function bookmapHeatmapCellRect(
  x1: number,
  x2: number,
  y1: number,
  y2: number,
  minimumTimePixels = DEFAULT_HEATMAP_DISPLAY_TUNING.minimumTimePixels,
  minimumPricePixels = DEFAULT_HEATMAP_DISPLAY_TUNING.minimumPricePixels,
): BookmapHeatmapCellRect | null {
  if (
    ![x1, x2, y1, y2, minimumTimePixels, minimumPricePixels].every(
      Number.isFinite,
    ) ||
    minimumTimePixels <= 0 ||
    minimumPricePixels <= 0
  )
    return null;
  const centreX = (x1 + x2) / 2;
  const centreY = (y1 + y2) / 2;
  const width = Math.max(minimumTimePixels, Math.abs(x2 - x1) + 0.9);
  const height = Math.max(minimumPricePixels, Math.abs(y2 - y1) + 0.75);
  return {
    left: centreX - width / 2,
    top: centreY - height / 2,
    width,
    height,
  };
}

/** Replays sparse raw-level transitions into stable display bins and terminates at the last depth receipt. */
export function buildHeatmapSegments(
  observations: readonly LiquidityObservation[],
  displayStep: number,
  visibleFrom: number,
  visibleTo: number,
  latestDepthMs: number,
) {
  const bins = new Map<number, LiquidityObservation[]>();
  for (const observation of observations) {
    const bin = Math.round(observation.price / displayStep);
    const items = bins.get(bin) ?? [];
    items.push(observation);
    bins.set(bin, items);
  }

  const result: HeatmapSegment[] = [];
  for (const [bin, items] of bins) {
    items.sort((a, b) => a.timestampMs - b.timestampMs);
    const levels = new Map<number, { bid: number; ask: number }>();
    let stateAt = items[0]?.timestampMs ?? 0;
    let index = 0;

    while (index < items.length) {
      const timestamp = items[index].timestampMs;
      if (timestamp > stateAt) {
        const bid = [...levels.values()].reduce(
          (sum, value) => sum + value.bid,
          0,
        );
        const ask = [...levels.values()].reduce(
          (sum, value) => sum + value.ask,
          0,
        );
        const from = Math.max(stateAt, visibleFrom);
        const to = Math.min(timestamp, visibleTo, latestDepthMs);
        if (to > from && (bid > 0 || ask > 0))
          result.push({
            price: bin * displayStep,
            fromMs: from,
            toMs: to,
            bidQuantity: bid,
            askQuantity: ask,
          });
      }

      while (index < items.length && items[index].timestampMs === timestamp) {
        const item = items[index++];
        levels.set(item.price, {
          bid: item.bidQuantity,
          ask: item.askQuantity,
        });
      }
      stateAt = timestamp;
    }

    const bid = [...levels.values()].reduce(
      (sum, value) => sum + value.bid,
      0,
    );
    const ask = [...levels.values()].reduce(
      (sum, value) => sum + value.ask,
      0,
    );
    const from = Math.max(stateAt, visibleFrom);
    const to = Math.min(visibleTo, latestDepthMs);
    if (to > from && (bid > 0 || ask > 0))
      result.push({
        price: bin * displayStep,
        fromMs: from,
        toMs: to,
        bidQuantity: bid,
        askQuantity: ask,
      });
  }

  return result;
}
