import test from "node:test";
import assert from "node:assert/strict";
import { captureHistoricalReplayMemory } from "../app/lib/historical-replay-memory.ts";
import {
  buildDizyBrainTradeReview,
  computeTradeReviewContentHash,
  historicalTradeCandleBoundaries,
  tradeReviewFreshness,
  tradeReviewInputHash,
  validateDizyBrainTradeReview,
} from "../app/lib/dizybrain-trade-review.ts";

const base = 1_700_000_040;
const baseCandles = Array.from({length: 9}, (_, index) => ({
  time: base + index * 60, open: 100 + index, high: 102 + index,
  low: 99 + index, close: 101 + index, volume: 10,
}));
function fixture(direction = "long", options = {}) {
  const signalIndex = options.signalIndex ?? 2;
  const entryIndex = options.entryIndex ?? 3;
  const exitIndex = options.exitIndex ?? 6;
  const candles = (options.candles ?? baseCandles).map((candle) => ({...candle}));
  const signalTimeMs = (base + signalIndex * 60) * 1_000;
  const entryTimeMs = (base + entryIndex * 60) * 1_000;
  const exitTimeMs = (base + exitIndex * 60) * 1_000;
  const tradeId = "jt1|fixture";
  const entryPrice = options.entryPrice ?? 103.5;
  const exitPrice = options.exitPrice ?? (entryIndex === exitIndex ? entryPrice : 106.5);
  const memory = captureHistoricalReplayMemory({
    tradeId, replaySessionId: `journal-replay|${tradeId}`, marketKey: "mexc:futures:BTC_USDT",
    symbol: "BTC_USDT", timeframe: "1m", signalTimeMs, entryTimeMs, exitTimeMs,
    entryPrice, exitPrice, direction, strategyVersion: "paper-v1", candles,
    capturedAtMs: (base + 600) * 1_000,
  });
  const trade = {
    tradeId, symbol: "BTC_USDT", market: "MEXC Futures", timeframe: "1m", direction,
    entry: entryPrice, exit: exitPrice, stop: 101, target: 108, positionSize: 2, riskPct: 1,
    leverage: 3, marginMode: null, fees: null, pnl: direction === "long" ? 6 : -6,
    pnlPct: direction === "long" ? 2.9 : -2.9, rMultiple: null,
    openTime: new Date(entryTimeMs).toISOString(), closeTime: new Date(exitTimeMs).toISOString(),
    closeReason: options.closeReason ?? "manual", strategyVersion: "paper-v1",
    replay: {sessionId: `journal-replay|${tradeId}`, marketKey: memory.marketKey, symbol: memory.symbol,
      timeframe: memory.timeframe, entryTimeMs, available: true, source: "retained-memory",
      memoryId: memory.id, capturedRangeStartMs: memory.rangeStartMs, capturedRangeEndMs: memory.rangeEndMs,
      candleCount: memory.candles.length, integrityWarnings: [], brainAvailable: false,
      flowAvailability: "capture-not-supported"},
    brain: null, signal: {direction, signalTime: new Date(signalTimeMs).toISOString(), label: "confirmed"},
    dizyBrainReview: {available: false, reviewId: null, engineVersion: null, generatedAt: null,
      generatedFromHash: null, reviewConfidence: null},
  };
  return {memory, entry: {id: "journal-1", schemaVersion: 4, type: "trade-review",
    createdAt: "2024-01-01T00:00:00Z", editedAt: "2024-01-01T00:00:00Z", title: "ignored",
    archived: false, archivedAt: null, notes: "private note", tags: ["breakout"], dismissedPrompts: [],
    quality: "good", planDiscipline: "completely", mood: "fomo", trade, marketContext: null}};
}
const build = (entry, memory) => buildDizyBrainTradeReview({journalEntry: entry, replayMemory: memory, generatedAt: "2024-02-01T00:00:00Z"});
const referenced = (entry, review) => ({...entry, trade: {...entry.trade, dizyBrainReview: {
  available: true, reviewId: review.id, engineVersion: review.engineVersion, generatedAt: review.createdAt,
  generatedFromHash: review.generatedFromHash, reviewConfidence: review.reviewConfidence,
}}});

test("review is deterministic, serializable, and ignores title/archive/note text", () => {
  const {entry, memory} = fixture(), review = build(entry, memory);
  assert.deepEqual(review, build({...entry, title: "changed", archived: true, notes: "another note"}, memory));
  assert.equal(review.generatedFromHash, tradeReviewInputHash(entry, memory));
  assert.equal(review.reviewContentHash, computeTradeReviewContentHash(review));
  assert.doesNotThrow(() => validateDizyBrainTradeReview(JSON.parse(JSON.stringify(review))));
  assert.equal(JSON.stringify(review).includes("private note"), false);
});

test("evidence completeness is separate from execution quality", () => {
  const {entry, memory} = fixture(), review = build(entry, memory);
  assert.equal(review.scores.riskEvidenceCompleteness, 100);
  assert.equal(review.scores.riskExecutionScore, null);
  assert.equal(review.risk.assessment, "unavailable");
  assert.equal(review.scores.setupEvidenceCompleteness, 25);
  assert.equal(review.scores.setupQualityScore, null);
  assert.equal(review.setup.assessment, "unavailable");
  assert.equal(review.scores.exitExecutionScore, null);
  assert.equal(review.scores.availableExecutionComponents, 3);
});

