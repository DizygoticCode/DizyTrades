import { createHash } from "node:crypto";
import { CANDLE_TIMEFRAMES, type CandleTimeframe } from "./market/types";
import type { Candle } from "./strategy";
import {
  validateHistoricalReplayMemory,
  type HistoricalReplayMemory,
} from "./historical-replay-memory";
import type { JournalEntry, TradeSnapshot } from "./journal-model";

export const DIZYBRAIN_TRADE_REVIEW_SCHEMA_VERSION = 1 as const;
export const DIZYBRAIN_TRADE_REVIEW_ENGINE_VERSION = "historical-trade-review/1.1.0" as const;
export const DIZYBRAIN_TRADE_REVIEW_CONFIG_VERSION = 2 as const;
export const MINIMUM_EXECUTION_SCORE_COMPONENTS = 3;
export const MAX_TRADE_REVIEW_BYTES = 128_000;
export const MAX_TRADE_REVIEWS_PER_USER = 2_000;
export const MAX_TRADE_REVIEW_BYTES_PER_USER = 64 * 1024 * 1024;

export type ReviewAssessment = "strong" | "acceptable" | "mixed" | "weak" | "unavailable";
export type TradeAlignment = "aligned" | "counter" | "transition" | "neutral" | "unavailable";
export type TradeEntryTiming = "early" | "confirmed" | "late" | "extended" | "unavailable";
export type TradeExitTiming = "planned" | "early" | "late" | "stop" | "liquidation" | "manual" | "signal-reversal" | "unavailable";
export type ReviewConfidenceBand = "high" | "moderate" | "limited" | "insufficient";
export type ExcursionSource = "post-entry-closed-candles" | "entry-at-open-confirmed" | "unavailable";
export type FindingCategory = "setup" | "signal" | "trend" | "entry" | "risk" | "exit" | "process" | "outcome" | "data-quality";
export type FindingSeverity = "positive" | "neutral" | "caution" | "warning";
export type EvidenceSource = "trade" | "replay-memory" | "signal" | "brain" | "journal";

export type TradeReviewEvidencePoint = Readonly<{
  label: string;
  value: string | number | boolean | null;
  timestampMs: number | null;
  source: EvidenceSource;
}>;
export type TradeReviewFinding = Readonly<{
  code: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  summary: string;
  evidence: readonly TradeReviewEvidencePoint[];
  confidence: number;
  deterministic: true;
}>;
export type TradeReviewLimitation = Readonly<{
  code: string;
  message: string;
  severity: "info" | "caution";
}>;
export type TradeReviewProvenance = Readonly<{
  replayMemorySource: "terminal-closed-candle-buffer";
  replayMemoryServerValidated: true;
  replayMemoryContentHash: string;
  replayMemorySchemaVersion: number;
  replayMemoryValidationVersion: number;
  closedCandlesOnly: true;
  entryCovered: boolean;
  exitCovered: boolean;
  signalSnapshotSource: "authoritative-trade-reference" | "unavailable";
  brainSnapshotSource: "unavailable";
  chartContextSource: "captured-metadata" | "unavailable";
  flowContextSource: "captured-snapshot" | "unavailable" | "capture-not-supported";
  excursionSource: ExcursionSource;
}>;
export type TradeReviewEvidenceAvailability = Readonly<{
  replayMemory: boolean;
  candleCount: number;
  signalContext: boolean;
  brainContext: boolean;
  strategyContext: boolean;
  chartContext: boolean;
  flowContext: boolean;
  stopKnown: boolean;
  targetKnown: boolean;
  positionSizeKnown: boolean;
  riskPctKnown: boolean;
  leverageKnown: boolean;
  feesKnown: boolean;
  rMultipleKnown: boolean;
  journalQualityAssessment: boolean;
  journalPlanAssessment: boolean;
  journalMood: boolean;
  journalNotes: boolean;
  journalTags: boolean;
}>;
type Component = Readonly<{
  assessment: ReviewAssessment;
  evidenceCompleteness: number;
  qualityScore: number | null;
  reasonCodes: readonly string[];
  confidence: number;
  limitations: readonly string[];
}>;
export type TradeExcursionReview = Readonly<{
  source: ExcursionSource;
  mfe: number | null;
  mae: number | null;
  mfePct: number | null;
  maePct: number | null;
  mfeR: number | null;
  maeR: number | null;
  barsToMfe: number | null;
  barsToMae: number | null;
  peakFavourablePrice: number | null;
  peakAdversePrice: number | null;
  entryCandlePotential: Readonly<{
    uncertain: true;
    favourable: number;
    adverse: number;
    reason: "intrabar-order-unavailable";
  }>;
}>;
export type TradeReviewScores = Readonly<{
  setupEvidenceCompleteness: number;
  signalEvidenceCompleteness: number;
  trendEvidenceCompleteness: number;
  entryEvidenceCompleteness: number;
  riskEvidenceCompleteness: number;
  exitEvidenceCompleteness: number;
  processEvidenceCompleteness: number;
  setupQualityScore: number | null;
  signalConsistencyScore: number | null;
  trendAlignmentScore: number | null;
  entryExecutionScore: number | null;
  riskExecutionScore: number | null;
  exitExecutionScore: number | null;
  processCompletenessScore: number | null;
  evidenceBasedExecutionScore: number | null;
  availableExecutionComponents: number;
  minimumExecutionComponents: number;
}>;
export type DizyBrainTradeReview = Readonly<{
  id: string;
  schemaVersion: 1;
  engineVersion: string;
  createdAt: string;
  source: "historical-replay-memory";
  journalEntryId: string;
  tradeId: string;
  replayMemoryId: string;
  marketKey: string;
  symbol: string;
  timeframe: CandleTimeframe;
  signalTimeMs: number | null;
  entryTimeMs: number;
  exitTimeMs: number;
  provenance: TradeReviewProvenance;
  evidence: TradeReviewEvidenceAvailability;
  setup: Component & Readonly<{strategyVersion: string | null; direction: "long" | "short"; configuredConfluenceThreshold: number | null}>;
  signal: Component & Readonly<{direction: "long" | "short" | null; presentOnExactCandle: boolean; directionConsistent: boolean | null; ageMs: number | null; barsFromSignal: number | null; entryOnSignalCandle: boolean | null; confluenceScore: number | null; thresholdMet: boolean | null}>;
  trend: Component & Readonly<{alignment: TradeAlignment; directionAtSignal: null; directionAtEntry: null; higherTimeframeAvailable: false}>;
  entry: Component & Readonly<{timing: TradeEntryTiming; barsFromSignal: number | null; millisecondsFromSignal: number | null; distanceFromSignalClose: number | null; rangePosition: number; priorDirectionalCandles: number; extended: boolean}>;
  excursion: TradeExcursionReview;
  risk: Component & Readonly<{stop: number | null; target: number | null; positionSize: number | null; riskPct: number | null; leverage: number | null; marginMode: "isolated" | "cross" | null; stopDistance: number | null; targetDistance: number | null; plannedRewardRisk: number | null; liquidation: boolean}>;
  exit: Component & Readonly<{timing: TradeExitTiming; closeReason: string; exitPrice: number; profitRetainedPct: number | null; hindsight: Readonly<{available: boolean; favourableContinuationPct: number | null; adverseMovementPct: number | null}>}>;
  process: Component & Readonly<{quality: string | null; planDiscipline: string | null; mood: string | null; tags: readonly string[]; notesPresent: boolean; observations: readonly string[]}>;
  outcome: Readonly<{classification: "profit" | "loss" | "flat"; pnl: number; pnlPct: number; rMultiple: number | null; fees: number | null; closeReason: string; mfe: number | null; mae: number | null}>;
  scores: TradeReviewScores;
  findings: readonly TradeReviewFinding[];
  limitations: readonly TradeReviewLimitation[];
  reviewConfidence: number;
  confidenceBand: ReviewConfidenceBand;
  confidenceReasons: readonly string[];
  generatedFromHash: string;
  reviewContentHash: string;
}>;

