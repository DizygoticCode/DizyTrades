import type { Candle } from "./strategy.ts";
import {
  analyzeStrategy,
  type StrategyAnalysis,
  type StrategySettings,
} from "./strategy.ts";
import type { RiskSettings } from "./config.ts";
import {
  createDizyBrainSnapshot,
  type DizyBrainSnapshot,
} from "./dizybrain-snapshot.ts";
import {
  CANDLE_TIMEFRAMES,
  type CandleTimeframe,
} from "./market/types.ts";

export const MAX_REPLAY_CANDLES = 2_000;
export type ReplayStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "error";
export type ReplaySpeed = 0.25 | 0.5 | 1 | 2 | 5 | 10;
export type ReplayDataAvailability =
  | "available"
  | "partially-available"
  | "unavailable"
  | "loading"
  | "error";
export type ReplayTransitionKind =
  | "session-start"
  | "timer"
  | "next"
  | "previous"
  | "first"
  | "last"
  | "jump";
export type ReplaySession = Readonly<{
  id: string;
  symbol: string;
  timeframe: CandleTimeframe;
  status: ReplayStatus;
  startedAt: number;
  rangeStartMs: number;
  rangeEndMs: number;
  cursorIndex: number;
  cursorTimeMs: number | null;
  previousCursorTimeMs: number | null;
  transitionKind: ReplayTransitionKind;
  speed: ReplaySpeed;
  candlesLoaded: number;
  visibleCandles: number;
  error: string | null;
}>;
export type ReplaySnapshot = Readonly<{
  sessionId: string;
  symbol: string;
  timeframe: CandleTimeframe;
  cursorIndex: number;
  cursorTimeMs: number | null;
  candlesVisible: number;
  latestCandle: Candle | null;
  signalAnalysis: StrategyAnalysis;
  dizyBrainSnapshot: DizyBrainSnapshot | null;
  orderFlowAvailability: ReplayDataAvailability;
}>;

const intervalSeconds: Record<CandleTimeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1_800,
  "1h": 3_600,
  "4h": 14_400,
  "8h": 28_800,
  "1d": 86_400,
  "1w": 604_800,
  "1M": 2_592_000,
};
export const REPLAY_SPEED_DELAYS: Readonly<Record<ReplaySpeed, number>> =
  Object.freeze({
    0.25: 4_000,
    0.5: 2_000,
    1: 1_000,
    2: 500,
    5: 200,
    10: 100,
  });
export const replayDelayMs = (speed: ReplaySpeed) =>
  REPLAY_SPEED_DELAYS[speed] ?? REPLAY_SPEED_DELAYS[1];
export const validReplaySpeed = (value: unknown): ReplaySpeed =>
  [0.25, 0.5, 1, 2, 5, 10].includes(Number(value))
    ? (Number(value) as ReplaySpeed)
    : 1;
export function validateReplayRange(startMs: number, endMs: number) {
  return (
    Number.isSafeInteger(startMs) &&
    Number.isSafeInteger(endMs) &&
    startMs >= 0 &&
    endMs > startMs
  );
}
export function clampReplayCursor(index: number, count: number) {
  return count ? Math.max(0, Math.min(Math.trunc(index), count - 1)) : -1;
}
export function replayRangeForCandles(
  candles: ReadonlyArray<Candle>,
  timeframe: CandleTimeframe,
) {
  if (!candles.length) throw new Error("Replay history is empty.");
  const rangeStartMs = candles[0].time * 1_000;
  const rangeEndMs =
    candles.at(-1)!.time * 1_000 + intervalSeconds[timeframe] * 1_000;
  if (!validateReplayRange(rangeStartMs, rangeEndMs))
    throw new Error("Invalid replay range.");
  return Object.freeze({ rangeStartMs, rangeEndMs });
}
export const replayIdentityChanged = (
  session: ReplaySession,
  symbol: string,
  timeframe: CandleTimeframe,
) => session.symbol !== symbol || session.timeframe !== timeframe;

