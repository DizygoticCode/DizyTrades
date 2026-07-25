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
  startTime?: number;
  endTime?: number;
};
export type FibLevel = { ratio: number; price: number; label: string; startTime?: number; endTime?: number };
export type RegressionChannelGeometry = {
  basis: [Point, Point]; upper: [Point, Point]; lower: [Point, Point]; startTime: number; endTime: number;
};
export type PatternTriangle = {
  id: string;
  direction: "bullish" | "bearish";
  status: PatternStatus;
  points: { time: number; price: number }[];
  label: string;
};
export type PatternStatus = "forming" | "confirmed";
export type PatternFamily = "elliott" | "wyckoff" | "triangle";
export type TradeSignalMarker = {
  id: string;
  time: number;
  price: number;
  direction: "buy" | "sell";
  status: "confirmed";
  label: "BUY" | "SELL";
  confluence: number;
  confluenceTotal: 5;
};
export type PatternStageMarker = {
  id: string;
  family: Exclude<PatternFamily, "triangle">;
  time: number;
  price: number;
  direction: "bullish" | "bearish" | "accumulation" | "distribution";
  status: PatternStatus;
  label: string;
  stage: number | "A" | "B" | "C" | "D" | "E";
};
export type CompletedPatternRegion = {
  id: string;
  family: PatternFamily;
  status: PatternStatus;
  direction: "bullish" | "bearish" | "accumulation" | "distribution";
  startTime: number;
  endTime: number;
  high: number;
  low: number;
  points?: { time: number; price: number }[];
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
  activeChannel: RegressionChannelGeometry | null;
  upperTrendline: Point[];
  lowerTrendline: Point[];
  levels: PriceLevel[];
  fibs: FibLevel[];
  triangles: PatternTriangle[];
  tradeSignals: TradeSignalMarker[];
  patternStages: PatternStageMarker[];
  completedPatterns: CompletedPatternRegion[];
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
  if (length < 2) return { value: values[end], deviation: 0, slope: 0, intercept: values[end] };
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
  return { value: fitted[length - 1], deviation, slope, intercept };
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
  const clusters: { prices: number[]; touches: number; times: number[] }[] = [];
  const width = Math.max(atr * settings.srClusterAtr, candles.at(-1)!.close * 0.0005);
  points.forEach((point) => {
    const match = clusters.find(
      (cluster) => Math.abs(mean(cluster.prices) - point.price) <= width,
    );
    if (match) {
      match.prices.push(point.price);
      match.touches += 1;
      match.times.push(point.time);
    } else {
      clusters.push({ prices: [point.price], touches: 1, times: [point.time] });
    }
  });
  const close = candles.at(-1)!.close;
  const raw = clusters
    .filter((cluster) => cluster.touches >= settings.minTouches)
    .map((cluster) => {
      const price = mean(cluster.prices);
      const kind = price <= close ? "support" : "resistance";
      return {
        price,
        kind,
        touches: cluster.touches,
        label: "",
        startTime: Math.min(...cluster.times),
        endTime: Math.max(...cluster.times),
      } satisfies PriceLevel;
    })
    .sort((a, b) => Math.abs(a.price - close) - Math.abs(b.price - close))
    .slice(0, 8);
  const supports = raw.filter(level => level.kind === "support").sort((a, b) => b.price - a.price);
  const resistances = raw.filter(level => level.kind === "resistance").sort((a, b) => a.price - b.price);
  supports.forEach((level, index) => { level.label = `S${index + 1}`; });
  resistances.forEach((level, index) => { level.label = `R${index + 1}`; });
  return raw;
}

export const formatLevelLabel = (level: PriceLevel, showTouches = false) =>
  `${level.label}${showTouches ? ` · ${level.touches}×` : ""}`;

type Pivot = { index: number; time: number; price: number; kind: "high" | "low" };
export function alternatingPivots(highs: Omit<Pivot, "kind">[], lows: Omit<Pivot, "kind">[]): Pivot[] {
  const ordered: Pivot[] = [...highs.map(p => ({ ...p, kind: "high" as const })), ...lows.map(p => ({ ...p, kind: "low" as const }))].sort((a,b) => a.index-b.index || (a.kind === "low" ? -1 : 1));
  const result: Pivot[] = [];
  for (const pivot of ordered) {
    const previous = result.at(-1);
    if (!previous || previous.kind !== pivot.kind) result.push(pivot);
    else if ((pivot.kind === "high" && pivot.price >= previous.price) || (pivot.kind === "low" && pivot.price <= previous.price)) result[result.length - 1] = pivot;
  }
  return result;
}

