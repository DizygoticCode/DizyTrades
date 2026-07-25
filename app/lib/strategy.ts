export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Point = { time: number; value: number };
export type PriceLevel = {
  price: number;
  kind: "support" | "resistance";
  touches: number;
  label: string;
};
export type FibLevel = { ratio: number; price: number; label: string };
export type PatternTriangle = {
  direction: "bullish" | "bearish";
  points: { time: number; price: number }[];
  label: string;
};
export type SignalMarker = {
  time: number;
  position: "aboveBar" | "belowBar";
  shape: "arrowUp" | "arrowDown" | "circle";
  color: string;
  text: string;
  size?: number;
};

export type StrategySettings = {
  pivotLength: number;
  srLookback: number;
  srTolerancePct: number;
  srClusterAtr: number;
  minTouches: number;
  vwapLength: number;
  trendLength: number;
  channelLength: number;
  channelDeviation: number;
  fibLength: number;
  minConfluence: number;
};

export type StrategyAnalysis = {
  atr: Point[];
  vwap: Point[];
  trend: Point[];
  channelBasis: Point[];
  channelTop: Point[];
  channelBottom: Point[];
  upperTrendline: Point[];
  lowerTrendline: Point[];
  levels: PriceLevel[];
  fibs: FibLevel[];
  triangles: PatternTriangle[];
  markers: SignalMarker[];
  scoreLong: number;
  scoreShort: number;
  bias: "Bullish" | "Bearish" | "Neutral";
  phase: string;
  lastSignal: string;
};

const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const stdDev = (values: number[]) => {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};

const smaAt = (values: number[], index: number, length: number) => {
  if (index < length - 1) return Number.NaN;
  return mean(values.slice(index - length + 1, index + 1));
};

function rollingVwap(candles: Candle[], length: number): Point[] {
  let pv = 0;
  let volume = 0;
  const queue: { pv: number; volume: number }[] = [];
  return candles.map((candle) => {
    const item = {
      pv: ((candle.high + candle.low + candle.close) / 3) * candle.volume,
      volume: candle.volume,
    };
    queue.push(item);
    pv += item.pv;
    volume += item.volume;
    if (queue.length > length) {
      const removed = queue.shift()!;
      pv -= removed.pv;
      volume -= removed.volume;
    }
    return { time: candle.time, value: volume > 0 ? pv / volume : candle.close };
  });
}

