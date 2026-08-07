import {
  DizyQuantLiveEvidenceWindow,
  type DizyQuantLiveEvidenceBuildResult,
} from "./live-evidence-window.ts";
import type { BookView, DepthEnvelope, RawTrade } from "../order-flow/types.ts";
import type { NormalizedPublicTrade } from "../order-flow/intelligence.ts";

export const DIZYQUANT_ORDER_FLOW_RUNTIME_VERSION =
  "dizyquant-order-flow-runtime/1.0.0" as const;
export const DIZYQUANT_ORDER_FLOW_RUNTIME_MAX_MARKETS = 4 as const;

export type DizyQuantOrderFlowRuntimeInput = Readonly<{
  envelope: DepthEnvelope;
  book: BookView;
  marketKey: string;
  marketType: "spot" | "futures";
  contractSize: number;
  tickSize: number | null;
  recentTrades: readonly NormalizedPublicTrade[];
}>;

export type DizyQuantOrderFlowRuntimePublication = Readonly<{
  runtimeVersion: typeof DIZYQUANT_ORDER_FLOW_RUNTIME_VERSION;
  marketKey: string;
  symbol: string;
  publishedAtMs: number;
  evidence: DizyQuantLiveEvidenceBuildResult;
  researchOnly: true;
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
}>;

type RuntimeState = {
  identity: string;
  marketKey: string;
  symbol: string;
  window: DizyQuantLiveEvidenceWindow;
  lastDepthTimeMs: number;
  lastBoundaryMs: number;
  lastVersionGaps: number;
  latest: DizyQuantOrderFlowRuntimePublication | null;
  touchedAtMs: number;
};

const states = new Map<string, RuntimeState>();
const listeners = new Set<(value: DizyQuantOrderFlowRuntimePublication) => void>();

const positive = (value: number) => Number.isFinite(value) && value > 0;
const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;
const cleanKey = (value: string) => value.trim().slice(0, 160);

function identity(input: DizyQuantOrderFlowRuntimeInput) {
  return `${cleanKey(input.marketKey)}|${input.envelope.snapshot.symbol}|${input.contractSize}|${input.tickSize}`;
}

function evictIfNeeded() {
  while (states.size > DIZYQUANT_ORDER_FLOW_RUNTIME_MAX_MARKETS) {
    const oldest = [...states.entries()].sort(
      (left, right) => left[1].touchedAtMs - right[1].touchedAtMs || left[0].localeCompare(right[0]),
    )[0];
    if (!oldest) return;
    states.delete(oldest[0]);
  }
}

function ensureState(input: DizyQuantOrderFlowRuntimeInput) {
  const marketKey = cleanKey(input.marketKey);
  const nextIdentity = identity(input);
  const existing = states.get(marketKey);
  if (existing?.identity === nextIdentity) return existing;
  const next: RuntimeState = {
    identity: nextIdentity,
    marketKey,
    symbol: input.envelope.snapshot.symbol,
    window: new DizyQuantLiveEvidenceWindow({
      symbol: input.envelope.snapshot.symbol,
      contractSize: input.contractSize,
      priceStep: input.tickSize!,
    }),
    lastDepthTimeMs: 0,
    lastBoundaryMs: 0,
    lastVersionGaps: 0,
    latest: null,
    touchedAtMs: input.envelope.receivedAt,
  };
  states.set(marketKey, next);
  evictIfNeeded();
  return next;
}

function resetState(state: RuntimeState) {
  state.window.clear();
  state.lastDepthTimeMs = 0;
  state.lastBoundaryMs = 0;
  state.latest = null;
}

function rawTrade(symbol: string, trade: NormalizedPublicTrade): RawTrade | null {
  if (
    trade.side === "unknown" ||
    !positiveInteger(trade.timeMs) ||
    !positive(trade.price) ||
    !positive(trade.quantity)
  ) {
    return null;
  }
  const side = trade.side === "buy-aggressor" ? "buy" : "sell";
  const tradeId = trade.id?.trim() || `${symbol}:${trade.timeMs}:${trade.price}:${trade.quantity}:${side}`;
  const notional = trade.price * trade.quantity;
  if (!positive(notional)) return null;
  return Object.freeze({
    tradeId,
    timestampMs: trade.timeMs,
    price: trade.price,
    quantity: trade.quantity,
    notional,
    side,
  });
}

