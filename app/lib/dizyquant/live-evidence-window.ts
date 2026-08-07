import {
  buildDizyQuantAggressiveFlowSnapshot,
  DIZYQUANT_AGGRESSIVE_FLOW_WINDOW_MS,
  DIZYQUANT_MAX_TRADES_PER_WINDOW,
} from "./aggressive-flow.ts";
import {
  buildDizyQuantLadderSnapshot,
  calculateDizyQuantLadderState,
} from "./ladder-state.ts";
import {
  buildDizyQuantLiquidityMigrationSnapshot,
  DIZYQUANT_LIQUIDITY_MIGRATION_WINDOW_MS,
  type DizyQuantLiquidityFrame,
} from "./liquidity-migration.ts";
import {
  toDizyQuantReplaySnapshot,
  type DizyQuantReplaySnapshot,
  type DizyQuantResearchSnapshot,
} from "./research.ts";
import {
  buildDizyQuantResilienceSnapshot,
  calculateDizyQuantResilience,
  DIZYQUANT_RESILIENCE_WINDOW_MS,
} from "./resilience.ts";
import type { BookView, RawTrade } from "../order-flow/types.ts";

export const DIZYQUANT_LIVE_EVIDENCE_WINDOW_FORMULA_VERSION =
  "dizyquant-live-evidence-window/1.0.0" as const;
export const DIZYQUANT_LIVE_EVIDENCE_GRID_MS = 1_000 as const;
export const DIZYQUANT_LIVE_EVIDENCE_MAX_ASOF_AGE_MS = 1_000 as const;
export const DIZYQUANT_LIVE_EVIDENCE_RETENTION_MS = 66_000 as const;
export const DIZYQUANT_LIVE_EVIDENCE_MAX_DEPTH_OBSERVATIONS = 512 as const;
export const DIZYQUANT_LIVE_EVIDENCE_MAX_AGE_MS = 15_000 as const;

export type DizyQuantLiveDepthObservationInput = Readonly<{
  timestampMs: number;
  book: BookView;
  sequenceContinuous: boolean | null;
  hasGaps: boolean;
}>;

export type DizyQuantLiveEvidenceBuildInput = Readonly<{
  windowToMs: number;
  evaluatedAtMs: number;
  tradeSequenceContinuous: boolean | null;
  tradeHasGaps: boolean;
  shockTimestampMs?: number | null;
}>;

export type DizyQuantLiveEvidenceSnapshots = Readonly<{
  ladder: DizyQuantReplaySnapshot | null;
  aggressiveFlow: DizyQuantReplaySnapshot;
  liquidityMigration: DizyQuantReplaySnapshot;
  resilience: DizyQuantReplaySnapshot | null;
}>;

export type DizyQuantLiveEvidenceBuildResult = Readonly<{
  formulaVersion: typeof DIZYQUANT_LIVE_EVIDENCE_WINDOW_FORMULA_VERSION;
  symbol: string;
  windowToMs: number;
  shockTimestampMs: number | null;
  snapshots: DizyQuantLiveEvidenceSnapshots;
  depthSequenceContinuous: boolean | null;
  depthHasGaps: boolean;
  tradeSequenceContinuous: boolean | null;
  tradeHasGaps: boolean;
  rawDepthObservationCount: number;
  rawTradeCount: number;
  sampledFrames: Readonly<{ aggressiveFlow: number; liquidityMigration: number; resilience: number }>;
  limitations: readonly string[];
  researchOnly: true;
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
}>;

type StoredDepthObservation = Readonly<{
  sourceTimeMs: number;
  frame: DizyQuantLiquidityFrame;
  sequenceContinuous: boolean | null;
  hasGaps: boolean;
}>;

type SampledDepthWindow = Readonly<{
  fromMs: number;
  toMs: number;
  frames: readonly DizyQuantLiquidityFrame[];
  complete: boolean;
  sequenceContinuous: boolean | null;
  hasGaps: boolean;
}>;

const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const safePositiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;
const ASOF_LIMITATION =
  "Exact research boundaries use the latest valid public depth observed at or before each one-second boundary, never a future observation; a book older than one second is treated as missing.";