function buildElliottStages(pivotData: ReturnType<typeof pivots>): { stages: PatternStageMarker[]; region?: CompletedPatternRegion } {
  const sequence = alternatingPivots(pivotData.highs, pivotData.lows).slice(-6);
  if (sequence.length < 2) return { stages: [] };
  const bullish = sequence[0].kind === "low";
  const expected = bullish ? ["high","low","high","low","high"] : ["low","high","low","high","low"];
  const waves = sequence.slice(1, 6);
  const validKinds = waves.every((p, i) => p.kind === expected[i]);
  const progression = waves.length < 5 || (bullish
    ? waves[2]?.price > waves[0]?.price && waves[4]?.price > waves[2]?.price && waves[3]?.price > sequence[0].price
    : waves[2]?.price < waves[0]?.price && waves[4]?.price < waves[2]?.price && waves[3]?.price < sequence[0].price);
  if (!validKinds || !progression) return { stages: [] };
  const complete = waves.length === 5;
  const direction = bullish ? "bullish" : "bearish";
  const stages = waves.map((pivot, index) => {
    const status: PatternStatus = complete || index < waves.length - 1 ? "confirmed" : "forming";
    return { id:`elliott-${direction}-${pivot.time}-${index+1}`, family:"elliott", time:pivot.time, price:pivot.price, direction, status, stage:index+1, label:`Elliott ${index+1}${status === "forming" ? "?" : ""}` } satisfies PatternStageMarker;
  });
  const points = [sequence[0], ...waves].map(p => ({ time:p.time, price:p.price }));
  return { stages, region: complete ? { id:`elliott-${direction}-${sequence[0].time}`, family:"elliott", status:"confirmed", direction, startTime:sequence[0].time, endTime:waves[4].time, high:Math.max(...points.map(p=>p.price)), low:Math.min(...points.map(p=>p.price)), points } : undefined };
}

