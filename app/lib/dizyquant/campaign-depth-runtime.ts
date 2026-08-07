import { DizyQuantLiveEvidenceWindow } from "./live-evidence-window.ts";
import {
  DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS,
  DIZYQUANT_CAMPAIGN_DEPTH_PUBLICATION_MS,
  DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION,
  type DizyQuantCampaignDepthPublication,
} from "./campaign-runtime-contract.ts";
import {
  DIZYQUANT_CAMPAIGN_REGIME_FORMULA_VERSION,
  classifyDizyQuantCampaignRegime,
} from "./campaign-regime.ts";
import type { DizyQuantLiquidityFrame } from "./liquidity-migration.ts";
import type { BookView, DepthEnvelope, DepthSnapshot } from "../order-flow/types.ts";

export {
  DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS,
  DIZYQUANT_CAMPAIGN_DEPTH_PUBLICATION_MS,
  DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION,
};
export type { DizyQuantCampaignDepthPublication };

type PendingSecond = {
  envelope: DepthEnvelope;
  book: BookView;
  coverageComplete: boolean;
  sequenceContinuous: boolean | null;
  hasGaps: boolean;
  versionGaps: number;
};

const positive = (value: number) => Number.isFinite(value) && value > 0;
const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;
const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const REGIME_FRAME_RETENTION = 66 as const;
const MAX_REGIME_ASOF_AGE_MS = 1_000 as const;

export function inferDizyQuantCampaignPriceStep(
  snapshot: DepthSnapshot,
  preferredPriceUnit?: string | number | null,
) {
  const preferred = Number(preferredPriceUnit);
  if (Number.isFinite(preferred) && preferred > 0) return preferred;
  const prices = [...snapshot.bids, ...snapshot.asks]
    .map((level) => level.price)
    .filter(positive)
    .sort((left, right) => left - right);
  let step = Infinity;
  for (let index = 1; index < prices.length; index += 1) {
    const difference = prices[index] - prices[index - 1];
    if (difference > 1e-12) step = Math.min(step, difference);
  }
  if (!Number.isFinite(step) || step <= 0) return null;
  return Number(step.toPrecision(10));
}

export function depthBookCoversDizyQuantCampaignBand(
  book: BookView,
  bps = DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS,
) {
  if (
    !book.valid ||
    !book.bids.length ||
    !book.asks.length ||
    !Number.isFinite(bps) ||
    bps <= 0
  ) {
    return false;
  }
  const bestBid = book.bids[0].price;
  const bestAsk = book.asks[0].price;
  const deepestBid = book.bids.at(-1)!.price;
  const deepestAsk = book.asks.at(-1)!.price;
  if (![bestBid, bestAsk, deepestBid, deepestAsk].every(positive) || bestBid >= bestAsk) {
    return false;
  }
  const midpoint = bestBid + (bestAsk - bestBid) / 2;
  const bidBoundary = midpoint * (1 - bps / 10_000);
  const askBoundary = midpoint * (1 + bps / 10_000);
  return deepestBid <= bidBoundary && deepestAsk >= askBoundary;
}

export function bookViewFromDepthSnapshot(snapshot: DepthSnapshot): BookView {
  return {
    valid:
      snapshot.bids.length > 0 &&
      snapshot.asks.length > 0 &&
      snapshot.bids[0].price < snapshot.asks[0].price,
    version: snapshot.version,
    bids: snapshot.bids.map((level) => ({ ...level })),
    asks: snapshot.asks.map((level) => ({ ...level })),
  };
}

function mergeContinuity(left: boolean | null, right: boolean | null) {
  if (left === false || right === false) return false;
  if (left === true && right === true) return true;
  return null;
}

function frameFromBook(
  book: BookView,
  timestampMs: number,
  priceStep: number,
): DizyQuantLiquidityFrame | null {
  if (!book.valid || !book.bids.length || !book.asks.length || !positive(priceStep)) return null;
  const bestBid = book.bids[0].price;
  const bestAsk = book.asks[0].price;
  if (!positive(bestBid) || !positive(bestAsk) || bestBid >= bestAsk) return null;
  const midpoint = bestBid + (bestAsk - bestBid) / 2;
  const levels: Array<{ priceTick: number; bidContracts: number; askContracts: number }> = [];
  const ticks = new Set<number>();
  const add = (side: "bid" | "ask", price: number, contractQuantity: number) => {
    if (!positive(price) || !Number.isFinite(contractQuantity) || contractQuantity < 0) return false;
    if (contractQuantity === 0) return true;
    const priceTick = Math.round(price / priceStep);
    const reconstructed = priceTick * priceStep;
    const tolerance = Math.max(1e-9, Math.abs(priceStep) * 1e-6);
    if (
      !Number.isSafeInteger(priceTick) ||
      priceTick <= 0 ||
      !Number.isFinite(reconstructed) ||
      Math.abs(reconstructed - price) > tolerance ||
      ticks.has(priceTick) ||
      (side === "bid" ? price >= midpoint : price <= midpoint)
    ) {
      return false;
    }
    ticks.add(priceTick);
    levels.push({
      priceTick,
      bidContracts: side === "bid" ? contractQuantity : 0,
      askContracts: side === "ask" ? contractQuantity : 0,
    });
    return true;
  };
  for (const level of book.bids) if (!add("bid", level.price, level.contractQuantity)) return null;
  for (const level of book.asks) if (!add("ask", level.price, level.contractQuantity)) return null;
  if (
    !levels.some((level) => level.bidContracts > 0) ||
    !levels.some((level) => level.askContracts > 0) ||
    levels.length > 2_000
  ) {
    return null;
  }
  levels.sort((left, right) => left.priceTick - right.priceTick);
  return Object.freeze({
    timestampMs,
    midpoint,
    levels: Object.freeze(levels.map((level) => Object.freeze(level))),
  });
}