export function prepareReplayCandles(
  input: unknown,
  identity: { symbol: string; timeframe: CandleTimeframe },
  received?: { symbol?: string; timeframe?: string },
): ReadonlyArray<Candle> {
  if (!identity.symbol || !CANDLE_TIMEFRAMES.includes(identity.timeframe))
    throw new Error("Invalid replay identity.");
  if (
    (received?.symbol && received.symbol !== identity.symbol) ||
    (received?.timeframe && received.timeframe !== identity.timeframe)
  )
    throw new Error("Replay history identity mismatch.");
  if (!Array.isArray(input)) throw new Error("Malformed replay history.");
  const byTime = new Map<number, Candle>();
  for (const value of input) {
    if (!value || typeof value !== "object")
      throw new Error("Malformed replay candle.");
    const candle = value as Candle;
    if (
      ![
        candle.time,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
      ].every(Number.isFinite) ||
      !Number.isInteger(candle.time) ||
      candle.time <= 0 ||
      candle.low > candle.high ||
      candle.open < candle.low ||
      candle.open > candle.high ||
      candle.close < candle.low ||
      candle.close > candle.high ||
      candle.volume < 0
    )
      throw new Error("Malformed replay candle.");
    byTime.set(candle.time, Object.freeze({ ...candle }));
  }
  return Object.freeze(
    [...byTime.values()]
      .sort((left, right) => left.time - right.time)
      .slice(-MAX_REPLAY_CANDLES),
  );
}
export function detectReplayGaps(
  candles: ReadonlyArray<Candle>,
  timeframe: CandleTimeframe,
) {
  const expected = intervalSeconds[timeframe];
  return candles.flatMap((candle, index) =>
    index && candle.time - candles[index - 1].time > expected
      ? [
          {
            afterTime: candles[index - 1].time,
            beforeTime: candle.time,
            missingIntervals: Math.max(
              1,
              Math.floor(
                (candle.time - candles[index - 1].time) / expected,
              ) - 1,
            ),
          },
        ]
      : [],
  );
}
export function createReplaySession(input: {
  id: string;
  symbol: string;
  timeframe: CandleTimeframe;
  rangeStartMs: number;
  rangeEndMs: number;
  startedAt: number;
  speed?: ReplaySpeed;
  candles: ReadonlyArray<Candle>;
}): ReplaySession {
  if (!input.id || !validateReplayRange(input.rangeStartMs, input.rangeEndMs))
    throw new Error("Invalid replay range.");
  const cursor = input.candles.length ? 0 : -1;
  return Object.freeze({
    id: input.id,
    symbol: input.symbol,
    timeframe: input.timeframe,
    status: input.candles.length ? "ready" : "ended",
    startedAt: input.startedAt,
    rangeStartMs: input.rangeStartMs,
    rangeEndMs: input.rangeEndMs,
    cursorIndex: cursor,
    cursorTimeMs: cursor < 0 ? null : input.candles[0].time * 1_000,
    previousCursorTimeMs: null,
    transitionKind: "session-start",
    speed: input.speed ?? 1,
    candlesLoaded: input.candles.length,
    visibleCandles: cursor + 1,
    error: null,
  });
}
export const replayPrefix = (
  candles: ReadonlyArray<Candle>,
  cursor: number,
): ReadonlyArray<Candle> =>
  Object.freeze(
    candles.slice(0, clampReplayCursor(cursor, candles.length) + 1),
  );

/**
 * Returns the newest candle whose opening timestamp is not after the requested
 * instant. A missing result means the instant predates all retained candles.
 */
export function replayCursorAtOrBefore(
  candles: ReadonlyArray<Candle>,
  timestampMs: number,
): number | null {
  if (!candles.length || !Number.isFinite(timestampMs)) return null;
  let low = 0;
  let high = candles.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (candles[middle].time * 1_000 <= timestampMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found < 0 ? null : found;
}

export function jumpReplay(
  session: ReplaySession,
  candles: ReadonlyArray<Candle>,
  index: number,
  transitionKind: ReplayTransitionKind = "jump",
): ReplaySession {
  const cursor = clampReplayCursor(index, candles.length);
  const ended = cursor === candles.length - 1;
  return Object.freeze({
    ...session,
    previousCursorTimeMs: session.cursorTimeMs,
    transitionKind,
    cursorIndex: cursor,
    cursorTimeMs: cursor < 0 ? null : candles[cursor].time * 1_000,
    visibleCandles: cursor + 1,
    status: ended ? "ended" : "paused",
  });
}
export const stepReplay = (
  session: ReplaySession,
  candles: ReadonlyArray<Candle>,
  delta: 1 | -1,
) =>
  jumpReplay(
    session,
    candles,
    session.cursorIndex + delta,
    delta === 1 ? "next" : "previous",
  );
export const jumpReplayToTimestamp = (
  session: ReplaySession,
  candles: ReadonlyArray<Candle>,
  timestampMs: number,
) =>
  jumpReplay(
    session,
    candles,
    replayCursorAtOrBefore(candles, timestampMs) ?? 0,
    "jump",
  );
export const progressReplay = (
  session: ReplaySession,
  candles: ReadonlyArray<Candle>,
) => {
  if (session.status !== "playing") return session;
  const cursor = clampReplayCursor(session.cursorIndex + 1, candles.length);
  const ended = cursor >= candles.length - 1;
  return Object.freeze({
    ...session,
    previousCursorTimeMs: session.cursorTimeMs,
    transitionKind: "timer" as const,
    cursorIndex: cursor,
    cursorTimeMs: cursor < 0 ? null : candles[cursor].time * 1_000,
    visibleCandles: cursor + 1,
    status: ended ? ("ended" as const) : ("playing" as const),
  });
};
export function createReplaySnapshot(input: {
  session: ReplaySession;
  candles: ReadonlyArray<Candle>;
  strategy: StrategySettings;
  risk: RiskSettings;
  orderFlowAvailability?: ReplayDataAvailability;
}): ReplaySnapshot {
  const prefix = replayPrefix(input.candles, input.session.cursorIndex);
  const latest = prefix.at(-1) ?? null;
  const analysis = analyzeStrategy([...prefix], input.strategy);
  const brain = latest
    ? createDizyBrainSnapshot({
        analysis,
        strategy: input.strategy,
        risk: input.risk,
        latestClosedCandleTime: latest.time,
        provenance: {
          source: "replay",
          sessionId: input.session.id,
          replayTimestampMs: latest.time * 1_000,
        },
      })
    : null;
  return Object.freeze({
    sessionId: input.session.id,
    symbol: input.session.symbol,
    timeframe: input.session.timeframe,
    cursorIndex: input.session.cursorIndex,
    cursorTimeMs: latest ? latest.time * 1_000 : null,
    candlesVisible: prefix.length,
    latestCandle: latest ? Object.freeze({ ...latest }) : null,
    signalAnalysis: analysis,
    dizyBrainSnapshot: brain,
    orderFlowAvailability: input.orderFlowAvailability ?? "unavailable",
  });
}
export class ReplayRequestGate {
  private generation = 0;
  begin() {
    return ++this.generation;
  }
  cancel() {
    this.generation += 1;
  }
  accept(id: number, identity: string, currentIdentity: string) {
    return id === this.generation && identity === currentIdentity;
  }
}
