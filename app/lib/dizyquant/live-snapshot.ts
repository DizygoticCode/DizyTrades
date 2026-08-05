import type { DizyBrainSnapshot } from "../dizybrain-snapshot.ts";
import type { DizyFlowIntelligenceSnapshot } from "../order-flow/intelligence.ts";

export const DIZYQUANT_LIVE_SCHEMA_VERSION = "dizyquant.live.v1" as const;
export const DIZYQUANT_LIVE_STORAGE_KEY = "dizytrades:dizyquant-live:v1";
export const DIZYQUANT_LIVE_EVENT = "dizytrades:dizyquant-live-change";
export const DIZYQUANT_LIVE_STALE_AFTER_MS = 15_000;

export type DizyQuantLiveState = "waiting" | "live" | "limited" | "replay" | "stale";
export type DizyQuantFactorId = "strategy-balance" | "book-imbalance" | "aggressor-imbalance" | "liquidity-balance" | "spread-friction";
export type DizyQuantLiveFactor = Readonly<{
  id: DizyQuantFactorId;
  label: string;
  value: number | null;
  unit: "%";
  evidence: "confirmed-candle" | "snapshot" | "continuous-stream";
  interpretation: "signed-pressure" | "friction";
}>;

export type DizyQuantLiveInput = Readonly<{
  snapshot: DizyBrainSnapshot;
  liveFlow: DizyFlowIntelligenceSnapshot | null;
  symbol: string;
  market: string;
  timeframe: string;
  feedState: string;
  replay: boolean;
  flowEnabled: boolean;
}>;

export type DizyQuantLiveSnapshot = Readonly<{
  schemaVersion: typeof DIZYQUANT_LIVE_SCHEMA_VERSION;
  capturedAt: number;
  source: "derived-terminal-evidence";
  researchOnly: true;
  signalEligible: false;
  executionEligible: false;
  market: Readonly<{
    symbol: string;
    venue: string;
    timeframe: string;
    feedState: string;
    replay: boolean;
  }>;
  strategy: Readonly<{
    timestamp: string;
    direction: DizyBrainSnapshot["currentDirection"];
    marketBias: string;
    marketPhase: string;
    longScore: number;
    shortScore: number;
    qualificationThreshold: number;
    qualified: boolean;
    confirmedSignal: DizyBrainSnapshot["confirmedSignal"];
    confidencePct: number;
  }>;
  flow: Readonly<{
    enabled: boolean;
    availability: DizyFlowIntelligenceSnapshot["availability"] | "disabled" | "waiting";
    receivedAt: number | null;
    confidencePct: number | null;
    confidenceBand: DizyFlowIntelligenceSnapshot["confidenceBand"] | "unavailable";
    referencePrice: number | null;
    spreadPct: number | null;
    wallCount: number;
    withdrawalCount: number;
    replenishmentCount: number;
    sweepCount: number;
    absorptionCount: number;
    limitationCount: number;
  }>;
  factors: readonly DizyQuantLiveFactor[];
  availableFactorCount: number;
  totalFactorCount: number;
  evidenceCoveragePct: number;
  sourceConfidencePct: number;
}>;

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

const finite = (value: unknown): number | null => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const rounded = (value: number | null, places = 2) => value === null ? null : Number(value.toFixed(places));
const signedPercent = (value: number | null) => value === null ? null : rounded(clamp(value * 100, -100, 100));
const text = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : fallback;

function selectedImbalance(flow: DizyFlowIntelligenceSnapshot | null) {
  const band = flow?.imbalance.bands.find(value => value.bandPct === .25) ?? flow?.imbalance.bands[0];
  return signedPercent(band?.value ?? null);
}

function selectedLiquidityBalance(flow: DizyFlowIntelligenceSnapshot | null) {
  const band = flow?.depth.bands.find(value => value.bandPct === .5) ?? flow?.depth.bands.at(-1);
  if (!band) return null;
  const total = band.bidNotional + band.askNotional;
  return total > 0 ? rounded(clamp((band.bidNotional - band.askNotional) / total * 100, -100, 100)) : null;
}

function factor(
  id: DizyQuantFactorId,
  label: string,
  value: number | null,
  evidence: DizyQuantLiveFactor["evidence"],
  interpretation: DizyQuantLiveFactor["interpretation"],
  places = 2,
): DizyQuantLiveFactor {
  return Object.freeze({ id, label, value: rounded(value, places), unit: "%", evidence, interpretation });
}