type ReviewWithoutContentHash = Omit<DizyBrainTradeReview, "reviewContentHash">;
export class TradeReviewValidationError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const fail = (code: string, message: string): never => { throw new TradeReviewValidationError(code, message); };
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);
const finiteTime = (value: string) => {
  const result = Date.parse(value);
  return Number.isSafeInteger(result) ? result : fail("INVALID_TRADE_TIME", "Trade timestamp is invalid.");
};
const point = (label: string, value: TradeReviewEvidencePoint["value"], timestampMs: number | null, source: EvidenceSource): TradeReviewEvidencePoint => freeze({label, value, timestampMs, source});
const component = (evidenceCompleteness: number, qualityScore: number | null, reasonCodes: string[], confidence: number, limitations: string[] = []): Component => freeze({
  assessment: qualityScore === null ? "unavailable" : qualityScore >= 80 ? "strong" : qualityScore >= 60 ? "acceptable" : qualityScore >= 40 ? "mixed" : "weak",
  evidenceCompleteness,
  qualityScore,
  reasonCodes: freeze([...reasonCodes].sort()),
  confidence,
  limitations: freeze([...limitations].sort()),
});
const confidenceBandFor = (score: number): ReviewConfidenceBand => score >= 80 ? "high" : score >= 60 ? "moderate" : score >= 35 ? "limited" : "insufficient";
const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[], code: string) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code, "Stored trade review contains unexpected or missing fields.");
};

export function tradeReviewId(input: {journalEntryId: string; tradeId: string; replayMemoryId: string; marketKey: string; symbol: string; timeframe: string; generatedFromHash?: string; engineVersion?: string; schemaVersion?: number}) {
  return `dbr1_${sha({
    namespace: "dizybrain-historical-trade-review",
    journalEntryId: input.journalEntryId,
    tradeId: input.tradeId,
    replayMemoryId: input.replayMemoryId,
    marketKey: input.marketKey,
    symbol: input.symbol,
    timeframe: input.timeframe,
    generatedFromHash: input.generatedFromHash ?? null,
    engineVersion: input.engineVersion ?? DIZYBRAIN_TRADE_REVIEW_ENGINE_VERSION,
    schemaVersion: input.schemaVersion ?? DIZYBRAIN_TRADE_REVIEW_SCHEMA_VERSION,
  }).slice(0, 40)}`;
}
export function tradeReviewInputHash(entry: JournalEntry, memory: HistoricalReplayMemory) {
  return tradeReviewInputHashFromMemoryMetadata(entry,{id:memory.id,contentHash:memory.integrity.contentHash});
}
/** Rechecks review freshness without loading retained candle arrays. */
export function tradeReviewInputHashFromMemoryMetadata(entry:JournalEntry,memory:{id:string;contentHash:string}) {
  const trade = entry.trade ?? fail("TRADE_REQUIRED", "Only completed Trade Review entries can be reviewed.");
  return sha({
    engineVersion: DIZYBRAIN_TRADE_REVIEW_ENGINE_VERSION,
    configVersion: DIZYBRAIN_TRADE_REVIEW_CONFIG_VERSION,
    memoryId: memory.id,
    memoryContentHash: memory.contentHash,
    trade: {
      tradeId: trade.tradeId, symbol: trade.symbol, market: trade.market, timeframe: trade.timeframe,
      direction: trade.direction, entry: trade.entry, exit: trade.exit, stop: trade.stop, target: trade.target,
      positionSize: trade.positionSize, riskPct: trade.riskPct, leverage: trade.leverage, marginMode: trade.marginMode,
      fees: trade.fees, pnl: trade.pnl, pnlPct: trade.pnlPct, rMultiple: trade.rMultiple, openTime: trade.openTime,
      closeTime: trade.closeTime, closeReason: trade.closeReason, strategyVersion: trade.strategyVersion,
      signal: trade.signal, replayMemoryId: trade.replay?.memoryId,
    },
    process: {
      quality: entry.quality, planDiscipline: entry.planDiscipline, mood: entry.mood,
      tags: [...entry.tags].sort(), notesPresent: Boolean(entry.notes.trim()),
    },
  });
}
export function tradeReviewFreshness(entry: JournalEntry, memory: HistoricalReplayMemory) {
  const reference = entry.trade?.dizyBrainReview;
  const currentGeneratedFromHash = tradeReviewInputHash(entry, memory);
  const stale = !reference?.available || reference.generatedFromHash !== currentGeneratedFromHash || reference.engineVersion !== DIZYBRAIN_TRADE_REVIEW_ENGINE_VERSION;
  return freeze({stale, currentGeneratedFromHash});
}
export function computeTradeReviewContentHash(review: ReviewWithoutContentHash | DizyBrainTradeReview) {
  const logical: Record<string, unknown> = {...review};
  delete logical.reviewContentHash;
  return sha(logical);
}