function publish(state: RuntimeState, evidence: DizyQuantLiveEvidenceBuildResult, publishedAtMs: number) {
  const value = Object.freeze({
    runtimeVersion: DIZYQUANT_ORDER_FLOW_RUNTIME_VERSION,
    marketKey: state.marketKey,
    symbol: state.symbol,
    publishedAtMs,
    evidence,
    researchOnly: true as const,
    decisionEligible: false as const,
    signalEligible: false as const,
    executionEligible: false as const,
    promotionEligible: false as const,
  });
  state.latest = value;
  for (const listener of listeners) {
    try {
      listener(value);
    } catch {
      // Research observers are never allowed to disturb the market-data path.
    }
  }
  return value;
}

export function observeDizyQuantOrderFlowRuntime(
  input: DizyQuantOrderFlowRuntimeInput,
): DizyQuantOrderFlowRuntimePublication | null {
  if (
    input.marketType !== "futures" ||
    !cleanKey(input.marketKey) ||
    !positive(input.contractSize) ||
    input.tickSize === null ||
    !positive(input.tickSize) ||
    input.envelope.diagnostic.sourceTimestampKnown !== true
  ) {
    return null;
  }

  const depthTimeMs = input.envelope.snapshot.engineTimeMs;
  if (!positiveInteger(depthTimeMs) || !positiveInteger(input.envelope.receivedAt)) return null;

  const state = ensureState(input);
  state.touchedAtMs = input.envelope.receivedAt;
  const versionGaps = Math.max(0, input.envelope.diagnostic.versionGaps ?? 0);
  const recovering =
    input.envelope.diagnostic.recovering === true ||
    input.envelope.diagnostic.sourceMode === "RECONNECTING — LAST BOOK RETAINED";
  const gapCounterReset = state.lastDepthTimeMs > 0 && versionGaps < state.lastVersionGaps;
  const gapAdvanced =
    versionGaps > state.lastVersionGaps ||
    gapCounterReset ||
    input.envelope.diagnostic.sequenceContinuous === false;
  state.lastVersionGaps = versionGaps;

  if (recovering) {
    resetState(state);
    return null;
  }

  const sequenceContinuous = input.envelope.diagnostic.sequenceContinuous ?? null;
  if (gapAdvanced || depthTimeMs < state.lastDepthTimeMs) resetState(state);

  if (depthTimeMs > state.lastDepthTimeMs) {
    state.window.captureDepth({
      timestampMs: depthTimeMs,
      book: input.book,
      sequenceContinuous,
      hasGaps: gapAdvanced,
    });
    state.lastDepthTimeMs = depthTimeMs;
  }

  for (const trade of input.recentTrades) {
    const normalized = rawTrade(state.symbol, trade);
    if (normalized) state.window.captureTrade(normalized);
  }

  const boundaryMs = Math.floor(depthTimeMs / 1_000) * 1_000;
  if (boundaryMs <= 0 || boundaryMs <= state.lastBoundaryMs) return state.latest;
  state.lastBoundaryMs = boundaryMs;

  const evidence = state.window.build({
    windowToMs: boundaryMs,
    evaluatedAtMs: Math.max(boundaryMs, input.envelope.receivedAt),
    tradeSequenceContinuous: null,
    tradeHasGaps: false,
    shockTimestampMs: null,
  });
  return publish(state, evidence, input.envelope.receivedAt);
}

export function readDizyQuantOrderFlowRuntimeEvidence(marketKey: string) {
  return states.get(cleanKey(marketKey))?.latest ?? null;
}

export function subscribeDizyQuantOrderFlowRuntime(
  listener: (value: DizyQuantOrderFlowRuntimePublication) => void,
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearDizyQuantOrderFlowRuntime(marketKey?: string) {
  if (marketKey === undefined) {
    states.clear();
    return;
  }
  states.delete(cleanKey(marketKey));
}

export function dizyQuantOrderFlowRuntimeDiagnostics() {
  return Object.freeze(
    [...states.values()]
      .sort((left, right) => left.marketKey.localeCompare(right.marketKey))
      .map((state) =>
        Object.freeze({
          marketKey: state.marketKey,
          symbol: state.symbol,
          lastDepthTimeMs: state.lastDepthTimeMs || null,
          lastBoundaryMs: state.lastBoundaryMs || null,
          lastVersionGaps: state.lastVersionGaps,
          hasPublication: state.latest !== null,
          touchedAtMs: state.touchedAtMs,
          researchOnly: true as const,
        }),
      ),
  );
}