export class DizyQuantCampaignDepthRuntime {
  readonly symbol: string;
  readonly contractSize: number;
  readonly priceStep: number;
  private window: DizyQuantLiveEvidenceWindow;
  private pending: PendingSecond | null = null;
  private regimeFrames: DizyQuantLiquidityFrame[] = [];
  private lastBoundaryTimeMs = 0;
  private lastVersionGaps = 0;
  private lastSeenDepthTimeMs = 0;

  constructor(input: Readonly<{ symbol: string; contractSize: number; priceStep: number }>) {
    this.symbol = input.symbol.trim().toUpperCase();
    if (!symbolPattern.test(this.symbol)) throw new Error("Invalid DizyQuant campaign symbol");
    if (!positive(input.contractSize)) throw new Error("Invalid DizyQuant campaign contract size");
    if (!positive(input.priceStep)) throw new Error("Invalid DizyQuant campaign price step");
    this.contractSize = input.contractSize;
    this.priceStep = input.priceStep;
    this.window = new DizyQuantLiveEvidenceWindow({
      symbol: this.symbol,
      contractSize: this.contractSize,
      priceStep: this.priceStep,
    });
  }

  clear() {
    this.window.clear();
    this.pending = null;
    this.regimeFrames = [];
    this.lastBoundaryTimeMs = 0;
    this.lastVersionGaps = 0;
    this.lastSeenDepthTimeMs = 0;
  }

  private capturePending(boundaryTimeMs: number) {
    if (!this.pending) return false;
    const sourceTimeMs = this.pending.envelope.snapshot.engineTimeMs;
    this.window.captureDepth({
      timestampMs: sourceTimeMs,
      book: this.pending.book,
      sequenceContinuous: this.pending.sequenceContinuous,
      hasGaps: this.pending.hasGaps,
    });
    const asOfAgeMs = boundaryTimeMs - sourceTimeMs;
    if (
      asOfAgeMs < 0 ||
      asOfAgeMs > MAX_REGIME_ASOF_AGE_MS ||
      this.pending.hasGaps ||
      this.pending.sequenceContinuous !== true ||
      !this.pending.coverageComplete
    ) {
      this.regimeFrames = [];
      return false;
    }
    const frame = frameFromBook(this.pending.book, boundaryTimeMs, this.priceStep);
    if (!frame) {
      this.regimeFrames = [];
      return false;
    }
    const previous = this.regimeFrames.at(-1);
    if (previous && boundaryTimeMs !== previous.timestampMs + 1_000) {
      this.regimeFrames = [];
    }
    this.regimeFrames.push(frame);
    if (this.regimeFrames.length > REGIME_FRAME_RETENTION) {
      this.regimeFrames.splice(0, this.regimeFrames.length - REGIME_FRAME_RETENTION);
    }
    return true;
  }