function exactBoundaries(memory: HistoricalReplayMemory, signalMs: number | null, entryMs: number, exitMs: number) {
  const candles = memory.candles;
  const exact = (ms: number, code: string) => {
    const index = candles.findIndex((candle) => candle.time * 1_000 === ms);
    if (index < 0) fail(code, "Required historical candle is absent from retained memory.");
    return index;
  };
  const entryIndex = exact(entryMs, "ENTRY_NOT_COVERED");
  const exitIndex = exact(exitMs, "EXIT_NOT_COVERED");
  const signalIndex = signalMs === null ? null : exact(signalMs, "SIGNAL_NOT_COVERED");
  if (signalIndex !== null && signalIndex > entryIndex) fail("FUTURE_SIGNAL", "Signal candle occurs after entry.");
  if (exitIndex < entryIndex) fail("INVALID_TRADE_RANGE", "Exit candle occurs before entry.");
  return freeze({
    candlesThroughSignal: freeze(signalIndex === null ? [] : candles.slice(0, signalIndex + 1)),
    candlesThroughEntry: freeze(candles.slice(0, entryIndex + 1)),
    candlesThroughExit: freeze(candles.slice(0, exitIndex + 1)),
    candlesDuringTrade: freeze(candles.slice(entryIndex, exitIndex + 1)),
    strictPostEntryCandles: freeze(candles.slice(entryIndex + 1, exitIndex + 1)),
    candlesAfterExit: freeze(candles.slice(exitIndex + 1)),
    entryIndex, exitIndex, signalIndex,
  });
}
export function historicalTradeCandleBoundaries(memory: HistoricalReplayMemory) {
  const valid = validateHistoricalReplayMemory(memory);
  return exactBoundaries(valid, valid.signalTimeMs, valid.entryTimeMs, valid.exitTimeMs);
}
function excursion(trade: TradeSnapshot, entryCandle: Candle, strictCandles: readonly Candle[]): TradeExcursionReview {
  const entryPotentialFavourable = Math.max(0, trade.direction === "long" ? entryCandle.high - trade.entry : trade.entry - entryCandle.low);
  const entryPotentialAdverse = Math.max(0, trade.direction === "long" ? trade.entry - entryCandle.low : entryCandle.high - trade.entry);
  const entryCandlePotential = freeze({uncertain: true as const, favourable: entryPotentialFavourable, adverse: entryPotentialAdverse, reason: "intrabar-order-unavailable" as const});
  if (!strictCandles.length) return freeze({source: "unavailable", mfe: null, mae: null, mfePct: null, maePct: null, mfeR: null, maeR: null, barsToMfe: null, barsToMae: null, peakFavourablePrice: null, peakAdversePrice: null, entryCandlePotential});
  let favourable = -Infinity, adverse = -Infinity, favourablePrice = trade.entry, adversePrice = trade.entry, favourableBar = 0, adverseBar = 0;
  strictCandles.forEach((candle, index) => {
    const currentFavourable = trade.direction === "long" ? candle.high - trade.entry : trade.entry - candle.low;
    const currentAdverse = trade.direction === "long" ? trade.entry - candle.low : candle.high - trade.entry;
    if (currentFavourable > favourable) {
      favourable = currentFavourable;
      favourablePrice = trade.direction === "long" ? candle.high : candle.low;
      favourableBar = index + 1;
    }
    if (currentAdverse > adverse) {
      adverse = currentAdverse;
      adversePrice = trade.direction === "long" ? candle.low : candle.high;
      adverseBar = index + 1;
    }
  });
  const mfe = Math.max(0, favourable), mae = Math.max(0, adverse);
  const initialRisk = trade.stop === null ? null : Math.abs(trade.entry - trade.stop);
  return freeze({
    source: "post-entry-closed-candles", mfe, mae, mfePct: mfe / trade.entry * 100, maePct: mae / trade.entry * 100,
    mfeR: initialRisk ? mfe / initialRisk : null, maeR: initialRisk ? mae / initialRisk : null,
    barsToMfe: favourableBar, barsToMae: adverseBar, peakFavourablePrice: favourablePrice,
    peakAdversePrice: adversePrice, entryCandlePotential,
  });
}
function exitTiming(reason: string): TradeExitTiming {
  const value = reason.toLowerCase();
  if (value.includes("liquid")) return "liquidation";
  if (value.includes("stop")) return "stop";
  if (value.includes("target") || value.includes("take profit")) return "planned";
  if (value.includes("signal") || value.includes("reversal")) return "signal-reversal";
  if (value.includes("manual")) return "manual";
  return "unavailable";
}
function weightedExecution(scores: ReadonlyArray<readonly [number | null, number]>) {
  const available = scores.filter((item): item is readonly [number, number] => item[0] !== null);
  return {
    count: available.length,
    score: available.length >= MINIMUM_EXECUTION_SCORE_COMPONENTS
      ? Math.round(available.reduce((sum, [value, weight]) => sum + value * weight, 0) / available.reduce((sum, [, weight]) => sum + weight, 0))
      : null,
  };
}

