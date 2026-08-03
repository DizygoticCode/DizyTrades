import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_RISK, DEFAULT_STRATEGY } from "../app/lib/config.ts";
import {
  historicalTradeCandleBoundaries,
} from "../app/lib/dizybrain-trade-review.ts";
import {
  buildHistoricalFlowReplayView,
  eventsForReplayWindow,
  selectHistoricalFlowSample,
} from "../app/lib/historical-dizyflow-replay.ts";
import {
  captureHistoricalReplayMemory,
  ReplayMemoryValidationError,
} from "../app/lib/historical-replay-memory.ts";
import { journalReplayCursor } from "../app/lib/journal-trade-import.ts";
import {
  createReplaySession,
  createReplaySnapshot,
  jumpReplay,
  jumpReplayToTimestamp,
  replayRangeForCandles,
} from "../app/lib/replay.ts";

const candle = (time, close = 100) => ({
  time,
  open: close,
  high: close + 2,
  low: close - 2,
  close,
  volume: 10,
});
const replayCandles = [
  candle(60, 100),
  candle(120, 101),
  candle(240, 103),
];

function replaySession(candles = replayCandles) {
  return createReplaySession({
    id: "future-audit",
    symbol: "BTC_USDT",
    timeframe: "1m",
    ...replayRangeForCandles(candles, "1m"),
    startedAt: 1,
    candles,
  });
}

const flowSample = (timeMs, availability = "available") => ({
  timeMs,
  inputHash: "fnv1a-12345678",
  referencePrice: 100,
  referencePriceSource: "mark",
  availability,
  intelligenceConfidence: 80,
  confidenceBand: "high",
  spreadPct: 0.1,
  depthBands: [],
  nearestBidWall: null,
  nearestAskWall: null,
  tradeFlowImbalance: null,
  findingCodes: [],
  limitationCodes: [],
});
const flowEvent = (id, timeMs) => ({
  id,
  timeMs,
  type: "feed-stale",
  side: null,
  price: null,
  sourceFindingCode: null,
  inputHash: "fnv1a-12345678",
  confidence: 50,
});

function retainedMemory(extraCandles = []) {
  return captureHistoricalReplayMemory({
    tradeId: "trade-audit",
    replaySessionId: "journal-replay|trade-audit",
    marketKey: "mexc:futures:BTC_USDT",
    symbol: "BTC_USDT",
    timeframe: "1m",
    signalTimeMs: 120_000,
    entryTimeMs: 180_000,
    exitTimeMs: 300_000,
    entryPrice: 100,
    exitPrice: 100,
    direction: "long",
    strategyVersion: "audit-v1",
    candles: [60, 120, 180, 240, 300, 360, ...extraCandles].map((time) =>
      candle(time),
    ),
    capturedAtMs: 420_000,
  });
}

test("paused Replay analysis is invariant to appended future candles", () => {
  const atSecond = jumpReplay(replaySession(), replayCandles, 1);
  const baseline = createReplaySnapshot({
    session: atSecond,
    candles: replayCandles,
    strategy: DEFAULT_STRATEGY,
    risk: DEFAULT_RISK,
  });
  const withFuture = createReplaySnapshot({
    session: atSecond,
    candles: [...replayCandles, candle(300, 9_999), candle(360, 1)],
    strategy: DEFAULT_STRATEGY,
    risk: DEFAULT_RISK,
  });
  assert.deepEqual(withFuture, baseline);
  assert.equal(baseline.cursorTimeMs, 120_000);
  assert.ok(
    baseline.signalAnalysis.tradeSignals.every((signal) => signal.time <= 120),
  );
});

test("timestamp jumps and Journal launches select exact-or-prior candles", () => {
  assert.equal(
    jumpReplayToTimestamp(replaySession(), replayCandles, 239_999).cursorIndex,
    1,
  );
  const loaded = {
    marketKey: "mexc:futures:BTC_USDT",
    symbol: "BTC_USDT",
    timeframe: "1m",
    candles: replayCandles,
  };
  const request = {
    marketKey: loaded.marketKey,
    symbol: loaded.symbol,
    timeframe: loaded.timeframe,
    timestampMs: 239_999,
  };
  assert.equal(journalReplayCursor(request, loaded), 1);
  assert.ok(loaded.candles[1].time * 1_000 <= request.timestampMs);
  assert.ok(loaded.candles[2].time * 1_000 > request.timestampMs);
});

test("Historical DizyFlow never substitutes a future sample or event", () => {
  const samples = [flowSample(1_000), flowSample(2_000, "stale")];
  assert.equal(
    selectHistoricalFlowSample({ samples, replayTimeMs: 1_999 }).sample,
    samples[0],
  );
  assert.equal(
    selectHistoricalFlowSample({ samples, replayTimeMs: 999 }).sample,
    null,
  );
  const events = [flowEvent("past", 1_500), flowEvent("now", 2_000), flowEvent("future", 2_001)];
  assert.deepEqual(
    eventsForReplayWindow({
      events,
      previousReplayTimeMs: 1_000,
      replayTimeMs: 2_000,
    }).map((event) => event.id),
    ["past", "now"],
  );
  assert.deepEqual(
    eventsForReplayWindow({
      events,
      previousReplayTimeMs: 2_000,
      replayTimeMs: 1_500,
    }),
    [],
  );
});

test("Historical DizyFlow view carries only evidence available at the Replay cursor", () => {
  const samples = [flowSample(1_000), flowSample(2_000)];
  const events = [flowEvent("seen", 1_500), flowEvent("future", 2_500)];
  const memory = {
    samples,
    events,
  };
  const view = buildHistoricalFlowReplayView(memory, 2_000, 1_000);
  assert.equal(view.sample, samples[1]);
  assert.deepEqual(view.eventsAtStep.map((event) => event.id), ["seen"]);
});

test("retained Replay Memory excludes forming candles and rejects post-capture candles", () => {
  const memory = retainedMemory([420]);
  assert.equal(memory.candles.at(-1).time, 360);
  assert.ok(memory.candles.every((item) => item.time * 1_000 + 60_000 <= 420_000));
  assert.throws(
    () => retainedMemory([480]),
    (error) =>
      error instanceof ReplayMemoryValidationError &&
      error.code === "FUTURE_CANDLE",
  );
});

test("historical trade review exposes exact prefixes and isolates post-exit hindsight", () => {
  const boundaries = historicalTradeCandleBoundaries(retainedMemory());
  assert.equal(boundaries.candlesThroughSignal.at(-1).time, 120);
  assert.equal(boundaries.candlesThroughEntry.at(-1).time, 180);
  assert.equal(boundaries.candlesThroughExit.at(-1).time, 300);
  assert.deepEqual(
    boundaries.candlesDuringTrade.map((item) => item.time),
    [180, 240, 300],
  );
  assert.deepEqual(
    boundaries.strictPostEntryCandles.map((item) => item.time),
    [240, 300],
  );
  assert.deepEqual(
    boundaries.candlesAfterExit.map((item) => item.time),
    [360],
  );
  assert.ok(
    boundaries.candlesThroughEntry.every((item) => item.time <= 180),
  );
  assert.ok(boundaries.candlesThroughExit.every((item) => item.time <= 300));
});
