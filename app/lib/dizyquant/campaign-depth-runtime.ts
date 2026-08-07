import {
  DizyQuantLiveEvidenceWindow,
  type DizyQuantLiveEvidenceBuildResult,
} from "./live-evidence-window.ts";
import type { BookView, DepthEnvelope, DepthSnapshot } from "../order-flow/types.ts";

export const DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION =
  "dizyquant-campaign-depth-runtime/1.0.0" as const;
export const DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS = 25 as const;

export type DizyQuantCampaignDepthPublication = Readonly<{
  runtimeVersion: typeof DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION;
  symbol: string;
  sourceTimeMs: number;
  receivedTimeMs: number;
  boundaryTimeMs: number;
  coverageBandBps: typeof DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS;
  coverageComplete: boolean;
  sequenceContinuous: boolean | null;
  hasGaps: boolean;
  versionGaps: number;
  eligibleShockTimestamps: readonly number[];
  evidence: DizyQuantLiveEvidenceBuildResult;
  researchOnly: true;
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
}>;

const positive = (value: number) => Number.isFinite(value) && value > 0;
const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;
const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;

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

export class DizyQuantCampaignDepthRuntime {
  readonly symbol: string;
  readonly contractSize: number;
  readonly priceStep: number;
  private window: DizyQuantLiveEvidenceWindow;
  private lastDepthTimeMs = 0;
  private lastBoundaryTimeMs = 0;
  private lastVersionGaps = 0;

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
    this.lastDepthTimeMs = 0;
    this.lastBoundaryTimeMs = 0;
    this.lastVersionGaps = 0;
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
    const book = bookViewFromDepthSnapshot(envelope.snapshot);
    const coverageComplete = depthBookCoversDizyQuantCampaignBand(book);
    const versionGaps = Math.max(0, envelope.diagnostic.versionGaps ?? 0);
    const gapCounterReset = this.lastDepthTimeMs > 0 && versionGaps < this.lastVersionGaps;
    const gapAdvanced =
      versionGaps > this.lastVersionGaps ||
      gapCounterReset ||
      envelope.diagnostic.sequenceContinuous === false;
    this.lastVersionGaps = versionGaps;

    if (depthTimeMs < this.lastDepthTimeMs) this.clear();
    if (depthTimeMs > this.lastDepthTimeMs) {
      this.window.captureDepth({
        timestampMs: depthTimeMs,
        book,
        sequenceContinuous: envelope.diagnostic.sequenceContinuous ?? null,
        hasGaps: gapAdvanced || !coverageComplete,
      });
      this.lastDepthTimeMs = depthTimeMs;
    }

    const boundaryTimeMs = Math.floor(depthTimeMs / 1_000) * 1_000;
    if (boundaryTimeMs <= 0 || boundaryTimeMs <= this.lastBoundaryTimeMs) return null;
    this.lastBoundaryTimeMs = boundaryTimeMs;

    const evidence = this.window.build({
      windowToMs: boundaryTimeMs,
      evaluatedAtMs: Math.max(boundaryTimeMs, envelope.receivedAt),
      tradeSequenceContinuous: null,
      tradeHasGaps: false,
      shockTimestampMs: null,
    });
    const eligibleShockTimestamps = coverageComplete
      ? this.window.eligibleShockTimestamps(boundaryTimeMs)
      : Object.freeze([] as number[]);

    return Object.freeze({
      runtimeVersion: DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION,
      symbol: this.symbol,
      sourceTimeMs: depthTimeMs,
      receivedTimeMs: envelope.receivedAt,
      boundaryTimeMs,
      coverageBandBps: DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS,
      coverageComplete,
      sequenceContinuous: evidence.depthSequenceContinuous,
      hasGaps: evidence.depthHasGaps,
      versionGaps,
      eligibleShockTimestamps,
      evidence,
      researchOnly: true,
      decisionEligible: false,
      signalEligible: false,
      executionEligible: false,
      promotionEligible: false,
    });
  }
}