export function buildDizyBrainTradeReview(input: {journalEntry: JournalEntry; replayMemory: HistoricalReplayMemory; generatedAt: string}): DizyBrainTradeReview {
  const entry = input.journalEntry;
  const trade = entry.trade ?? fail("TRADE_REQUIRED", "Only completed Trade Review entries can be reviewed.");
  if (entry.type !== "trade-review") fail("TRADE_REQUIRED", "Only completed Trade Review entries can be reviewed.");
  const memory = validateHistoricalReplayMemory(input.replayMemory);
  const createdAt = new Date(input.generatedAt).toISOString();
  const entryMs = finiteTime(trade.openTime), exitMs = finiteTime(trade.closeTime);
  const signalMs = trade.signal ? finiteTime(trade.signal.signalTime) : null;
  const replay = trade.replay;
  if (!replay || !replay.available || replay.source !== "retained-memory" || replay.memoryId !== memory.id) fail("REPLAY_REFERENCE_MISMATCH", "Journal entry does not reference this retained replay memory.");
  const retainedReplay = replay!;
  if (memory.tradeId !== trade.tradeId || memory.marketKey !== retainedReplay.marketKey || memory.symbol !== trade.symbol || memory.timeframe !== trade.timeframe || memory.entryTimeMs !== entryMs || memory.exitTimeMs !== exitMs || memory.entryPrice !== trade.entry || memory.exitPrice !== trade.exit) fail("TRADE_IDENTITY_MISMATCH", "Journal trade facts and retained replay memory do not match exactly.");
  if (!CANDLE_TIMEFRAMES.includes(trade.timeframe as CandleTimeframe)) fail("INVALID_TIMEFRAME", "Trade timeframe is unsupported.");
  if (memory.signalTimeMs !== signalMs) fail("SIGNAL_IDENTITY_MISMATCH", "Journal signal and retained replay memory do not match.");

  const boundaries = exactBoundaries(memory, signalMs, entryMs, exitMs);
  const signalCandle = boundaries.candlesThroughSignal.at(-1) ?? null;
  const entryCandle = boundaries.candlesThroughEntry.at(-1)!;
  const excursionReview = excursion(trade, entryCandle, boundaries.strictPostEntryCandles);
  let priorDirectionalCandles = 0;
  for (let index = boundaries.candlesThroughEntry.length - 1; index >= 0; index -= 1) {
    const candle = boundaries.candlesThroughEntry[index];
    const directional = trade.direction === "long" ? candle.close > candle.open : candle.close < candle.open;
    if (!directional) break;
    priorDirectionalCandles += 1;
  }
  const barsFromSignal = signalMs === null ? null : boundaries.entryIndex - boundaries.signalIndex!;
  const extended = priorDirectionalCandles >= 3;
  const entryTiming: TradeEntryTiming = signalMs === null ? "unavailable" : extended ? "extended" : barsFromSignal! <= 1 ? "confirmed" : "late";
  const signalAvailable = Boolean(memory.signalContext && trade.signal);
  const directionConsistent = signalAvailable ? memory.signalContext!.direction === trade.direction : null;

  const setupEvidence = memory.strategyContext ? 25 : 0;
  const signalEvidence = signalAvailable ? 100 : 0;
  const trendEvidence = 0;
  const entryEvidence = signalCandle ? 100 : 60;
  const riskKnownCount = [trade.stop, trade.target, trade.positionSize, trade.riskPct, trade.leverage].filter((value) => value !== null).length;
  const riskEvidence = riskKnownCount * 20;
  const exitEvidence = trade.closeReason && Number.isFinite(trade.exit) ? 70 : 0;
  const processKnownCount = [entry.quality, entry.planDiscipline, entry.mood, entry.tags.length ? true : null, entry.notes.trim() ? true : null].filter(Boolean).length;
  const processEvidence = processKnownCount * 20;

  const setupQualityScore = null;
  const signalConsistencyScore = directionConsistent === null ? null : directionConsistent ? 100 : 0;
  const trendAlignmentScore = null;
  const entryExecutionScore = signalMs === null ? null : entryTiming === "confirmed" ? 100 : entryTiming === "late" ? 60 : entryTiming === "extended" ? 35 : null;
  const riskExecutionScore = null;
  const exitClass = exitTiming(trade.closeReason);
  // A close-reason category describes the exit but does not prove execution quality.
  const exitExecutionScore = null;
  const processCompletenessScore = processKnownCount ? processEvidence : null;
  const execution = weightedExecution([
    [setupQualityScore, 10], [signalConsistencyScore, 20], [trendAlignmentScore, 10],
    [entryExecutionScore, 25], [riskExecutionScore, 20], [exitExecutionScore, 10], [processCompletenessScore, 5],
  ]);

  const findings: TradeReviewFinding[] = [];
  const addFinding = (finding: TradeReviewFinding) => findings.push(freeze(finding));
  if (signalAvailable) addFinding({
    code: directionConsistent ? "SIGNAL_DIRECTION_MATCH" : "SIGNAL_DIRECTION_CONFLICT", category: "signal",
    severity: directionConsistent ? "positive" : "warning", title: directionConsistent ? "Signal direction matched" : "Signal direction differed",
    summary: directionConsistent ? "The authoritative historical signal direction matched the recorded trade direction." : "The authoritative historical signal direction differed from the recorded trade direction.",
    evidence: freeze([point("Direction consistent", directionConsistent, signalMs, "signal")]), confidence: 100, deterministic: true,
  });
  if (signalMs !== null) addFinding({
    code: barsFromSignal === 0 ? "ENTRY_ON_SIGNAL_CANDLE" : "ENTRY_DELAYED", category: "entry",
    severity: barsFromSignal === 0 ? "positive" : "neutral", title: barsFromSignal === 0 ? "Entry on confirmed signal candle" : "Entry followed the signal candle",
    summary: barsFromSignal === 0 ? "Entry occurred on the confirmed signal candle." : `Entry occurred ${barsFromSignal} candle${barsFromSignal === 1 ? "" : "s"} after the confirmed signal candle.`,
    evidence: freeze([point("Bars from signal", barsFromSignal, entryMs, "replay-memory")]), confidence: 100, deterministic: true,
  });
  if (extended) addFinding({
    code: "ENTRY_DIRECTIONAL_EXTENSION", category: "entry", severity: "caution", title: "Directional extension at entry",
    summary: "Entry followed an extended directional move.", evidence: freeze([point("Consecutive directional candles", priorDirectionalCandles, entryMs, "replay-memory")]), confidence: 100, deterministic: true,
  });
  if (trade.stop === null) addFinding({
    code: "RISK_COMPLIANCE_UNAVAILABLE", category: "risk", severity: "caution", title: "Historical risk compliance unavailable",
    summary: "Historical risk compliance could not be evaluated because the initial stop was unavailable.", evidence: freeze([point("Initial stop", null, null, "trade")]), confidence: 100, deterministic: true,
  });

  const outcomeClass = trade.pnl > 0 ? "profit" : trade.pnl < 0 ? "loss" : "flat";
  const processObservations: string[] = [];
  if (entry.quality === "good" && outcomeClass === "loss") processObservations.push("User marked Good Trade; financial result was a loss.");
  if (entry.quality === "poor" && outcomeClass === "profit") processObservations.push("User marked Poor Trade; financial result was a profit.");
  if (entry.planDiscipline === "completely" && trade.riskPct === null) processObservations.push("User marked Completely followed plan; objective risk compliance was unavailable.");
  if (entry.mood === "fomo" && extended) processObservations.push("Recorded mood was FOMO, and the entry occurred after an extended move.");

  const limitations: TradeReviewLimitation[] = [
    {code: "BRAIN_CONTEXT_UNAVAILABLE", message: "Historical DizyBrain evidence was not retained for this trade.", severity: "info"},
    {code: "CHART_CONTEXT_UNAVAILABLE", message: "Historical chart context was not retained for this trade.", severity: "info"},
    {code: "FLOW_CAPTURE_NOT_SUPPORTED", message: "Historical DizyFlow evidence was not retained for this trade.", severity: "info"},
    {code: "HIGHER_TIMEFRAME_UNAVAILABLE", message: "Historical higher-timeframe context was not retained.", severity: "info"},
    {code: "SETUP_QUALITY_UNAVAILABLE", message: "A retained strategy version alone cannot establish setup quality.", severity: "info"},
    {code: "RISK_EXECUTION_UNAVAILABLE", message: "Risk facts were retained, but no authoritative historical compliance rule was retained.", severity: "info"},
    {code: "EXIT_EXECUTION_UNAVAILABLE", message: "The close reason describes the exit but does not establish exit execution quality.", severity: "info"},
    {code: "ENTRY_CANDLE_INTRABAR_UNKNOWN", message: "Entry-candle extremes are uncertain because intrabar order relative to entry was not retained.", severity: "caution"},
    {code: "TERMINAL_CAPTURE_PROVENANCE", message: "Review uses terminal-captured, server-validated closed candles.", severity: "info"},
  ];
  if (!memory.strategyContext) limitations.push({code: "STRATEGY_CONTEXT_UNAVAILABLE", message: "Historical strategy settings were unavailable.", severity: "caution"});
  if (trade.stop === null) limitations.push({code: "INITIAL_STOP_UNAVAILABLE", message: "Authoritative initial stop was unavailable.", severity: "caution"});
  if (trade.riskPct === null) limitations.push({code: "RISK_PERCENT_UNAVAILABLE", message: "Authoritative risk percentage was unavailable.", severity: "caution"});
  if (!boundaries.candlesAfterExit.length) limitations.push({code: "POST_EXIT_CONTEXT_UNAVAILABLE", message: "No post-exit candles were retained; hindsight context is unavailable.", severity: "info"});
  if (!boundaries.strictPostEntryCandles.length) limitations.push({code: "STRICT_EXCURSION_UNAVAILABLE", message: "No closed candle exists strictly after entry through exit, so strict excursion is unavailable.", severity: "caution"});
  if (memory.integrity.gapCount) limitations.push({code: "CANDLE_GAPS", message: `Retained memory contains ${memory.integrity.gapCount} candle gap(s); missing candles were not fabricated.`, severity: "caution"});
  limitations.sort((left, right) => left.code.localeCompare(right.code));

  const evidence = freeze({
    replayMemory: true, candleCount: memory.candles.length, signalContext: signalAvailable, brainContext: false,
    strategyContext: Boolean(memory.strategyContext), chartContext: false, flowContext: memory.flowAvailability === "available",
    stopKnown: trade.stop !== null, targetKnown: trade.target !== null, positionSizeKnown: trade.positionSize !== null,
    riskPctKnown: trade.riskPct !== null, leverageKnown: trade.leverage !== null, feesKnown: trade.fees !== null,
    rMultipleKnown: trade.rMultiple !== null, journalQualityAssessment: entry.quality !== null,
    journalPlanAssessment: entry.planDiscipline !== null, journalMood: entry.mood !== null,
    journalNotes: Boolean(entry.notes.trim()), journalTags: entry.tags.length > 0,
  });
  let confidence = 45;
  const confidenceReasons = ["Replay Memory passed server integrity validation and covers entry and exit."];
  if (signalAvailable) { confidence += 15; confidenceReasons.push("Authoritative historical signal identity is available."); }
  else confidenceReasons.push("Historical signal context is unavailable.");
  if (memory.strategyContext) confidence += 8;
  if (trade.stop !== null) confidence += 6;
  if (trade.riskPct !== null) confidence += 6;
  if (boundaries.candlesAfterExit.length) confidence += 5;
  if (entry.quality || entry.planDiscipline || entry.mood) confidence += 5;
  if (memory.integrity.gapCount) { confidence -= Math.min(20, memory.integrity.gapCount * 5); confidenceReasons.push("Retained candle gaps reduce review confidence."); }
  confidence = Math.max(0, Math.min(100, confidence));
  confidenceReasons.push("Confidence measures evidence completeness, not probability of profit.");

  const setup = freeze({...component(setupEvidence, setupQualityScore, [memory.strategyContext ? "STRATEGY_VERSION_RETAINED" : "STRATEGY_CONTEXT_UNAVAILABLE"], setupEvidence), strategyVersion: memory.strategyContext?.version ?? null, direction: trade.direction, configuredConfluenceThreshold: null});
  const signal = freeze({...component(signalEvidence, signalConsistencyScore, [signalAvailable ? "AUTHORITATIVE_SIGNAL_REFERENCE" : "SIGNAL_UNAVAILABLE"], signalEvidence), direction: memory.signalContext?.direction ?? null, presentOnExactCandle: Boolean(signalCandle), directionConsistent, ageMs: signalMs === null ? null : entryMs - signalMs, barsFromSignal, entryOnSignalCandle: barsFromSignal === null ? null : barsFromSignal === 0, confluenceScore: null, thresholdMet: null});
  const trend = freeze({...component(trendEvidence, trendAlignmentScore, ["TREND_CONTEXT_UNAVAILABLE"], 0, ["No reproducible historical trend snapshot was retained."]), alignment: "unavailable" as const, directionAtSignal: null, directionAtEntry: null, higherTimeframeAvailable: false as const});
  const entryReview = freeze({...component(entryEvidence, entryExecutionScore, [`ENTRY_${entryTiming.toUpperCase()}`], entryEvidence), timing: entryTiming, barsFromSignal, millisecondsFromSignal: signalMs === null ? null : entryMs - signalMs, distanceFromSignalClose: signalCandle ? trade.direction === "long" ? trade.entry - signalCandle.close : signalCandle.close - trade.entry : null, rangePosition: entryCandle.high === entryCandle.low ? 0.5 : (trade.entry - entryCandle.low) / (entryCandle.high - entryCandle.low), priorDirectionalCandles, extended});
  const stopDistance = trade.stop === null ? null : Math.abs(trade.entry - trade.stop), targetDistance = trade.target === null ? null : Math.abs(trade.target - trade.entry);
  const risk = freeze({...component(riskEvidence, riskExecutionScore, [riskEvidence ? "AUTHORITATIVE_RISK_FACTS_RETAINED" : "RISK_FACTS_UNAVAILABLE"], riskEvidence, ["No retained compliance rule establishes execution quality."]), stop: trade.stop, target: trade.target, positionSize: trade.positionSize, riskPct: trade.riskPct, leverage: trade.leverage, marginMode: trade.marginMode, stopDistance, targetDistance, plannedRewardRisk: stopDistance && targetDistance ? targetDistance / stopDistance : null, liquidation: exitClass === "liquidation"});
  const exit = freeze({...component(exitEvidence, exitExecutionScore, [`EXIT_${exitClass.toUpperCase().replaceAll("-", "_")}`], exitEvidence, ["Close reason alone does not establish execution quality."]), timing: exitClass, closeReason: trade.closeReason, exitPrice: trade.exit, profitRetainedPct: excursionReview.mfe && excursionReview.mfe > 0 ? Math.max(0, trade.direction === "long" ? trade.exit - trade.entry : trade.entry - trade.exit) / excursionReview.mfe * 100 : null, hindsight: freeze({available: boundaries.candlesAfterExit.length > 0, favourableContinuationPct: null, adverseMovementPct: null})});
  const process = freeze({...component(processEvidence, processCompletenessScore, [processEvidence ? "JOURNAL_ASSESSMENT_RECORDED" : "JOURNAL_ASSESSMENT_UNAVAILABLE"], processEvidence), quality: entry.quality, planDiscipline: entry.planDiscipline, mood: entry.mood, tags: freeze([...entry.tags]), notesPresent: Boolean(entry.notes.trim()), observations: freeze(processObservations)});
  const scores = freeze({
    setupEvidenceCompleteness: setupEvidence, signalEvidenceCompleteness: signalEvidence, trendEvidenceCompleteness: trendEvidence,
    entryEvidenceCompleteness: entryEvidence, riskEvidenceCompleteness: riskEvidence, exitEvidenceCompleteness: exitEvidence,
    processEvidenceCompleteness: processEvidence, setupQualityScore, signalConsistencyScore, trendAlignmentScore,
    entryExecutionScore, riskExecutionScore, exitExecutionScore, processCompletenessScore,
    evidenceBasedExecutionScore: execution.score, availableExecutionComponents: execution.count,
    minimumExecutionComponents: MINIMUM_EXECUTION_SCORE_COMPONENTS,
  });
  const generatedFromHash = tradeReviewInputHash(entry, memory);
  const id = tradeReviewId({journalEntryId: entry.id, tradeId: trade.tradeId, replayMemoryId: memory.id, marketKey: memory.marketKey, symbol: memory.symbol, timeframe: memory.timeframe, generatedFromHash});
  const logical: ReviewWithoutContentHash = freeze({
    id, schemaVersion: DIZYBRAIN_TRADE_REVIEW_SCHEMA_VERSION, engineVersion: DIZYBRAIN_TRADE_REVIEW_ENGINE_VERSION,
    createdAt, source: "historical-replay-memory", journalEntryId: entry.id, tradeId: trade.tradeId,
    replayMemoryId: memory.id, marketKey: memory.marketKey, symbol: memory.symbol, timeframe: memory.timeframe,
    signalTimeMs: signalMs, entryTimeMs: entryMs, exitTimeMs: exitMs,
    provenance: freeze({replayMemorySource: "terminal-closed-candle-buffer", replayMemoryServerValidated: true, replayMemoryContentHash: memory.integrity.contentHash, replayMemorySchemaVersion: memory.schemaVersion, replayMemoryValidationVersion: memory.captureProvenance.validationVersion, closedCandlesOnly: true, entryCovered: true, exitCovered: true, signalSnapshotSource: signalAvailable ? "authoritative-trade-reference" : "unavailable", brainSnapshotSource: "unavailable", chartContextSource: "unavailable", flowContextSource: memory.flowAvailability === "capture-not-supported" ? "capture-not-supported" : memory.flowAvailability === "available" ? "captured-snapshot" : "unavailable", excursionSource: excursionReview.source}),
    evidence, setup, signal, trend, entry: entryReview, excursion: excursionReview, risk, exit, process,
    outcome: freeze({classification: outcomeClass, pnl: trade.pnl, pnlPct: trade.pnlPct, rMultiple: trade.rMultiple, fees: trade.fees, closeReason: trade.closeReason, mfe: excursionReview.mfe, mae: excursionReview.mae}),
    scores, findings: freeze(findings.sort((left, right) => left.category.localeCompare(right.category) || left.code.localeCompare(right.code))),
    limitations: freeze(limitations), reviewConfidence: confidence, confidenceBand: confidenceBandFor(confidence),
    confidenceReasons: freeze(confidenceReasons), generatedFromHash,
  });
  return freeze({...logical, reviewContentHash: computeTradeReviewContentHash(logical)});
}

