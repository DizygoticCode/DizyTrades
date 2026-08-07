import {
  DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS,
  DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION,
  type DizyQuantCampaignDepthPublication,
} from "./campaign-depth-runtime.ts";

export const DIZYQUANT_RUNTIME_CAMPAIGN_SYMBOLS = Object.freeze([
  "BTC_USDT",
  "ETH_USDT",
  "SOL_USDT",
] as const);

const latest = new Map<string, DizyQuantCampaignDepthPublication>();
const listeners = new Set<(value: DizyQuantCampaignDepthPublication) => void>();

export function isDizyQuantRuntimeCampaignSymbol(value: string) {
  return DIZYQUANT_RUNTIME_CAMPAIGN_SYMBOLS.includes(
    value.trim().toUpperCase() as (typeof DIZYQUANT_RUNTIME_CAMPAIGN_SYMBOLS)[number],
  );
}

export function isDizyQuantCampaignDepthPublication(
  value: unknown,
): value is DizyQuantCampaignDepthPublication {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DizyQuantCampaignDepthPublication>;
  return (
    candidate.runtimeVersion === DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION &&
    typeof candidate.symbol === "string" &&
    isDizyQuantRuntimeCampaignSymbol(candidate.symbol) &&
    Number.isSafeInteger(candidate.sourceTimeMs) &&
    Number.isSafeInteger(candidate.boundaryTimeMs) &&
    candidate.coverageBandBps === DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS &&
    typeof candidate.coverageComplete === "boolean" &&
    (candidate.sequenceContinuous === true ||
      candidate.sequenceContinuous === false ||
      candidate.sequenceContinuous === null) &&
    typeof candidate.hasGaps === "boolean" &&
    candidate.shockSelectionRequired === true &&
    Boolean(candidate.evidence) &&
    candidate.researchOnly === true &&
    candidate.decisionEligible === false &&
    candidate.signalEligible === false &&
    candidate.executionEligible === false &&
    candidate.promotionEligible === false
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