export function createDizyQuantLiveSnapshot(input: DizyQuantLiveInput, capturedAt = Date.now()): DizyQuantLiveSnapshot {
  const flow = input.replay ? null : input.liveFlow;
  const strategyConfidence = clamp(finite(input.snapshot.explanation.confidencePercent) ?? 0, 0, 100);
  const strategyBalance = rounded(clamp((input.snapshot.longScore - input.snapshot.shortScore) / 5 * 100, -100, 100));
  const bookImbalance = selectedImbalance(flow);
  const aggressorImbalance = signedPercent(flow?.trades.aggressorImbalance ?? null);
  const liquidityBalance = selectedLiquidityBalance(flow);
  const spreadFriction = rounded(flow?.spread.percentage ?? null, 4);
  const factors = Object.freeze([
    factor("strategy-balance", "Confirmed-candle balance", strategyBalance, "confirmed-candle", "signed-pressure"),
    factor("book-imbalance", "Visible book imbalance", bookImbalance, "snapshot", "signed-pressure"),
    factor("aggressor-imbalance", "Aggressor trade imbalance", aggressorImbalance, "continuous-stream", "signed-pressure"),
    factor("liquidity-balance", "Near-market liquidity balance", liquidityBalance, "snapshot", "signed-pressure"),
    factor("spread-friction", "Spread friction", spreadFriction, "snapshot", "friction", 4),
  ]);
  const availableFactorCount = factors.filter(value => value.value !== null).length;
  const flowConfidence = flow ? clamp(flow.intelligenceConfidence, 0, 100) : null;
  const sourceConfidencePct = rounded(flowConfidence === null ? strategyConfidence : (strategyConfidence + flowConfidence) / 2) ?? 0;
  const evidenceCoveragePct = rounded(availableFactorCount / factors.length * 100) ?? 0;
  const snapshot: DizyQuantLiveSnapshot = {
    schemaVersion: DIZYQUANT_LIVE_SCHEMA_VERSION,
    capturedAt: Math.max(0, finite(capturedAt) ?? 0),
    source: "derived-terminal-evidence",
    researchOnly: true,
    signalEligible: false,
    executionEligible: false,
    market: Object.freeze({
      symbol: text(input.symbol, "Unknown"),
      venue: text(input.market, "Unknown market"),
      timeframe: text(input.timeframe, "Unknown"),
      feedState: text(input.feedState, "Unknown"),
      replay: Boolean(input.replay),
    }),
    strategy: Object.freeze({
      timestamp: text(input.snapshot.timestamp, new Date(0).toISOString()),
      direction: input.snapshot.currentDirection,
      marketBias: text(input.snapshot.marketBias, "Neutral"),
      marketPhase: text(input.snapshot.marketPhase, "Unavailable"),
      longScore: clamp(finite(input.snapshot.longScore) ?? 0, 0, 5),
      shortScore: clamp(finite(input.snapshot.shortScore) ?? 0, 0, 5),
      qualificationThreshold: clamp(finite(input.snapshot.qualificationThreshold) ?? 0, 0, 5),
      qualified: Boolean(input.snapshot.qualified),
      confirmedSignal: input.snapshot.confirmedSignal,
      confidencePct: strategyConfidence,
    }),
    flow: Object.freeze({
      enabled: Boolean(input.flowEnabled),
      availability: input.replay ? "disabled" : flow?.availability ?? (input.flowEnabled ? "waiting" : "disabled"),
      receivedAt: flow?.receivedTimeMs ?? null,
      confidencePct: flowConfidence,
      confidenceBand: flow?.confidenceBand ?? "unavailable",
      referencePrice: rounded(flow?.referencePrice ?? null, 8),
      spreadPct: spreadFriction,
      wallCount: flow?.walls.candidates.length ?? 0,
      withdrawalCount: flow?.walls.withdrawals.length ?? 0,
      replenishmentCount: flow?.walls.replenishment.length ?? 0,
      sweepCount: flow?.sweeps.candidates.length ?? 0,
      absorptionCount: flow?.absorption.candidates.length ?? 0,
      limitationCount: flow?.limitations.length ?? 0,
    }),
    factors,
    availableFactorCount,
    totalFactorCount: factors.length,
    evidenceCoveragePct,
    sourceConfidencePct,
  };
  return Object.freeze(snapshot);
}

export function isDizyQuantLiveSnapshot(value: unknown): value is DizyQuantLiveSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DizyQuantLiveSnapshot>;
  return candidate.schemaVersion === DIZYQUANT_LIVE_SCHEMA_VERSION
    && candidate.source === "derived-terminal-evidence"
    && candidate.researchOnly === true
    && candidate.signalEligible === false
    && candidate.executionEligible === false
    && Number.isFinite(candidate.capturedAt)
    && Array.isArray(candidate.factors)
    && candidate.factors.length === 5
    && Boolean(candidate.market)
    && Boolean(candidate.strategy)
    && Boolean(candidate.flow);
}

export function readDizyQuantLiveSnapshot(storage?: StorageReader | null): DizyQuantLiveSnapshot | null {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!source) return null;
  try {
    const value = JSON.parse(source.getItem(DIZYQUANT_LIVE_STORAGE_KEY) ?? "null");
    return isDizyQuantLiveSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeDizyQuantLiveSnapshot(snapshot: DizyQuantLiveSnapshot, storage?: StorageWriter | null) {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  try { source?.setItem(DIZYQUANT_LIVE_STORAGE_KEY, JSON.stringify(snapshot)); } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DIZYQUANT_LIVE_EVENT, { detail: snapshot }));
  return snapshot;
}

export function classifyDizyQuantLiveSnapshot(snapshot: DizyQuantLiveSnapshot | null, now = Date.now(), staleAfterMs = DIZYQUANT_LIVE_STALE_AFTER_MS): DizyQuantLiveState {
  if (!snapshot) return "waiting";
  if (snapshot.market.replay) return "replay";
  if (Math.max(0, now - snapshot.capturedAt) > staleAfterMs) return "stale";
  const feed = snapshot.market.feedState.toLowerCase();
  if (feed.includes("recover") || feed.includes("offline") || feed.includes("stale") || snapshot.flow.availability === "limited" || snapshot.flow.availability === "stale" || snapshot.flow.availability === "disconnected") return "limited";
  return "live";
}
