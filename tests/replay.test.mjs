import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  clampReplayCursor,
  createReplaySession,
  createReplaySnapshot,
  detectReplayGaps,
  jumpReplay,
  jumpReplayToTimestamp,
  prepareReplayCandles,
  progressReplay,
  replayCursorAtOrBefore,
  replayDelayMs,
  replayIdentityChanged,
  replayPrefix,
  replayRangeForCandles,
  ReplayRequestGate,
  stepReplay,
} from "../app/lib/replay.ts";
import { DEFAULT_RISK, DEFAULT_STRATEGY } from "../app/lib/config.ts";

const candle = (time, close = time) => ({
  time,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 1,
});
const candles = [candle(60), candle(120), candle(240)];
const session = (items = candles) =>
  createReplaySession({
    id: "r1",
    symbol: "BTC_USDT",
    timeframe: "1m",
    rangeStartMs: 60_000,
    rangeEndMs: 240_000,
    startedAt: 1,
    candles: items,
  });

test("creates serializable sessions and handles empty and one-candle history", () => {
  assert.equal(session().cursorIndex, 0);
  assert.equal(session([]).status, "ended");
  assert.equal(session([candles[0]]).candlesLoaded, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(session())), session());
});

test("enter-range derivation makes a one-candle replay valid", () => {
  const range = replayRangeForCandles([candles[0]], "1m");
  const one = createReplaySession({
    id: "one",
    symbol: "BTC_USDT",
    timeframe: "1m",
    ...range,
    startedAt: 1,
    candles: [candles[0]],
  });
  assert.deepEqual(range, { rangeStartMs: 60_000, rangeEndMs: 120_000 });
  assert.equal(one.status, "ready");
});

test("symbol and timeframe changes invalidate the replay identity", () => {
  const active = { ...session(), status: "playing" };
  assert.equal(replayIdentityChanged(active, "ETH_USDT", "1m"), true);
  assert.equal(replayIdentityChanged(active, "BTC_USDT", "5m"), true);
  assert.equal(replayIdentityChanged(active, "BTC_USDT", "1m"), false);
});

test("terminal identity lifecycle exits, clears candles, stops timers and labels the session identity", () => {
  const source = readFileSync(
    new URL("../app/trading-terminal.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /replayIdentityChanged\(replaySession,symbol,timeframe as CandleTimeframe\)/,
  );
  assert.match(source, /setTimeout\(exitReplay,0\)/);
  assert.match(
    source,
    /setReplaySession\(null\);setReplayCandles\(\[\]\);.*setViewportReset/,
  );
  assert.match(source, /clearTimeout\(replayTimer\.current\)/);
  assert.match(
    source,
    /activeReplaySession\.symbol} · {activeReplaySession\.timeframe}/,
  );
});

test("rejects invalid ranges", () =>
  assert.throws(() =>
    createReplaySession({
      id: "r",
      symbol: "BTC_USDT",
      timeframe: "1m",
      rangeStartMs: 2,
      rangeEndMs: 1,
      startedAt: 1,
      candles: [],
    }),
  ));

test("clamps, steps, jumps and ends deterministically", () => {
  assert.equal(clampReplayCursor(99, 3), 2);
  assert.equal(stepReplay(session(), candles, 1).cursorIndex, 1);
  assert.equal(stepReplay(session(), candles, -1).cursorIndex, 0);
  assert.equal(jumpReplay(session(), candles, 99).status, "ended");
  assert.equal(jumpReplayToTimestamp(session(), candles, 121_000).cursorIndex, 1);
  assert.equal(
    progressReplay({ ...session(), status: "playing" }, candles).cursorIndex,
    1,
  );
});

test("timestamp selection never advances into a future candle", () => {
  assert.equal(replayCursorAtOrBefore(candles, 59_999), null);
  assert.equal(replayCursorAtOrBefore(candles, 60_000), 0);
  assert.equal(replayCursorAtOrBefore(candles, 121_000), 1);
  assert.equal(replayCursorAtOrBefore(candles, 239_999), 1);
  assert.equal(replayCursorAtOrBefore(candles, 999_999), 2);
});