const RAW_WINDOW_LIMITATION =
  "Raw public depth and trade evidence remains bounded and ephemeral in this bridge; only formula Replay snapshots may cross the recorder boundary.";

function normaliseSymbol(value: string) {
  const symbol = value.trim().toUpperCase();
  if (!symbolPattern.test(symbol)) throw new Error("Invalid DizyQuant live evidence symbol");
  return symbol;
}

function assertWindowBoundary(value: number, label: string) {
  if (!safePositiveInteger(value) || value % DIZYQUANT_LIVE_EVIDENCE_GRID_MS !== 0) {
    throw new Error(`${label} must be a positive exact one-second boundary`);
  }
  return value;
}

function exactPriceTick(price: number, priceStep: number) {
  if (!finitePositive(price)) throw new Error("Invalid DizyQuant live depth price");
  const tick = Math.round(price / priceStep);
  if (!Number.isSafeInteger(tick) || tick <= 0) {
    throw new Error("DizyQuant live depth price exceeds the safe tick boundary");
  }
  const reconstructed = tick * priceStep;
  const tolerance = Math.max(1e-9, Math.abs(priceStep) * 1e-6);
  if (!Number.isFinite(reconstructed) || Math.abs(reconstructed - price) > tolerance) {
    throw new Error("DizyQuant live depth price is not aligned to the reviewed price step");
  }
  return tick;
}

function freezeLevels(levels: DizyQuantLiquidityFrame["levels"]) {
  return Object.freeze(levels.map((level) => Object.freeze({ ...level })));
}

function frameFromBook(book: BookView, timestampMs: number, priceStep: number): DizyQuantLiquidityFrame {
  if (!book.valid || !book.bids.length || !book.asks.length) {
    throw new Error("DizyQuant live evidence requires one valid two-sided public book");
  }
  const bestBid = Math.max(...book.bids.map((level) => level.price));
  const bestAsk = Math.min(...book.asks.map((level) => level.price));
  if (!finitePositive(bestBid) || !finitePositive(bestAsk) || bestBid >= bestAsk) {
    throw new Error("DizyQuant live evidence book is locked, crossed or invalid");
  }
  const midpoint = bestBid + (bestAsk - bestBid) / 2;
  const levels: Array<{ priceTick: number; bidContracts: number; askContracts: number }> = [];
  const ticks = new Set<number>();
  const add = (side: "bid" | "ask", price: number, contractQuantity: number) => {
    if (!Number.isFinite(contractQuantity) || contractQuantity < 0) {
      throw new Error("DizyQuant live depth quantity is invalid");
    }
    if (contractQuantity === 0) return;
    const priceTick = exactPriceTick(price, priceStep);
    if (ticks.has(priceTick)) {
      throw new Error("DizyQuant live depth collapses multiple levels onto one reviewed price tick");
    }
    ticks.add(priceTick);
    if ((side === "bid" && price >= midpoint) || (side === "ask" && price <= midpoint)) {
      throw new Error("DizyQuant live depth side is inconsistent with midpoint");
    }
    levels.push({
      priceTick,
      bidContracts: side === "bid" ? contractQuantity : 0,
      askContracts: side === "ask" ? contractQuantity : 0,
    });
  };
  for (const level of book.bids) add("bid", level.price, level.contractQuantity);
  for (const level of book.asks) add("ask", level.price, level.contractQuantity);
  if (!levels.some((level) => level.bidContracts > 0) || !levels.some((level) => level.askContracts > 0)) {
    throw new Error("DizyQuant live evidence requires positive displayed depth on both sides");
  }
  if (levels.length > 2_000) throw new Error("DizyQuant live evidence depth exceeds the formula boundary");
  levels.sort((left, right) => left.priceTick - right.priceTick);
  return Object.freeze({ timestampMs, midpoint, levels: freezeLevels(levels) });
}

function frameToBook(frame: DizyQuantLiquidityFrame, priceStep: number): BookView {
  const bids = frame.levels
    .filter((level) => level.bidContracts > 0)
    .map((level) => ({
      price: level.priceTick * priceStep,
      orderCount: 0,
      contractQuantity: level.bidContracts,
    }))
    .sort((left, right) => right.price - left.price);
  const asks = frame.levels
    .filter((level) => level.askContracts > 0)
    .map((level) => ({
      price: level.priceTick * priceStep,
      orderCount: 0,
      contractQuantity: level.askContracts,
    }))
    .sort((left, right) => left.price - right.price);
  return { valid: bids.length > 0 && asks.length > 0 && bids[0].price < asks[0].price, version: 0, bids, asks };
}