  push(envelope: DepthEnvelope): DizyQuantCampaignDepthPublication | null {
    if (envelope.snapshot.symbol !== this.symbol) return null;
    if (
      envelope.diagnostic.sourceTimestampKnown !== true ||
      envelope.diagnostic.snapshotComplete !== true ||
      !positiveInteger(envelope.snapshot.engineTimeMs) ||
      !positiveInteger(envelope.receivedAt)
    ) {
      return null;
    }
    const recovering =
      envelope.diagnostic.recovering === true ||
      envelope.diagnostic.sourceMode === "RECONNECTING — LAST BOOK RETAINED";
    if (recovering) {
      this.clear();
      return null;
    }

    const depthTimeMs = envelope.snapshot.engineTimeMs;
    const timeRegression = depthTimeMs < this.lastSeenDepthTimeMs;
    if (timeRegression) this.clear();
    const book = bookViewFromDepthSnapshot(envelope.snapshot);
    const coverageComplete = depthBookCoversDizyQuantCampaignBand(book);
    const versionGaps = Math.max(0, envelope.diagnostic.versionGaps ?? 0);
    const gapCounterReset = this.lastSeenDepthTimeMs > 0 && versionGaps < this.lastVersionGaps;
    const gapAdvanced =
      versionGaps > this.lastVersionGaps ||
      gapCounterReset ||
      timeRegression ||
      envelope.diagnostic.sequenceContinuous === false;
    this.lastVersionGaps = versionGaps;
    this.lastSeenDepthTimeMs = depthTimeMs;

    const next: PendingSecond = {
      envelope,
      book,
      coverageComplete,
      sequenceContinuous: envelope.diagnostic.sequenceContinuous ?? null,
      hasGaps: gapAdvanced || !coverageComplete,
      versionGaps,
    };
    const currentSecond = Math.floor(depthTimeMs / 1_000) * 1_000;
    if (!this.pending) {
      this.pending = next;
      return null;
    }
    const pendingSecond =
      Math.floor(this.pending.envelope.snapshot.engineTimeMs / 1_000) * 1_000;
    if (currentSecond === pendingSecond) {
      this.pending = {
        ...next,
        coverageComplete: this.pending.coverageComplete && next.coverageComplete,
        sequenceContinuous: mergeContinuity(
          this.pending.sequenceContinuous,
          next.sequenceContinuous,
        ),
        hasGaps: this.pending.hasGaps || next.hasGaps,
      };
      return null;
    }
    if (currentSecond < pendingSecond) {
      this.clear();
      this.pending = { ...next, hasGaps: true };
      return null;
    }

    const completedSecond = this.pending;
    const boundaryTimeMs = currentSecond;
    this.capturePending(boundaryTimeMs);
    this.pending = next;
    if (
      boundaryTimeMs <= 0 ||
      boundaryTimeMs <= this.lastBoundaryTimeMs ||
      boundaryTimeMs % DIZYQUANT_CAMPAIGN_DEPTH_PUBLICATION_MS !== 0
    ) {
      return null;
    }
    this.lastBoundaryTimeMs = boundaryTimeMs;

    const regimeFrames = this.regimeFrames.slice(-61);
    const classification = classifyDizyQuantCampaignRegime({
      frames: regimeFrames,
      priceStep: this.priceStep,
      contractSize: this.contractSize,
      sequenceContinuous: regimeFrames.length === 61 ? true : null,
      hasGaps: regimeFrames.length !== 61,
    });
    if (
      !classification.available ||
      classification.regime === null ||
      classification.direction === null ||
      classification.windowFromMs === null ||
      classification.windowToMs !== boundaryTimeMs
    ) {
      return null;
    }
    const baselineMidpoint = regimeFrames.at(-1)?.midpoint ?? null;
    if (!positive(baselineMidpoint ?? Number.NaN)) return null;
    const selectedShockTimestampMs =
      classification.regime === "volatility-shock"
        ? classification.shock?.timestampMs ?? null
        : null;
    if (classification.regime === "volatility-shock" && selectedShockTimestampMs === null) {
      return null;
    }

    const evidence = this.window.build({
      windowToMs: boundaryTimeMs,
      evaluatedAtMs: Math.max(boundaryTimeMs, envelope.receivedAt),
      tradeSequenceContinuous: null,
      tradeHasGaps: false,
      shockTimestampMs: selectedShockTimestampMs,
    });
    if (
      evidence.snapshots.ladder === null ||
      evidence.snapshots.ladder.availability !== "fresh" ||
      evidence.snapshots.liquidityMigration.availability !== "fresh" ||
      evidence.snapshots.liquidityMigration.sequenceContinuous !== true ||
      evidence.snapshots.liquidityMigration.hasGaps
    ) {
      return null;
    }
    if (
      selectedShockTimestampMs !== null &&
      (evidence.snapshots.resilience === null ||
        evidence.snapshots.resilience.availability !== "fresh" ||
        evidence.snapshots.resilience.sequenceContinuous !== true ||
        evidence.snapshots.resilience.hasGaps)
    ) {
      return null;
    }

    return Object.freeze({
      runtimeVersion: DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION,
      symbol: this.symbol,
      sourceTimeMs: completedSecond.envelope.snapshot.engineTimeMs,
      receivedTimeMs: envelope.receivedAt,
      boundaryTimeMs,
      baselineMidpoint: baselineMidpoint!,
      coverageBandBps: DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS,
      coverageComplete: true,
      sequenceContinuous: true,
      hasGaps: false,
      versionGaps: completedSecond.versionGaps,
      regimeFormulaVersion: DIZYQUANT_CAMPAIGN_REGIME_FORMULA_VERSION,
      regime: classification.regime,
      regimeDirection: classification.direction,
      regimeWindowFromMs: classification.windowFromMs,
      regimeWindowToMs: classification.windowToMs,
      selectedShockTimestampMs,
      shockSelectionRequired: false,
      evidence,
      researchOnly: true,
      decisionEligible: false,
      signalEligible: false,
      executionEligible: false,
      promotionEligible: false,
    });
  }
}