function trendline(
  pivotsInput: { index: number; time: number; price: number }[],
): Point[] {
  if (pivotsInput.length < 2) return [];
  const first = pivotsInput.at(-2)!;
  const second = pivotsInput.at(-1)!;
  return [
    { time: first.time, value: first.price },
    { time: second.time, value: second.price },
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
  const breakout = candles.slice(endIndex + 1).find(candle => candle.close > high2.price || candle.close < low2.price);
  return [
    {
      id: `triangle-${candles[startIndex].time}-${candles[endIndex].time}`,
      direction,
      status: breakout ? "confirmed" : "forming",
      label: breakout ? "Triangle" : "Triangle?",
      points: [
        { time: candles[startIndex].time, price: high1.price },
        { time: candles[startIndex].time, price: low1.price },
        { time: candles[endIndex].time, price: midpoint },
      ],
    },
  ];
}

function buildWyckoff(candles: Candle[], trend: Point[]): { stages: PatternStageMarker[]; region?: CompletedPatternRegion; phase?: string } {
  if (candles.length < 50) return { stages: [] };
  const sample = candles.slice(-50);
  const range = sample.slice(0, 35), high = Math.max(...range.map(c=>c.high)), low = Math.min(...range.map(c=>c.low));
  const width = (high-low) / Math.max(low, Number.EPSILON);
  if (width >= .06) return { stages: [] };
  const trendValue = trend.find(p=>p.time===sample[0].time)?.value ?? sample[0].close;
  const accumulation = sample[0].close <= trendValue;
  const direction = accumulation ? "accumulation" : "distribution";
  const eventIndexes = [0, 10, 24, 34];
  const breakoutIndex = sample.findIndex((c,i)=>i>34 && (accumulation ? c.close > high : c.close < low));
  if (breakoutIndex >= 0) eventIndexes.push(breakoutIndex);
  const letters = ["A","B","C","D","E"] as const;
  const stages = eventIndexes.map((offset,index) => {
    const candle=sample[offset], status:PatternStatus = index === eventIndexes.length-1 && breakoutIndex < 0 ? "forming" : "confirmed";
    return { id:`wyckoff-${direction}-${candle.time}-${letters[index]}`,family:"wyckoff",time:candle.time,price:accumulation?candle.low:candle.high,direction,status,stage:letters[index],label:`Wyckoff ${letters[index]}${status === "forming" ? "?" : ""}` } satisfies PatternStageMarker;
  });
  if (breakoutIndex < 0) {
    const candle=sample[34]; stages[3] = {...stages[3],status:"forming",label:"Wyckoff D?",time:candle.time,price:accumulation?candle.low:candle.high};
  }
  return { stages, phase:`Wyckoff-lite ${direction}`, region: breakoutIndex >= 0 ? { id:`wyckoff-${direction}-${sample[0].time}`,family:"wyckoff",status:"confirmed",direction,startTime:sample[0].time,endTime:sample[breakoutIndex].time,high,low } : undefined };
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
      activeChannel: null,
      upperTrendline: [],
      lowerTrendline: [],
      levels: [],
      fibs: [],
      triangles: [],
      tradeSignals: [],
      patternStages: [],
      completedPatterns: [],
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
  const channelStartIndex = Math.max(0, candles.length - settings.channelLength);
  const channelEndIndex = candles.length - 1;
  const activeRegression = regression(closes, channelStartIndex, channelEndIndex);
  const channelOffset = activeRegression.deviation * settings.channelDeviation;
  const basisStart = activeRegression.intercept;
  const basisEnd = activeRegression.value;
  const activeChannel: RegressionChannelGeometry = {
    startTime: candles[channelStartIndex].time,
    endTime: candles[channelEndIndex].time,
    basis: [{ time: candles[channelStartIndex].time, value: basisStart }, { time: candles[channelEndIndex].time, value: basisEnd }],
    upper: [{ time: candles[channelStartIndex].time, value: basisStart + channelOffset }, { time: candles[channelEndIndex].time, value: basisEnd + channelOffset }],
    lower: [{ time: candles[channelStartIndex].time, value: basisStart - channelOffset }, { time: candles[channelEndIndex].time, value: basisEnd - channelOffset }],
  };

  const pivotData = pivots(candles, settings.pivotLength);
  const lastAtr = atr.at(-1)!.value;
  const levels = buildLevels(candles, pivotData, lastAtr, settings);
  const recent = candles.slice(-Math.min(settings.fibLength, candles.length));
  const swingHigh = Math.max(...recent.map((candle) => candle.high));
  const swingLow = Math.min(...recent.map((candle) => candle.low));
  const swingHighTime = recent.find(candle => candle.high === swingHigh)!.time;
  const swingLowTime = recent.find(candle => candle.low === swingLow)!.time;
  const fibStartTime = Math.min(swingHighTime, swingLowTime), fibEndTime = Math.max(swingHighTime, swingLowTime);
  const range = Math.max(swingHigh - swingLow, Number.EPSILON);
  const fibs = [
    { ratio: 0, price: swingHigh, label: "FIB 0", startTime: fibStartTime, endTime: fibEndTime },
    { ratio: 0.236, price: swingHigh - range * 0.236, label: "FIB 0.236", startTime: fibStartTime, endTime: fibEndTime },
    { ratio: 0.382, price: swingHigh - range * 0.382, label: "FIB 0.382", startTime: fibStartTime, endTime: fibEndTime },
    { ratio: 0.5, price: swingHigh - range * 0.5, label: "FIB 0.5", startTime: fibStartTime, endTime: fibEndTime },
    { ratio: 0.618, price: swingHigh - range * 0.618, label: "FIB 0.618", startTime: fibStartTime, endTime: fibEndTime },
    { ratio: 0.786, price: swingHigh - range * 0.786, label: "FIB 0.786", startTime: fibStartTime, endTime: fibEndTime },
    { ratio: 1, price: swingLow, label: "FIB 1", startTime: fibStartTime, endTime: fibEndTime },
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

  const tradeSignals: TradeSignalMarker[] = [];
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
      tradeSignals.push({
        id: `signal-${candle.time}-buy`,
        time: candle.time,
        price: candle.high,
        direction: "buy",
        status: "confirmed",
        label: "BUY",
        confluence: Math.min(5, Number(candle.close > currentVwapAtBar) + Number(candle.close > trendAtBar) + Number(nearSupport) + Number(bullishTriangle) + Number(longFib)),
        confluenceTotal: 5,
      });
    } else if (
      previous.close >= previousVwap &&
      candle.close < currentVwapAtBar &&
      candle.close < trendAtBar
    ) {
      tradeSignals.push({
        id: `signal-${candle.time}-sell`,
        time: candle.time,
        price: candle.high,
        direction: "sell",
        status: "confirmed",
        label: "SELL",
        confluence: Math.min(5, Number(candle.close < currentVwapAtBar) + Number(candle.close < trendAtBar) + Number(nearResistance) + Number(bearishTriangle) + Number(shortFib)),
        confluenceTotal: 5,
      });
    }
  }

  const elliott = buildElliottStages(pivotData);
  const wyckoff = buildWyckoff(candles, trend);
  const recentWidth = (Math.max(...recent.map((c) => c.high)) - Math.min(...recent.map((c) => c.low))) / last.close;
  const phase = wyckoff.phase ?? (
    recentWidth < 0.06
      ? last.close >= currentTrend
        ? "Wyckoff accumulation"
        : "Wyckoff distribution"
      : last.close >= currentTrend
        ? "Markup"
        : "Markdown");
  const completedPatterns: CompletedPatternRegion[] = [elliott.region, wyckoff.region, ...triangles.filter(t=>t.status === "confirmed").map(t=>({id:t.id,family:"triangle" as const,status:"confirmed" as const,direction:t.direction,startTime:t.points[0].time,endTime:t.points.at(-1)!.time,high:Math.max(...t.points.map(p=>p.price)),low:Math.min(...t.points.map(p=>p.price)),points:t.points}))].filter((item): item is CompletedPatternRegion => Boolean(item));
  const uniqueSignals = [...new Map(tradeSignals.map(signal => [signal.id, signal])).values()].sort((a,b)=>a.time-b.time);

  return {
    atr,
    vwap,
    trend,
    channelBasis,
    channelTop,
    channelBottom,
    activeChannel,
    upperTrendline: trendline(pivotData.highs),
    lowerTrendline: trendline(pivotData.lows),
    levels,
    fibs,
    triangles,
    tradeSignals: uniqueSignals,
    patternStages: [...elliott.stages, ...wyckoff.stages].sort((a,b)=>a.time-b.time),
    completedPatterns,
    scoreLong,
    scoreShort,
    bias,
    phase,
    lastSignal: uniqueSignals.at(-1)?.label ?? "Waiting for confluence",
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
