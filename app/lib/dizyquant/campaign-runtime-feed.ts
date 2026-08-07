import {
  DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS,
  DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION,
  DIZYQUANT_CAMPAIGN_REGIME_RUNTIME_VERSION,
  type DizyQuantCampaignDepthPublication,
  type DizyQuantCampaignRuntimeDirection,
  type DizyQuantCampaignRuntimeRegime,
} from "./campaign-runtime-contract.ts";
import type { DizyQuantLiveEvidenceBuildResult } from "./live-evidence-window.ts";

export const DIZYQUANT_RUNTIME_CAMPAIGN_SYMBOLS = Object.freeze([
  "BTC_USDT",
  "ETH_USDT",
  "SOL_USDT",
] as const);

type DizyQuantCampaignRuntimeFeedState = {
  latest: Map<string, DizyQuantCampaignDepthPublication>;
  listeners: Set<(value: DizyQuantCampaignDepthPublication) => void>;
};
type GlobalCampaignRuntimeFeed = typeof globalThis & {
  __dizyQuantCampaignRuntimeFeed?: DizyQuantCampaignRuntimeFeedState;
};

const regimes = new Set<DizyQuantCampaignRuntimeRegime>([
  "range",
  "directional",
  "volatility-shock",
]);
const directions = new Set<DizyQuantCampaignRuntimeDirection>(["up", "down", "flat"]);
const root = globalThis as GlobalCampaignRuntimeFeed;
root.__dizyQuantCampaignRuntimeFeed ??= {
  latest: new Map<string, DizyQuantCampaignDepthPublication>(),
  listeners: new Set<(value: DizyQuantCampaignDepthPublication) => void>(),
};
const latest = root.__dizyQuantCampaignRuntimeFeed.latest;
const listeners = root.__dizyQuantCampaignRuntimeFeed.listeners;

export function isDizyQuantRuntimeCampaignSymbol(value: string) {
  return DIZYQUANT_RUNTIME_CAMPAIGN_SYMBOLS.includes(
    value.trim().toUpperCase() as (typeof DIZYQUANT_RUNTIME_CAMPAIGN_SYMBOLS)[number],
  );
}

function validEvidence(
  value: unknown,
  symbol: string,
  sourceTimeMs: number,
  boundaryTimeMs: number,
  shockTimestampMs: number | null,
): value is DizyQuantLiveEvidenceBuildResult {
  if (!value || typeof value !== "object") return false;
  const evidence = value as Partial<DizyQuantLiveEvidenceBuildResult>;
  const ladder = evidence.snapshots?.ladder;
  const migration = evidence.snapshots?.liquidityMigration;
  const resilience = evidence.snapshots?.resilience;
  return (
    evidence.symbol === symbol &&
    evidence.windowToMs === boundaryTimeMs &&
    evidence.shockTimestampMs === shockTimestampMs &&
    Boolean(evidence.snapshots) &&
    ladder?.availability === "fresh" &&
    ladder.sourceTimeMs === sourceTimeMs &&
    migration?.availability === "fresh" &&
    migration.sequenceContinuous === true &&
    migration.hasGaps === false &&
    (shockTimestampMs === null ||
      (resilience?.availability === "fresh" &&
        resilience.sequenceContinuous === true &&
        resilience.hasGaps === false)) &&
    Array.isArray(evidence.limitations) &&
    evidence.researchOnly === true &&
    evidence.decisionEligible === false &&
    evidence.signalEligible === false &&
    evidence.executionEligible === false &&
    evidence.promotionEligible === false
  );
}

export function isDizyQuantCampaignDepthPublication(
  value: unknown,
): value is DizyQuantCampaignDepthPublication {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DizyQuantCampaignDepthPublication>;
  if (
    candidate.runtimeVersion !== DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION ||
    typeof candidate.symbol !== "string" ||
    !isDizyQuantRuntimeCampaignSymbol(candidate.symbol) ||
    !Number.isSafeInteger(candidate.sourceTimeMs) ||
    Number(candidate.sourceTimeMs) <= 0 ||
    !Number.isSafeInteger(candidate.receivedTimeMs) ||
    Number(candidate.receivedTimeMs) <= 0 ||
    !Number.isSafeInteger(candidate.boundaryTimeMs) ||
    Number(candidate.boundaryTimeMs) <= 0 ||
    Number(candidate.sourceTimeMs) > Number(candidate.boundaryTimeMs) ||
    Number(candidate.boundaryTimeMs) - Number(candidate.sourceTimeMs) > 1_000 ||
    !Number.isFinite(candidate.baselineMidpoint) ||
    Number(candidate.baselineMidpoint) <= 0 ||
    candidate.coverageBandBps !== DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS ||
    candidate.coverageComplete !== true ||
    candidate.sequenceContinuous !== true ||
    candidate.hasGaps !== false ||
    !Number.isSafeInteger(candidate.versionGaps) ||
    Number(candidate.versionGaps) < 0 ||
    candidate.regimeFormulaVersion !== DIZYQUANT_CAMPAIGN_REGIME_RUNTIME_VERSION ||
    !regimes.has(candidate.regime as DizyQuantCampaignRuntimeRegime) ||
    !directions.has(candidate.regimeDirection as DizyQuantCampaignRuntimeDirection) ||
    !Number.isSafeInteger(candidate.regimeWindowFromMs) ||
    Number(candidate.regimeWindowFromMs) <= 0 ||
    candidate.regimeWindowFromMs !== Number(candidate.boundaryTimeMs) - 60_000 ||
    !Number.isSafeInteger(candidate.regimeWindowToMs) ||
    candidate.regimeWindowToMs !== candidate.boundaryTimeMs ||
    !Object.prototype.hasOwnProperty.call(candidate, "selectedShockTimestampMs") ||
    candidate.shockSelectionRequired !== false ||
    candidate.researchOnly !== true ||
    candidate.decisionEligible !== false ||
    candidate.signalEligible !== false ||
    candidate.executionEligible !== false ||
    candidate.promotionEligible !== false
  ) {
    return false;
  }
  const shockTimestampMs = candidate.selectedShockTimestampMs ?? null;
  if (candidate.regime === "volatility-shock") {
    if (
      !Number.isSafeInteger(shockTimestampMs) ||
      shockTimestampMs! <= candidate.regimeWindowFromMs! ||
      shockTimestampMs! >= candidate.regimeWindowToMs!
    ) {
      return false;
    }
  } else if (shockTimestampMs !== null) {
    return false;
  }
  return validEvidence(
    candidate.evidence,
    candidate.symbol,
    candidate.sourceTimeMs!,
    candidate.boundaryTimeMs!,
    shockTimestampMs,
  );
}

export function publishDizyQuantCampaignDepthPublication(value: unknown) {
  if (!isDizyQuantCampaignDepthPublication(value)) return null;
  const previous = latest.get(value.symbol);
  if (previous && value.boundaryTimeMs <= previous.boundaryTimeMs) return previous;
  latest.set(value.symbol, value);
  for (const listener of listeners) {
    try {
      listener(value);
    } catch {}
  }
  return value;
}

export function readDizyQuantCampaignDepthPublication(symbol: string) {
  return latest.get(symbol.trim().toUpperCase()) ?? null;
}

export function subscribeDizyQuantCampaignDepthPublications(
  listener: (value: DizyQuantCampaignDepthPublication) => void,
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearDizyQuantCampaignDepthPublication(symbol?: string) {
  if (symbol === undefined) latest.clear();
  else latest.delete(symbol.trim().toUpperCase());
}