test("maps playback speeds", () => {
  assert.equal(replayDelayMs(0.25), 4_000);
  assert.equal(replayDelayMs(10), 100);
});

test("validates, sorts, deduplicates and reports gaps without fabrication", () => {
  const ready = prepareReplayCandles(
    [candles[2], candles[0], candles[0]],
    { symbol: "BTC_USDT", timeframe: "1m" },
  );
  assert.deepEqual(
    ready.map((item) => item.time),
    [60, 240],
  );
  assert.equal(detectReplayGaps(ready, "1m")[0].missingIntervals, 2);
  assert.throws(() =>
    prepareReplayCandles(
      [{ ...candles[0], close: Infinity }],
      { symbol: "BTC_USDT", timeframe: "1m" },
    ),
  );
  assert.throws(() =>
    prepareReplayCandles(
      candles,
      { symbol: "BTC_USDT", timeframe: "1m" },
      { symbol: "ETH_USDT" },
    ),
  );
});

test("request gate rejects stale and changed identities", () => {
  const gate = new ReplayRequestGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(gate.accept(first, "a", "a"), false);
  assert.equal(gate.accept(second, "a", "b"), false);
  assert.equal(gate.accept(second, "a", "a"), true);
});

test("snapshot prefix is invariant to appended future data", () => {
  const atOne = jumpReplay(session(), candles, 1);
  const current = createReplaySnapshot({
    session: atOne,
    candles,
    strategy: DEFAULT_STRATEGY,
    risk: DEFAULT_RISK,
  });
  const appended = createReplaySnapshot({
    session: atOne,
    candles: [...candles, candle(300, 9_999)],
    strategy: DEFAULT_STRATEGY,
    risk: DEFAULT_RISK,
  });
  assert.equal(replayPrefix(candles, 1).length, 2);
  assert.deepEqual(current, appended);
  assert.equal(current.dizyBrainSnapshot.provenance.source, "replay");
  assert.equal(
    current.dizyBrainSnapshot.provenance.replayTimestampMs,
    120_000,
  );
  assert.ok(
    current.signalAnalysis.tradeSignals.every((signal) => signal.time <= 120),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(current)), current);
});

test("playing progression remains latched until the final candle", () => {
  const items = [candle(1), candle(2), candle(3)];
  const range = replayRangeForCandles(items, "1m");
  let current = createReplaySession({
    id: "latched",
    symbol: "BTC_USDT",
    timeframe: "1m",
    ...range,
    startedAt: 1,
    candles: items,
  });
  current = { ...current, status: "playing" };
  current = progressReplay(current, items);
  assert.equal(current.cursorIndex, 1);
  assert.equal(current.status, "playing");
  current = progressReplay(current, items);
  assert.equal(current.cursorIndex, 2);
  assert.equal(current.status, "ended");
  assert.equal(progressReplay(current, items).cursorIndex, 2);
});

test("records authoritative Replay cursor transitions", () => {
  const items = [candle(1), candle(2), candle(3)];
  const range = replayRangeForCandles(items, "1m");
  let current = createReplaySession({
    id: "transitions",
    symbol: "BTC_USDT",
    timeframe: "1m",
    ...range,
    startedAt: 1,
    candles: items,
  });
  assert.equal(current.previousCursorTimeMs, null);
  current = { ...current, status: "playing" };
  current = progressReplay(current, items);
  assert.equal(current.previousCursorTimeMs, 1_000);
  assert.equal(current.cursorTimeMs, 2_000);
  assert.equal(current.transitionKind, "timer");
  current = stepReplay(current, items, -1);
  assert.equal(current.previousCursorTimeMs, 2_000);
  assert.equal(current.cursorTimeMs, 1_000);
  assert.equal(current.transitionKind, "previous");
});

test("terminal playback uses one self-terminating timeout per cursor", () => {
  const source = readFileSync(
    new URL("../app/trading-terminal.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /const schedule=/);
  assert.match(source, /current\.status!=="playing"/);
  assert.match(source, /activeReplaySession\?\.cursorIndex/);
  assert.match(source, /signal:controller\.signal/);
  assert.match(source, /historicalFlowRequest\.current/);
});