function combinedSequence(values: readonly (boolean | null)[], complete: boolean): boolean | null {
  if (values.some((value) => value === false)) return false;
  if (!complete || values.some((value) => value === null)) return null;
  return true;
}

function mergeSequence(left: boolean | null, right: boolean | null): boolean | null {
  if (left === false || right === false) return false;
  if (left === true && right === true) return true;
  return null;
}

function frozenLimitations(values: readonly string[]) {
  return Object.freeze([...new Set(values.filter(Boolean))]);
}

function replayWithBridgeLimitations(
  snapshot: DizyQuantResearchSnapshot,
  limitations: readonly string[],
): DizyQuantReplaySnapshot {
  const replay = toDizyQuantReplaySnapshot(snapshot);
  return Object.freeze({
    ...replay,
    limitations: frozenLimitations([...replay.limitations, ...limitations]),
  });
}

export class DizyQuantLiveEvidenceWindow {
  readonly symbol: string;
  readonly contractSize: number;
  readonly priceStep: number;
  private depth: StoredDepthObservation[] = [];
  private trades: RawTrade[] = [];
  private tradeIds = new Set<string>();
  private latestObservedTimeMs = 0;

  constructor(input: Readonly<{ symbol: string; contractSize: number; priceStep: number }>) {
    this.symbol = normaliseSymbol(input.symbol);
    if (!finitePositive(input.contractSize)) throw new Error("Invalid DizyQuant live contract size");
    if (!finitePositive(input.priceStep)) throw new Error("Invalid DizyQuant live price step");
    this.contractSize = input.contractSize;
    this.priceStep = input.priceStep;
  }

  clear() {
    this.depth = [];
    this.trades = [];
    this.tradeIds.clear();
    this.latestObservedTimeMs = 0;
  }

  private prune(referenceTimeMs: number) {
    const cutoff = referenceTimeMs - DIZYQUANT_LIVE_EVIDENCE_RETENTION_MS;
    this.depth = this.depth
      .filter((value) => value.sourceTimeMs >= cutoff)
      .slice(-DIZYQUANT_LIVE_EVIDENCE_MAX_DEPTH_OBSERVATIONS);
    this.trades = this.trades
      .filter((value) => value.timestampMs >= cutoff)
      .slice(-DIZYQUANT_MAX_TRADES_PER_WINDOW);
    this.tradeIds = new Set(this.trades.map((value) => value.tradeId));
  }

  captureDepth(input: DizyQuantLiveDepthObservationInput) {
    if (!safePositiveInteger(input.timestampMs)) {
      throw new Error("Invalid DizyQuant live depth timestamp");
    }
    const frame = frameFromBook(input.book, input.timestampMs, this.priceStep);
    if (input.sequenceContinuous === false || input.hasGaps) this.clear();
    if (this.depth.length && input.timestampMs <= this.depth.at(-1)!.sourceTimeMs) {
      throw new Error("DizyQuant live depth observations must be strictly event-time ordered");
    }
    const stored = Object.freeze({
      sourceTimeMs: input.timestampMs,
      frame,
      sequenceContinuous: input.sequenceContinuous,
      hasGaps: Boolean(input.hasGaps),
    });
    this.depth.push(stored);
    this.latestObservedTimeMs = Math.max(this.latestObservedTimeMs, input.timestampMs);
    this.prune(this.latestObservedTimeMs);
    return stored;
  }