const REVIEW_KEYS = ["id","schemaVersion","engineVersion","createdAt","source","journalEntryId","tradeId","replayMemoryId","marketKey","symbol","timeframe","signalTimeMs","entryTimeMs","exitTimeMs","provenance","evidence","setup","signal","trend","entry","excursion","risk","exit","process","outcome","scores","findings","limitations","reviewConfidence","confidenceBand","confidenceReasons","generatedFromHash","reviewContentHash"] as const;
const FINDING_CATEGORIES: FindingCategory[] = ["setup","signal","trend","entry","risk","exit","process","outcome","data-quality"];
const FINDING_SEVERITIES: FindingSeverity[] = ["positive","neutral","caution","warning"];
const EVIDENCE_SOURCES: EvidenceSource[] = ["trade","replay-memory","signal","brain","journal"];
const ASSESSMENTS: ReviewAssessment[] = ["strong","acceptable","mixed","weak","unavailable"];
const numericWalk = (value: unknown, path = "review") => {
  if (typeof value === "number" && !Number.isFinite(value)) fail("MALFORMED_REVIEW", `${path} contains a non-finite number.`);
  if (Array.isArray(value)) value.forEach((item, index) => numericWalk(item, `${path}[${index}]`));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => numericWalk(item, `${path}.${key}`));
};
const score = (value: unknown, nullable = true) => {
  if (nullable && value === null) return;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100) fail("MALFORMED_REVIEW", "Review score is outside 0–100.");
};
const validateComponent = (value: unknown) => {
  if (!value || typeof value !== "object") fail("MALFORMED_REVIEW", "Review component is malformed.");
  const componentValue = value as Component;
  if (!ASSESSMENTS.includes(componentValue.assessment) || !Array.isArray(componentValue.reasonCodes) || !Array.isArray(componentValue.limitations)) fail("MALFORMED_REVIEW", "Review component classification is invalid.");
  score(componentValue.evidenceCompleteness, false); score(componentValue.qualityScore); score(componentValue.confidence, false);
  if (componentValue.qualityScore === null && componentValue.assessment !== "unavailable") fail("MALFORMED_REVIEW", "Unavailable component score has an execution assessment.");
};
export function validateDizyBrainTradeReview(value: unknown): DizyBrainTradeReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_REVIEW", "Malformed trade review.");
  const review = value as DizyBrainTradeReview;
  exactKeys(review as unknown as Record<string, unknown>, REVIEW_KEYS, "MALFORMED_REVIEW");
  if (Buffer.byteLength(JSON.stringify(review)) > MAX_TRADE_REVIEW_BYTES) fail("MALFORMED_REVIEW", "Stored review exceeds its logical size limit.");
  if (review.schemaVersion !== DIZYBRAIN_TRADE_REVIEW_SCHEMA_VERSION || review.engineVersion !== DIZYBRAIN_TRADE_REVIEW_ENGINE_VERSION || review.source !== "historical-replay-memory") fail("MALFORMED_REVIEW", "Stored review schema, engine, or source is invalid.");
  if (!CANDLE_TIMEFRAMES.includes(review.timeframe) || !isHash(review.generatedFromHash) || !isHash(review.reviewContentHash) || !isHash(review.provenance?.replayMemoryContentHash)) fail("MALFORMED_REVIEW", "Stored review identity hashes or timeframe are invalid.");
  const expectedId = tradeReviewId({journalEntryId: review.journalEntryId, tradeId: review.tradeId, replayMemoryId: review.replayMemoryId, marketKey: review.marketKey, symbol: review.symbol, timeframe: review.timeframe, generatedFromHash: review.generatedFromHash, engineVersion: review.engineVersion, schemaVersion: review.schemaVersion});
  if (review.id !== expectedId) fail("IDENTITY_MISMATCH", "Stored review ID does not match its authoritative identity.");
  if (review.reviewContentHash !== computeTradeReviewContentHash(review)) fail("CONTENT_HASH_MISMATCH", "Stored review content hash is invalid.");
  numericWalk(review);
  score(review.reviewConfidence, false);
  if (review.confidenceBand !== confidenceBandFor(review.reviewConfidence)) fail("MALFORMED_REVIEW", "Review confidence band is inconsistent.");
  if (!review.provenance || review.provenance.replayMemorySource !== "terminal-closed-candle-buffer" || review.provenance.replayMemoryServerValidated !== true || review.provenance.closedCandlesOnly !== true || !["post-entry-closed-candles","entry-at-open-confirmed","unavailable"].includes(review.provenance.excursionSource)) fail("MALFORMED_REVIEW", "Review provenance is invalid.");
  const baseComponentKeys = ["assessment","evidenceCompleteness","qualityScore","reasonCodes","confidence","limitations"];
  exactKeys(review.provenance as unknown as Record<string, unknown>, ["replayMemorySource","replayMemoryServerValidated","replayMemoryContentHash","replayMemorySchemaVersion","replayMemoryValidationVersion","closedCandlesOnly","entryCovered","exitCovered","signalSnapshotSource","brainSnapshotSource","chartContextSource","flowContextSource","excursionSource"], "MALFORMED_REVIEW");
  exactKeys(review.evidence as unknown as Record<string, unknown>, ["replayMemory","candleCount","signalContext","brainContext","strategyContext","chartContext","flowContext","stopKnown","targetKnown","positionSizeKnown","riskPctKnown","leverageKnown","feesKnown","rMultipleKnown","journalQualityAssessment","journalPlanAssessment","journalMood","journalNotes","journalTags"], "MALFORMED_REVIEW");
  exactKeys(review.setup as unknown as Record<string, unknown>, [...baseComponentKeys,"strategyVersion","direction","configuredConfluenceThreshold"], "MALFORMED_REVIEW");
  exactKeys(review.signal as unknown as Record<string, unknown>, [...baseComponentKeys,"direction","presentOnExactCandle","directionConsistent","ageMs","barsFromSignal","entryOnSignalCandle","confluenceScore","thresholdMet"], "MALFORMED_REVIEW");
  exactKeys(review.trend as unknown as Record<string, unknown>, [...baseComponentKeys,"alignment","directionAtSignal","directionAtEntry","higherTimeframeAvailable"], "MALFORMED_REVIEW");
  exactKeys(review.entry as unknown as Record<string, unknown>, [...baseComponentKeys,"timing","barsFromSignal","millisecondsFromSignal","distanceFromSignalClose","rangePosition","priorDirectionalCandles","extended"], "MALFORMED_REVIEW");
  exactKeys(review.risk as unknown as Record<string, unknown>, [...baseComponentKeys,"stop","target","positionSize","riskPct","leverage","marginMode","stopDistance","targetDistance","plannedRewardRisk","liquidation"], "MALFORMED_REVIEW");
  exactKeys(review.exit as unknown as Record<string, unknown>, [...baseComponentKeys,"timing","closeReason","exitPrice","profitRetainedPct","hindsight"], "MALFORMED_REVIEW");
  exactKeys(review.process as unknown as Record<string, unknown>, [...baseComponentKeys,"quality","planDiscipline","mood","tags","notesPresent","observations"], "MALFORMED_REVIEW");
  exactKeys(review.excursion as unknown as Record<string, unknown>, ["source","mfe","mae","mfePct","maePct","mfeR","maeR","barsToMfe","barsToMae","peakFavourablePrice","peakAdversePrice","entryCandlePotential"], "MALFORMED_REVIEW");
  exactKeys(review.outcome as unknown as Record<string, unknown>, ["classification","pnl","pnlPct","rMultiple","fees","closeReason","mfe","mae"], "MALFORMED_REVIEW");
  exactKeys(review.scores as unknown as Record<string, unknown>, ["setupEvidenceCompleteness","signalEvidenceCompleteness","trendEvidenceCompleteness","entryEvidenceCompleteness","riskEvidenceCompleteness","exitEvidenceCompleteness","processEvidenceCompleteness","setupQualityScore","signalConsistencyScore","trendAlignmentScore","entryExecutionScore","riskExecutionScore","exitExecutionScore","processCompletenessScore","evidenceBasedExecutionScore","availableExecutionComponents","minimumExecutionComponents"], "MALFORMED_REVIEW");
  [review.setup, review.signal, review.trend, review.entry, review.risk, review.exit, review.process].forEach(validateComponent);
  if (!["long","short"].includes(review.setup.direction) || !["long","short",null].includes(review.signal.direction) || !["aligned","counter","transition","neutral","unavailable"].includes(review.trend.alignment) || !["early","confirmed","late","extended","unavailable"].includes(review.entry.timing) || !["planned","early","late","stop","liquidation","manual","signal-reversal","unavailable"].includes(review.exit.timing) || !["isolated","cross",null].includes(review.risk.marginMode) || !["profit","loss","flat"].includes(review.outcome.classification)) fail("MALFORMED_REVIEW", "Review component enum is invalid.");
  if (![review.signalTimeMs,review.entryTimeMs,review.exitTimeMs].every((item) => item === null || Number.isSafeInteger(item)) || review.entryTimeMs > review.exitTimeMs || !Number.isFinite(Date.parse(review.createdAt))) fail("MALFORMED_REVIEW", "Review timestamps are invalid.");
  if (typeof review.evidence.candleCount !== "number" || !Number.isInteger(review.evidence.candleCount) || review.evidence.candleCount < 1 || Object.entries(review.evidence).some(([key, item]) => key !== "candleCount" && typeof item !== "boolean")) fail("MALFORMED_REVIEW", "Evidence availability is invalid.");
  if (!Number.isFinite(review.entry.rangePosition) || review.entry.rangePosition < 0 || review.entry.rangePosition > 1 || !Number.isInteger(review.entry.priorDirectionalCandles) || review.entry.priorDirectionalCandles < 0) fail("MALFORMED_REVIEW", "Entry metrics are invalid.");
  if (!review.excursion.entryCandlePotential || review.excursion.entryCandlePotential.uncertain !== true || review.excursion.entryCandlePotential.reason !== "intrabar-order-unavailable" || review.excursion.entryCandlePotential.favourable < 0 || review.excursion.entryCandlePotential.adverse < 0) fail("MALFORMED_REVIEW", "Entry-candle excursion context is invalid.");
  Object.entries(review.scores).forEach(([key, value]) => {
    if (key === "availableExecutionComponents" || key === "minimumExecutionComponents") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 7) fail("MALFORMED_REVIEW", "Execution component count is invalid.");
    } else score(value, key.endsWith("Score") && !key.endsWith("Completeness"));
  });
  if (review.scores.minimumExecutionComponents !== MINIMUM_EXECUTION_SCORE_COMPONENTS || (review.scores.availableExecutionComponents < MINIMUM_EXECUTION_SCORE_COMPONENTS && review.scores.evidenceBasedExecutionScore !== null)) fail("MALFORMED_REVIEW", "Overall execution-score availability is invalid.");
  if (!Array.isArray(review.findings) || review.findings.length > 100) fail("MALFORMED_REVIEW", "Review findings are invalid.");
  const findingCodes = new Set<string>();
  review.findings.forEach((finding) => {
    exactKeys(finding as unknown as Record<string, unknown>, ["code","category","severity","title","summary","evidence","confidence","deterministic"], "MALFORMED_REVIEW");
    if (!/^[A-Z0-9_]{2,80}$/.test(finding.code) || findingCodes.has(finding.code) || !FINDING_CATEGORIES.includes(finding.category) || !FINDING_SEVERITIES.includes(finding.severity) || finding.deterministic !== true || !Array.isArray(finding.evidence) || typeof finding.title !== "string" || !finding.title || finding.title.length > 200 || typeof finding.summary !== "string" || !finding.summary || finding.summary.length > 1_000) fail("MALFORMED_REVIEW", "Review finding is invalid or duplicated.");
    findingCodes.add(finding.code); score(finding.confidence, false);
    finding.evidence.forEach((evidencePoint) => {
      exactKeys(evidencePoint as unknown as Record<string, unknown>, ["label","value","timestampMs","source"], "MALFORMED_REVIEW");
      if (!EVIDENCE_SOURCES.includes(evidencePoint.source) || typeof evidencePoint.label !== "string" || !evidencePoint.label || evidencePoint.label.length > 200 || (evidencePoint.timestampMs !== null && !Number.isSafeInteger(evidencePoint.timestampMs)) || !["string","number","boolean"].includes(typeof evidencePoint.value) && evidencePoint.value !== null) fail("MALFORMED_REVIEW", "Finding evidence point is invalid.");
    });
  });
  for (let index = 1; index < review.findings.length; index += 1) if (`${review.findings[index - 1].category}|${review.findings[index - 1].code}` > `${review.findings[index].category}|${review.findings[index].code}`) fail("MALFORMED_REVIEW", "Review findings are not deterministically sorted.");
  if (!Array.isArray(review.limitations) || review.limitations.length > 100) fail("MALFORMED_REVIEW", "Review limitations are invalid.");
  const limitationCodes = new Set<string>();
  review.limitations.forEach((limitation) => {
    exactKeys(limitation as unknown as Record<string, unknown>, ["code","message","severity"], "MALFORMED_REVIEW");
    if (!/^[A-Z0-9_]{2,80}$/.test(limitation.code) || limitationCodes.has(limitation.code) || !["info","caution"].includes(limitation.severity) || typeof limitation.message !== "string" || !limitation.message || limitation.message.length > 1_000) fail("MALFORMED_REVIEW", "Review limitation is invalid or duplicated.");
    limitationCodes.add(limitation.code);
  });
  for (let index = 1; index < review.limitations.length; index += 1) if (review.limitations[index - 1].code > review.limitations[index].code) fail("MALFORMED_REVIEW", "Review limitations are not deterministically sorted.");
  const forbidden = JSON.stringify(review).toLowerCase();
  if (/"candles"\s*:|"notes"\s*:|api[_-]?key|private[_-]?key|credential/.test(forbidden)) fail("MALFORMED_REVIEW", "Stored review contains forbidden embedded data.");
  if (review.excursion.source !== review.provenance.excursionSource || (review.excursion.source === "unavailable" && [review.excursion.mfe,review.excursion.mae,review.excursion.mfePct,review.excursion.maePct].some((item) => item !== null))) fail("MALFORMED_REVIEW", "Excursion provenance or availability is invalid.");
  return freeze(review);
}