test("liquidation is descriptive and never receives perfect exit execution", () => {
  const {entry, memory} = fixture("long", {closeReason: "liquidation"}), review = build(entry, memory);
  assert.equal(review.exit.timing, "liquidation");
  assert.equal(review.risk.liquidation, true);
  assert.equal(review.exit.qualityScore, null);
  assert.equal(review.scores.exitExecutionScore, null);
});

test("profitability never changes execution scores", () => {
  const {entry, memory} = fixture(), first = build(entry, memory);
  const second = build({...entry, trade: {...entry.trade, pnl: -999, pnlPct: -99}}, memory);
  assert.deepEqual(first.scores, second.scores);
  assert.notEqual(first.outcome.classification, second.outcome.classification);
});

test("strict excursion excludes the entry candle and begins with the first post-entry candle", () => {
  const candles = baseCandles.map((candle, index) => index === 3 ? {...candle, high: 150, low: 50} : candle);
  const {entry, memory} = fixture("long", {candles}), boundaries = historicalTradeCandleBoundaries(memory);
  const review = build(entry, memory);
  assert.equal(boundaries.strictPostEntryCandles[0].time * 1_000, memory.entryTimeMs + 60_000);
  assert.equal(review.excursion.source, "post-entry-closed-candles");
  assert.equal(review.excursion.mfe, 4.5);
  assert.equal(review.excursion.mae, 0.5);
  assert.equal(review.excursion.entryCandlePotential.favourable, 46.5);
  assert.equal(review.excursion.entryCandlePotential.uncertain, true);
});

test("strict long and short excursion calculations exclude post-exit candles", () => {
  const long = fixture("long"), short = fixture("short");
  const longReview = build(long.entry, long.memory), shortReview = build(short.entry, short.memory);
  assert.equal(longReview.excursion.mfe, 4.5);
  assert.equal(longReview.excursion.mae, 0.5);
  assert.equal(shortReview.excursion.mfe, 0.5);
  assert.equal(shortReview.excursion.mae, 4.5);
  assert.equal(longReview.excursion.peakFavourablePrice, 108);
});

test("same-candle trade has unavailable strict excursion without fabricated intrabar order", () => {
  const {entry, memory} = fixture("long", {entryIndex: 3, exitIndex: 3, exitPrice: 103.5});
  const review = build(entry, memory);
  assert.equal(review.excursion.source, "unavailable");
  assert.equal(review.excursion.mfe, null);
  assert.equal(review.excursion.mae, null);
  assert.equal(review.outcome.mfe, null);
  assert.ok(review.limitations.some((item) => item.code === "STRICT_EXCURSION_UNAVAILABLE"));
});

test("server-authoritative freshness ignores title/archive but detects relevant process inputs", () => {
  const {entry, memory} = fixture(), review = build(entry, memory), current = referenced(entry, review);
  assert.equal(tradeReviewFreshness(current, memory).stale, false);
  assert.equal(tradeReviewFreshness({...current, title: "new", archived: true}, memory).stale, false);
  for (const changed of [
    {...current, quality: "poor"}, {...current, planDiscipline: "no"}, {...current, mood: "calm"},
    {...current, tags: ["different"]}, {...current, notes: ""},
  ]) assert.equal(tradeReviewFreshness(changed, memory).stale, true);
  assert.equal(tradeReviewFreshness({...current, trade: {...current.trade, dizyBrainReview: {...current.trade.dizyBrainReview, engineVersion: "old"}}}, memory).stale, true);
  const changedCandles = baseCandles.map((candle, index) => index === 8 ? {...candle, volume: 11} : candle);
  const changedMemory = fixture("long", {candles: changedCandles}).memory;
  assert.equal(changedMemory.id, memory.id);
  assert.notEqual(changedMemory.integrity.contentHash, memory.integrity.contentHash);
  assert.equal(tradeReviewFreshness(current, changedMemory).stale, true);
});

test("stored-review validation rejects deterministic tampering", () => {
  const {entry, memory} = fixture(), review = build(entry, memory);
  const mutations = [
    (value) => { value.entry.qualityScore = 99; },
    (value) => { value.confidenceBand = "insufficient"; },
    (value) => { value.findings[0].code = "TAMPERED_CODE"; },
    (value) => { value.findings[0].evidence[0].source = "external"; },
    (value) => { value.outcome.pnl = Number.NaN; },
    (value) => { value.symbol = "ETH_USDT"; },
    (value) => { value.id = "dbr1_0000000000000000000000000000000000000000"; },
    (value) => { value.reviewContentHash = "0".repeat(64); },
    (value) => { value.findings.push({...value.findings[0]}); },
    (value) => { value.candles = []; },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(review);
    mutate(value);
    assert.throws(() => validateDizyBrainTradeReview(value));
  }
});

test("trade and replay identity mismatches fail safely", () => {
  const {entry, memory} = fixture();
  assert.throws(() => build({...entry, trade: {...entry.trade, symbol: "ETH_USDT"}}, memory), /do not match exactly/);
  assert.throws(() => build({...entry, trade: {...entry.trade, replay: {...entry.trade.replay, memoryId: "hrm1_bad"}}}, memory), /does not reference/);
});