  captureTrade(trade: RawTrade) {
    if (
      !trade ||
      typeof trade.tradeId !== "string" ||
      !trade.tradeId.trim() ||
      trade.tradeId.length > 160 ||
      /[\u0000-\u001f]/.test(trade.tradeId) ||
      !safePositiveInteger(trade.timestampMs) ||
      !finitePositive(trade.price) ||
      !finitePositive(trade.quantity) ||
      !finitePositive(trade.notional) ||
      (trade.side !== "buy" && trade.side !== "sell")
    ) {
      throw new Error("Invalid DizyQuant live public trade");
    }
    if (this.tradeIds.has(trade.tradeId)) return false;
    const reference = Math.max(this.latestObservedTimeMs, trade.timestampMs);
    if (reference - trade.timestampMs > DIZYQUANT_LIVE_EVIDENCE_RETENTION_MS) return false;
    this.tradeIds.add(trade.tradeId);
    this.trades.push(Object.freeze({ ...trade }));
    this.trades.sort((left, right) => left.timestampMs - right.timestampMs || left.tradeId.localeCompare(right.tradeId));
    this.latestObservedTimeMs = reference;
    this.prune(reference);
    return true;
  }

  private observationAsOf(boundaryMs: number): StoredDepthObservation | null {
    for (let index = this.depth.length - 1; index >= 0; index -= 1) {
      const observation = this.depth[index];
      if (observation.sourceTimeMs > boundaryMs) continue;
      if (boundaryMs - observation.sourceTimeMs > DIZYQUANT_LIVE_EVIDENCE_MAX_ASOF_AGE_MS) return null;
      return observation;
    }
    return null;
  }

  private sampledWindow(fromMs: number, toMs: number): SampledDepthWindow {
    assertWindowBoundary(fromMs, "DizyQuant live window start");
    assertWindowBoundary(toMs, "DizyQuant live window end");
    if (toMs < fromMs || (toMs - fromMs) % DIZYQUANT_LIVE_EVIDENCE_GRID_MS !== 0) {
      throw new Error("Invalid DizyQuant live evidence window");
    }
    const frames: DizyQuantLiquidityFrame[] = [];
    const continuity: (boolean | null)[] = [];
    let missing = false;
    let sourceGap = false;
    for (let boundary = fromMs; boundary <= toMs; boundary += DIZYQUANT_LIVE_EVIDENCE_GRID_MS) {
      const observation = this.observationAsOf(boundary);
      if (!observation) {
        missing = true;
        continue;
      }
      continuity.push(observation.sequenceContinuous);
      sourceGap ||= observation.hasGaps;
      frames.push(Object.freeze({
        timestampMs: boundary,
        midpoint: observation.frame.midpoint,
        levels: observation.frame.levels,
      }));
    }
    const expected = Math.floor((toMs - fromMs) / DIZYQUANT_LIVE_EVIDENCE_GRID_MS) + 1;
    const complete = !missing && frames.length === expected;
    return Object.freeze({
      fromMs,
      toMs,
      frames: Object.freeze(frames),
      complete,
      sequenceContinuous: combinedSequence(continuity, complete),
      hasGaps: sourceGap || !complete,
    });
  }

  eligibleShockTimestamps(windowToMs: number) {
    const toMs = assertWindowBoundary(windowToMs, "DizyQuant resilience window end");
    const fromMs = toMs - DIZYQUANT_RESILIENCE_WINDOW_MS;
    if (fromMs <= 0) return Object.freeze([] as number[]);
    const window = this.sampledWindow(fromMs, toMs);
    if (!window.complete || window.sequenceContinuous !== true || window.hasGaps || window.frames.length < 3) {
      return Object.freeze([] as number[]);
    }
    const candidates: number[] = [];
    for (const frame of window.frames.slice(1, -1)) {
      const state = calculateDizyQuantResilience({
        frames: window.frames,
        windowFromMs: fromMs,
        windowToMs: toMs,
        shockTimestampMs: frame.timestampMs,
        priceStep: this.priceStep,
        contractSize: this.contractSize,
        sequenceContinuous: true,
        hasGaps: false,
        sourceKind: "depth-stream",
      });
      if (state.valid) candidates.push(frame.timestampMs);
    }
    return Object.freeze(candidates);
  }