function atrSeries(candles: Candle[], length = 14): Point[] {
  const trueRanges = candles.map((candle, index) => {
    if (!index) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
  return candles.map((candle, index) => ({
    time: candle.time,
    value: index < length - 1 ? trueRanges[index] : mean(trueRanges.slice(index - length + 1, index + 1)),
  }));
}

function regression(values: number[], start: number, end: number) {
  const length = end - start + 1;
  if (length < 2) return { value: values[end], deviation: 0 };
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let x = 0; x < length; x += 1) {
    const y = values[start + x];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denominator = length * sumXX - sumX * sumX;
  const slope = denominator ? (length * sumXY - sumX * sumY) / denominator : 0;
  const intercept = (sumY - slope * sumX) / length;
  const fitted = Array.from({ length }, (_, x) => intercept + slope * x);
  const deviation = stdDev(
    fitted.map((fit, offset) => values[start + offset] - fit),
  );
  return { value: fitted[length - 1], deviation };
}

function pivots(candles: Candle[], length: number) {
  const highs: { index: number; time: number; price: number }[] = [];
  const lows: { index: number; time: number; price: number }[] = [];
  for (let i = length; i < candles.length - length; i += 1) {
    const window = candles.slice(i - length, i + length + 1);
    if (candles[i].high >= Math.max(...window.map((c) => c.high))) {
      highs.push({ index: i, time: candles[i].time, price: candles[i].high });
    }
    if (candles[i].low <= Math.min(...window.map((c) => c.low))) {
      lows.push({ index: i, time: candles[i].time, price: candles[i].low });
    }
  }
  return { highs, lows };
}

function buildLevels(
  candles: Candle[],
  pivotData: ReturnType<typeof pivots>,
  atr: number,
  settings: StrategySettings,
) {
  const recentStart = Math.max(0, candles.length - settings.srLookback);
  const points = [...pivotData.highs, ...pivotData.lows].filter(
    (pivot) => pivot.index >= recentStart,
  );
  const clusters: { prices: number[]; touches: number }[] = [];
  const width = Math.max(atr * settings.srClusterAtr, candles.at(-1)!.close * 0.0005);
  points.forEach((point) => {
    const match = clusters.find(
      (cluster) => Math.abs(mean(cluster.prices) - point.price) <= width,
    );
    if (match) {
      match.prices.push(point.price);
      match.touches += 1;
    } else {
      clusters.push({ prices: [point.price], touches: 1 });
    }
  });
  const close = candles.at(-1)!.close;
  return clusters
    .filter((cluster) => cluster.touches >= settings.minTouches)
    .map((cluster) => {
      const price = mean(cluster.prices);
      const kind = price <= close ? "support" : "resistance";
      return {
        price,
        kind,
        touches: cluster.touches,
        label: `${kind === "support" ? "SUPPORT" : "RESISTANCE"} · ${cluster.touches} touches`,
      } satisfies PriceLevel;
    })
    .sort((a, b) => Math.abs(a.price - close) - Math.abs(b.price - close))
    .slice(0, 8);
}

function trendline(
  pivotsInput: { index: number; time: number; price: number }[],
  candles: Candle[],
): Point[] {
  if (pivotsInput.length < 2) return [];
  const first = pivotsInput.at(-2)!;
  const second = pivotsInput.at(-1)!;
  const slope = (second.price - first.price) / Math.max(1, second.index - first.index);
  const lastIndex = candles.length - 1;
  return [
    { time: first.time, value: first.price },
    { time: candles[lastIndex].time, value: second.price + slope * (lastIndex - second.index) },
  ];
}

function buildTriangle(
  candles: Candle[],
  highPivots: ReturnType<typeof pivots>["highs"],
  lowPivots: ReturnType<typeof pivots>["lows"],
): PatternTriangle[] {
  if (highPivots.length < 2 || lowPivots.length < 2) return [];

  const recentHighs = highPivots.slice(-10);
  const recentLows = lowPivots.slice(-10);
  let candidate:
    | {
        high1: (typeof highPivots)[number];
        high2: (typeof highPivots)[number];
        low1: (typeof lowPivots)[number];
        low2: (typeof lowPivots)[number];
        endIndex: number;
      }
    | undefined;

  for (let highIndex = 1; highIndex < recentHighs.length; highIndex += 1) {
    const high1 = recentHighs[highIndex - 1];
    const high2 = recentHighs[highIndex];
    if (high2.price >= high1.price) continue;
    for (let lowIndex = 1; lowIndex < recentLows.length; lowIndex += 1) {
      const low1 = recentLows[lowIndex - 1];
      const low2 = recentLows[lowIndex];
      if (low2.price <= low1.price) continue;
      const startIndex = Math.min(high1.index, low1.index);
      const endIndex = Math.max(high2.index, low2.index);
      const legsOverlap =
        Math.max(high1.index, low1.index) <= Math.min(high2.index, low2.index) + 18;
      if (
        !legsOverlap ||
        endIndex - startIndex < 5 ||
        endIndex < candles.length - 150
      ) {
        continue;
      }
      if (!candidate || endIndex > candidate.endIndex) {
        candidate = { high1, high2, low1, low2, endIndex };
      }
    }
  }

  if (!candidate) return [];
  const { high1, high2, low1, low2 } = candidate;
  const close = candles.at(-1)!.close;
  const midpoint = (high2.price + low2.price) / 2;
  const direction = close >= midpoint ? "bullish" : "bearish";
  const startIndex = Math.min(high1.index, low1.index);
  const endIndex = Math.max(high2.index, low2.index);
  return [
    {
      direction,
      label: `${direction === "bullish" ? "BULLISH" : "BEARISH"} TRIANGLE`,
      points: [
        { time: candles[startIndex].time, price: high1.price },
        { time: candles[startIndex].time, price: low1.price },
        { time: candles[endIndex].time, price: midpoint },
      ],
    },
  ];
}

export function analyzeStrategy(
  candles: Candle[],
  settings: StrategySettings,
): StrategyAnalysis {
  if (candles.length < 30) {
    return {
      atr: [],
      vwap: [],
      trend: [],
      channelBasis: [],
      channelTop: [],
      channelBottom: [],
      upperTrendline: [],
      lowerTrendline: [],
      levels: [],
      fibs: [],
      triangles: [],
      markers: [],
      scoreLong: 0,
      scoreShort: 0,
      bias: "Neutral",
      phase: "Building history",
      lastSignal: "Waiting",
    };
  }

  const closes = candles.map((candle) => candle.close);
  const atr = atrSeries(candles);
  const vwap = rollingVwap(candles, settings.vwapLength);
  const trend = candles.map((candle, index) => ({
    time: candle.time,
    value: smaAt(closes, index, settings.trendLength),
  })).filter((point) => Number.isFinite(point.value));
  const channelBasis: Point[] = [];
  const channelTop: Point[] = [];
  const channelBottom: Point[] = [];
  candles.forEach((candle, index) => {
    if (index < settings.channelLength - 1) return;
    const item = regression(closes, index - settings.channelLength + 1, index);
    channelBasis.push({ time: candle.time, value: item.value });
    channelTop.push({
      time: candle.time,
      value: item.value + item.deviation * settings.channelDeviation,
    });
    channelBottom.push({
      time: candle.time,
      value: item.value - item.deviation * settings.channelDeviation,
    });
  });

  const pivotData = pivots(candles, settings.pivotLength);
  const lastAtr = atr.at(-1)!.value;
  const levels = buildLevels(candles, pivotData, lastAtr, settings);
  const recent = candles.slice(-Math.min(settings.fibLength, candles.length));
  const swingHigh = Math.max(...recent.map((candle) => candle.high));
  const swingLow = Math.min(...recent.map((candle) => candle.low));
  const range = Math.max(swingHigh - swingLow, Number.EPSILON);
  const fibs = [
    { ratio: 0, price: swingHigh, label: "FIB 0.000" },
    { ratio: 0.236, price: swingHigh - range * 0.236, label: "FIB 0.236" },
    { ratio: 0.382, price: swingHigh - range * 0.382, label: "FIB 0.382" },
    { ratio: 0.5, price: swingHigh - range * 0.5, label: "FIB 0.500" },
    { ratio: 0.618, price: swingHigh - range * 0.618, label: "FIB 0.618" },
    { ratio: 0.786, price: swingHigh - range * 0.786, label: "FIB 0.786" },
    { ratio: 1, price: swingLow, label: "FIB 1.000" },
  ];
  const triangles = buildTriangle(candles, pivotData.highs, pivotData.lows);
  const last = candles.at(-1)!;
  const currentVwap = vwap.at(-1)!.value;
  const currentTrend = trend.at(-1)?.value ?? last.close;
  const support = levels.find((level) => level.kind === "support");
  const resistance = levels.find((level) => level.kind === "resistance");
  const tolerance = last.close * settings.srTolerancePct * 0.01;
  const nearSupport = !!support && Math.abs(last.close - support.price) <= tolerance + lastAtr;
  const nearResistance =
    !!resistance && Math.abs(resistance.price - last.close) <= tolerance + lastAtr;
  const bullishTriangle = triangles.some((triangle) => triangle.direction === "bullish");
  const bearishTriangle = triangles.some((triangle) => triangle.direction === "bearish");
  const fib618 = fibs.find((fib) => fib.ratio === 0.618)!.price;
  const fib50 = fibs.find((fib) => fib.ratio === 0.5)!.price;
  const longFib = last.close >= Math.min(fib618, fib50) && last.close <= Math.max(fib618, fib50);
  const shortFib = last.close >= fibs[2].price && last.close <= fib50;
  const scoreLong =
    Number(last.close > currentVwap) +
    Number(last.close > currentTrend) +
    Number(nearSupport) +
    Number(bullishTriangle) +
    Number(longFib);
  const scoreShort =
    Number(last.close < currentVwap) +
    Number(last.close < currentTrend) +
    Number(nearResistance) +
    Number(bearishTriangle) +
    Number(shortFib);
  const bias =
    scoreLong > scoreShort ? "Bullish" : scoreShort > scoreLong ? "Bearish" : "Neutral";

  const markers: SignalMarker[] = [];
  const start = Math.max(3, candles.length - 160);
  for (let index = start; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const candle = candles[index];
    const previousVwap = vwap[index - 1]?.value;
    const currentVwapAtBar = vwap[index]?.value;
    const trendAtBar = trend.find((point) => point.time === candle.time)?.value;
    if (!previousVwap || !currentVwapAtBar || !trendAtBar) continue;
    if (
      previous.close <= previousVwap &&
      candle.close > currentVwapAtBar &&
      candle.close > trendAtBar
    ) {
      markers.push({
        time: candle.time,
        position: "belowBar",
        shape: "arrowUp",
        color: "#2ee6a6",
        text: "BUY · confirmed",
        size: 1.15,
      });
    } else if (
      previous.close >= previousVwap &&
      candle.close < currentVwapAtBar &&
      candle.close < trendAtBar
    ) {
      markers.push({
        time: candle.time,
        position: "aboveBar",
        shape: "arrowDown",
        color: "#ff5c70",
        text: "SELL · confirmed",
        size: 1.15,
      });
    }
  }

  const recentHighs = pivotData.highs.slice(-5);
  recentHighs.forEach((pivot, index) => {
    markers.push({
      time: pivot.time,
      position: "aboveBar",
      shape: "circle",
      color: "#9f8cff",
      text: `E${index + 1}`,
      size: 0.7,
    });
  });
  const recentWidth = (Math.max(...recent.map((c) => c.high)) - Math.min(...recent.map((c) => c.low))) / last.close;
  const phase =
    recentWidth < 0.06
      ? last.close >= currentTrend
        ? "Wyckoff accumulation"
        : "Wyckoff distribution"
      : last.close >= currentTrend
        ? "Markup"
        : "Markdown";

  return {
    atr,
    vwap,
    trend,
    channelBasis,
    channelTop,
    channelBottom,
    upperTrendline: trendline(pivotData.highs, candles),
    lowerTrendline: trendline(pivotData.lows, candles),
    levels,
    fibs,
    triangles,
    markers: markers.sort((a, b) => a.time - b.time),
    scoreLong,
    scoreShort,
    bias,
    phase,
    lastSignal: markers.at(-1)?.text ?? "Waiting for confluence",
  };
}

export function generateDemoCandles(count = 420): Candle[] {
  let seed = 9137;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const interval = 15 * 60;
  const end = Math.floor(Date.now() / 1000 / interval) * interval;
  let previous = 117_400;
  return Array.from({ length: count }, (_, index) => {
    const time = end - (count - 1 - index) * interval;
    const wave = Math.sin(index / 16) * 118 + Math.sin(index / 49) * 210;
    const drift = index < 175 ? 4.4 : index < 290 ? -2.7 : 5.1;
    const open = previous;
    const close = Math.max(1000, open + drift + wave * 0.022 + (random() - 0.5) * 96);
    const high = Math.max(open, close) + 24 + random() * 92;
    const low = Math.min(open, close) - 24 - random() * 88;
    const volume = 150 + random() * 900 + Math.abs(close - open) * 2.2;
    previous = close;
    return { time, open, high, low, close, volume };
  });
}