  build(input: DizyQuantLiveEvidenceBuildInput): DizyQuantLiveEvidenceBuildResult {
    const toMs = assertWindowBoundary(input.windowToMs, "DizyQuant live predictor time");
    if (!safePositiveInteger(input.evaluatedAtMs)) throw new Error("Invalid DizyQuant live evaluation time");
    if (input.evaluatedAtMs + 5_000 < toMs) throw new Error("DizyQuant live evaluation precedes predictor time");
    if (![true, false, null].includes(input.tradeSequenceContinuous)) {
      throw new Error("Invalid DizyQuant public-trade continuity state");
    }

    const aggressiveFromMs = toMs - DIZYQUANT_AGGRESSIVE_FLOW_WINDOW_MS;
    const migrationFromMs = toMs - DIZYQUANT_LIQUIDITY_MIGRATION_WINDOW_MS;
    if (aggressiveFromMs <= 0 || migrationFromMs <= 0) {
      throw new Error("DizyQuant live predictor window precedes the supported time boundary");
    }
    const aggressiveWindow = this.sampledWindow(aggressiveFromMs, toMs);
    const migrationWindow = this.sampledWindow(migrationFromMs, toMs);
    const bridgeLimitations = [ASOF_LIMITATION, RAW_WINDOW_LIMITATION];

    const closingObservation = this.observationAsOf(toMs);
    const ladder = closingObservation
      ? replayWithBridgeLimitations(
          buildDizyQuantLadderSnapshot({
            symbol: this.symbol,
            book: frameToBook(closingObservation.frame, this.priceStep),
            contractSize: this.contractSize,
            priceStep: this.priceStep,
            sourceTimeMs: closingObservation.sourceTimeMs,
            evaluatedAtMs: input.evaluatedAtMs,
            maxAgeMs: DIZYQUANT_LIVE_EVIDENCE_MAX_AGE_MS,
          }),
          bridgeLimitations,
        )
      : null;

    const aggressiveOpening = aggressiveWindow.frames.find((frame) => frame.timestampMs === aggressiveFromMs) ?? null;
    const aggressiveClosing = aggressiveWindow.frames.find((frame) => frame.timestampMs === toMs) ?? null;
    const openingLadder = aggressiveOpening
      ? calculateDizyQuantLadderState(
          frameToBook(aggressiveOpening, this.priceStep),
          this.contractSize,
          this.priceStep,
        )
      : null;
    const trades = this.trades.filter((trade) => trade.timestampMs >= aggressiveFromMs && trade.timestampMs < toMs);
    const aggressiveSequence = mergeSequence(
      aggressiveWindow.sequenceContinuous,
      input.tradeSequenceContinuous,
    );
    const aggressiveHasGaps = aggressiveWindow.hasGaps || Boolean(input.tradeHasGaps);
    const aggressiveFlow = replayWithBridgeLimitations(
      buildDizyQuantAggressiveFlowSnapshot({
        symbol: this.symbol,
        trades,
        windowFromMs: aggressiveFromMs,
        windowToMs: toMs,
        sequenceContinuous: aggressiveSequence,
        hasGaps: aggressiveHasGaps,
        openingMidpoint: aggressiveOpening?.midpoint ?? null,
        closingMidpoint: aggressiveClosing?.midpoint ?? null,
        openingBidDepth25Bps: openingLadder?.values["bid-depth-25bps"] ?? null,
        openingAskDepth25Bps: openingLadder?.values["ask-depth-25bps"] ?? null,
        evaluatedAtMs: input.evaluatedAtMs,
        maxAgeMs: DIZYQUANT_LIVE_EVIDENCE_MAX_AGE_MS,
      }),
      [
        ...bridgeLimitations,
        "Aggressive-flow continuity is qualified independently from depth continuity; an unproven public-trade stream remains gapped even when depth is continuous.",
      ],
    );

    const liquidityMigration = replayWithBridgeLimitations(
      buildDizyQuantLiquidityMigrationSnapshot({
        symbol: this.symbol,
        frames: migrationWindow.frames,
        windowFromMs: migrationFromMs,
        windowToMs: toMs,
        priceStep: this.priceStep,
        contractSize: this.contractSize,
        sequenceContinuous: migrationWindow.sequenceContinuous,
        hasGaps: migrationWindow.hasGaps,
        sourceKind: "depth-stream",
        evaluatedAtMs: input.evaluatedAtMs,
        maxAgeMs: DIZYQUANT_LIVE_EVIDENCE_MAX_AGE_MS,
      }),
      bridgeLimitations,
    );

    const requestedShock = input.shockTimestampMs ?? null;
    let resilience: DizyQuantReplaySnapshot | null = null;
    let resilienceFrameCount = 0;
    let depthSequenceContinuous = migrationWindow.sequenceContinuous;
    let depthHasGaps = migrationWindow.hasGaps;
    if (requestedShock !== null) {
      assertWindowBoundary(requestedShock, "DizyQuant explicit shock time");
      const resilienceFromMs = toMs - DIZYQUANT_RESILIENCE_WINDOW_MS;
      if (resilienceFromMs <= 0 || requestedShock <= resilienceFromMs || requestedShock >= toMs) {
        throw new Error("DizyQuant explicit shock time is outside the sixty-second predictor window");
      }
      const resilienceWindow = this.sampledWindow(resilienceFromMs, toMs);
      resilienceFrameCount = resilienceWindow.frames.length;
      depthSequenceContinuous = resilienceWindow.sequenceContinuous;
      depthHasGaps = resilienceWindow.hasGaps;
      resilience = replayWithBridgeLimitations(
        buildDizyQuantResilienceSnapshot({
          symbol: this.symbol,
          frames: resilienceWindow.frames,
          windowFromMs: resilienceFromMs,
          windowToMs: toMs,
          shockTimestampMs: requestedShock,
          priceStep: this.priceStep,
          contractSize: this.contractSize,
          sequenceContinuous: resilienceWindow.sequenceContinuous,
          hasGaps: resilienceWindow.hasGaps,
          sourceKind: "depth-stream",
          evaluatedAtMs: input.evaluatedAtMs,
          maxAgeMs: DIZYQUANT_LIVE_EVIDENCE_MAX_AGE_MS,
        }),
        [
          ...bridgeLimitations,
          "The shock timestamp is explicit input to this bridge; the bridge never auto-selects a shock or market regime.",
        ],
      );
    }

    const limitations = frozenLimitations([
      ...bridgeLimitations,
      "Each formula family keeps its own Replay snapshot so depth quality cannot silently upgrade public-trade evidence or vice versa.",
      requestedShock === null
        ? "Resilience and absorption/exhaustion candidate evidence is absent until a separately reviewed explicit shock timestamp is supplied."
        : "The supplied shock timestamp remains explicit methodology input; this bridge does not choose it.",
    ]);

    return Object.freeze({
      formulaVersion: DIZYQUANT_LIVE_EVIDENCE_WINDOW_FORMULA_VERSION,
      symbol: this.symbol,
      windowToMs: toMs,
      shockTimestampMs: requestedShock,
      snapshots: Object.freeze({ ladder, aggressiveFlow, liquidityMigration, resilience }),
      depthSequenceContinuous,
      depthHasGaps,
      tradeSequenceContinuous: input.tradeSequenceContinuous,
      tradeHasGaps: Boolean(input.tradeHasGaps),
      rawDepthObservationCount: this.depth.length,
      rawTradeCount: this.trades.length,
      sampledFrames: Object.freeze({
        aggressiveFlow: aggressiveWindow.frames.length,
        liquidityMigration: migrationWindow.frames.length,
        resilience: resilienceFrameCount,
      }),
      limitations,
      researchOnly: true,
      decisionEligible: false,
      signalEligible: false,
      executionEligible: false,
      promotionEligible: false,
    });
  }

  diagnostics() {
    return Object.freeze({
      symbol: this.symbol,
      depthObservationCount: this.depth.length,
      tradeCount: this.trades.length,
      earliestDepthTimeMs: this.depth[0]?.sourceTimeMs ?? null,
      latestDepthTimeMs: this.depth.at(-1)?.sourceTimeMs ?? null,
      earliestTradeTimeMs: this.trades[0]?.timestampMs ?? null,
      latestTradeTimeMs: this.trades.at(-1)?.timestampMs ?? null,
      retentionMs: DIZYQUANT_LIVE_EVIDENCE_RETENTION_MS,
      maximumAsOfAgeMs: DIZYQUANT_LIVE_EVIDENCE_MAX_ASOF_AGE_MS,
      researchOnly: true as const,
    });
  }
}
