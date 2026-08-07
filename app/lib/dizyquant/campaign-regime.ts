import type { DizyQuantLiquidityFrame } from "./liquidity-migration.ts";
import {
  DIZYQUANT_RESILIENCE_WINDOW_MS,
  DIZYQUANT_SHOCK_DEPTH_LOSS_PCT,
  DIZYQUANT_SHOCK_SPREAD_WIDENING_PCT,
} from "./resilience.ts";

export const DIZYQUANT_CAMPAIGN_REGIME_SCHEMA_VERSION = 1 as const;
export const DIZYQUANT_CAMPAIGN_REGIME_FORMULA_VERSION =
  "dizyquant-campaign-regime/1.0.0" as const;
export const DIZYQUANT_CAMPAIGN_REGIME_GRID_MS = 1_000 as const;
export const DIZYQUANT_CAMPAIGN_REGIME_DEPTH_COVERAGE_BPS = 25 as const;
export const DIZYQUANT_CAMPAIGN_REGIME_MAX_LEVELS_PER_FRAME = 2_000 as const;
export const DIZYQUANT_DIRECTIONAL_MIN_NET_BPS = 4 as const;
export const DIZYQUANT_DIRECTIONAL_NOISE_MULTIPLE = 4 as const;
export const DIZYQUANT_DIRECTIONAL_MIN_EFFICIENCY = 0.35 as const;
export const DIZYQUANT_DIRECTIONAL_MIN_SIGN_CONSISTENCY = 0.55 as const;

export type DizyQuantCampaignRegime =
  | "range"
  | "directional"
  | "volatility-shock";
export type DizyQuantCampaignDirection = "up" | "down" | "flat";
export type DizyQuantCampaignShockComponent = "spread" | "bid-depth" | "ask-depth";

export type DizyQuantCampaignShockSelection = Readonly<{
  timestampMs: number;
  componentCount: number;
  components: readonly DizyQuantCampaignShockComponent[];
  severityScore: number;
  spreadWideningPct: number;
  bidDepthLossPct: number;
  askDepthLossPct: number;
}>;

export type DizyQuantCampaignRegimeResult = Readonly<{
  schemaVersion: typeof DIZYQUANT_CAMPAIGN_REGIME_SCHEMA_VERSION;
  formulaVersion: typeof DIZYQUANT_CAMPAIGN_REGIME_FORMULA_VERSION;
  available: boolean;
  regime: DizyQuantCampaignRegime | null;
  direction: DizyQuantCampaignDirection | null;
  windowFromMs: number | null;
  windowToMs: number | null;
  frameCount: number;
  netMoveBps: number | null;
  pathMoveBps: number | null;
  medianAbsStepBps: number | null;
  directionalFloorBps: number | null;
  directionalEfficiency: number | null;
  signConsistency: number | null;
  shock: DizyQuantCampaignShockSelection | null;
  sequenceContinuous: boolean | null;
  hasGaps: boolean;
  limitations: readonly string[];
  researchOnly: true;
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
}>;

type FrameStats = Readonly<{
  spreadBps: number;
  bidDepth25Bps: number;
  askDepth25Bps: number;
}>;

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const finiteNonNegative = (value: number) => Number.isFinite(value) && value >= 0;
const round = (value: number, places = 10) => Number(value.toFixed(places));

function median(values: readonly number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function unavailable(reason: string, sequenceContinuous: boolean | null, hasGaps: boolean) {
  return Object.freeze({
    schemaVersion: DIZYQUANT_CAMPAIGN_REGIME_SCHEMA_VERSION,
    formulaVersion: DIZYQUANT_CAMPAIGN_REGIME_FORMULA_VERSION,
    available: false,
    regime: null,
    direction: null,
    windowFromMs: null,
    windowToMs: null,
    frameCount: 0,
    netMoveBps: null,
    pathMoveBps: null,
    medianAbsStepBps: null,
    directionalFloorBps: null,
    directionalEfficiency: null,
    signConsistency: null,
    shock: null,
    sequenceContinuous,
    hasGaps,
    limitations: Object.freeze([reason]),
    researchOnly: true as const,
    decisionEligible: false as const,
    signalEligible: false as const,
    executionEligible: false as const,
    promotionEligible: false as const,
  });
}

function frameStats(
  frame: DizyQuantLiquidityFrame,
  priceStep: number,
  contractSize: number,
): FrameStats | null {
  if (
    !frame ||
    typeof frame !== "object" ||
    !Number.isSafeInteger(frame.timestampMs) ||
    !finitePositive(frame.midpoint) ||
    !Array.isArray(frame.levels) ||
    !frame.levels.length ||
    frame.levels.length > DIZYQUANT_CAMPAIGN_REGIME_MAX_LEVELS_PER_FRAME
  ) {
    return null;
  }
  let bestBid = -Infinity;
  let bestAsk = Infinity;
  let deepestBid = Infinity;
  let deepestAsk = -Infinity;
  let bidDepth25Bps = 0;
  let askDepth25Bps = 0;
  const seen = new Set<number>();
  for (const level of frame.levels) {
    if (
      !level ||
      typeof level !== "object" ||
      !Number.isSafeInteger(level.priceTick) ||
      level.priceTick <= 0 ||
      seen.has(level.priceTick) ||
      !finiteNonNegative(level.bidContracts) ||
      !finiteNonNegative(level.askContracts) ||
      (level.bidContracts > 0 && level.askContracts > 0)
    ) {
      return null;
    }
    seen.add(level.priceTick);
    const price = level.priceTick * priceStep;
    if (!finitePositive(price)) return null;
    if (level.bidContracts > 0) {
      if (price >= frame.midpoint) return null;
      bestBid = Math.max(bestBid, price);
      deepestBid = Math.min(deepestBid, price);
      const distanceBps = (frame.midpoint - price) / frame.midpoint * 10_000;
      const notional = price * level.bidContracts * contractSize;
      if (!finiteNonNegative(distanceBps) || !finiteNonNegative(notional)) return null;
      if (distanceBps <= DIZYQUANT_CAMPAIGN_REGIME_DEPTH_COVERAGE_BPS + 1e-9) {
        bidDepth25Bps += notional;
      }
    }
    if (level.askContracts > 0) {
      if (price <= frame.midpoint) return null;
      bestAsk = Math.min(bestAsk, price);
      deepestAsk = Math.max(deepestAsk, price);
      const distanceBps = (price - frame.midpoint) / frame.midpoint * 10_000;
      const notional = price * level.askContracts * contractSize;
      if (!finiteNonNegative(distanceBps) || !finiteNonNegative(notional)) return null;
      if (distanceBps <= DIZYQUANT_CAMPAIGN_REGIME_DEPTH_COVERAGE_BPS + 1e-9) {
        askDepth25Bps += notional;
      }
    }
  }
  if (
    !finitePositive(bestBid) ||
    !finitePositive(bestAsk) ||
    !finitePositive(deepestBid) ||
    !finitePositive(deepestAsk) ||
    bestBid >= bestAsk ||
    !finitePositive(bidDepth25Bps) ||
    !finitePositive(askDepth25Bps)
  ) {
    return null;
  }
  const bidBoundary =
    frame.midpoint * (1 - DIZYQUANT_CAMPAIGN_REGIME_DEPTH_COVERAGE_BPS / 10_000);
  const askBoundary =
    frame.midpoint * (1 + DIZYQUANT_CAMPAIGN_REGIME_DEPTH_COVERAGE_BPS / 10_000);
  if (deepestBid > bidBoundary + 1e-9 || deepestAsk < askBoundary - 1e-9) return null;
  const spreadBps = (bestAsk - bestBid) / frame.midpoint * 10_000;
  if (!finitePositive(spreadBps)) return null;
  return Object.freeze({ spreadBps, bidDepth25Bps, askDepth25Bps });
}

function shockCandidates(
  frames: readonly DizyQuantLiquidityFrame[],
  priceStep: number,
  contractSize: number,
) {
  const stats = frames.map((frame) => frameStats(frame, priceStep, contractSize));
  if (stats.some((value) => value === null)) return null;
  const opening = stats[0]!;
  const candidates: DizyQuantCampaignShockSelection[] = [];
  for (let index = 1; index < frames.length - 1; index += 1) {
    const current = stats[index]!;
    const spreadWideningPct = (current.spreadBps / opening.spreadBps - 1) * 100;
    const bidDepthLossPct =
      (opening.bidDepth25Bps - current.bidDepth25Bps) / opening.bidDepth25Bps * 100;
    const askDepthLossPct =
      (opening.askDepth25Bps - current.askDepth25Bps) / opening.askDepth25Bps * 100;
    if (![spreadWideningPct, bidDepthLossPct, askDepthLossPct].every(Number.isFinite)) {
      return null;
    }
    const components: DizyQuantCampaignShockComponent[] = [];
    if (spreadWideningPct + 1e-9 >= DIZYQUANT_SHOCK_SPREAD_WIDENING_PCT) {
      components.push("spread");
    }
    if (bidDepthLossPct + 1e-9 >= DIZYQUANT_SHOCK_DEPTH_LOSS_PCT) {
      components.push("bid-depth");
    }
    if (askDepthLossPct + 1e-9 >= DIZYQUANT_SHOCK_DEPTH_LOSS_PCT) {
      components.push("ask-depth");
    }
    if (!components.length) continue;
    const severityScore =
      Math.max(0, spreadWideningPct / DIZYQUANT_SHOCK_SPREAD_WIDENING_PCT) +
      Math.max(0, bidDepthLossPct / DIZYQUANT_SHOCK_DEPTH_LOSS_PCT) +
      Math.max(0, askDepthLossPct / DIZYQUANT_SHOCK_DEPTH_LOSS_PCT);
    candidates.push(Object.freeze({
      timestampMs: frames[index].timestampMs,
      componentCount: components.length,
      components: Object.freeze(components),
      severityScore: round(severityScore),
      spreadWideningPct: round(spreadWideningPct),
      bidDepthLossPct: round(bidDepthLossPct),
      askDepthLossPct: round(askDepthLossPct),
    }));
  }
  return candidates.sort(
    (left, right) =>
      right.componentCount - left.componentCount ||
      right.severityScore - left.severityScore ||
      left.timestampMs - right.timestampMs,
  );
}

export function classifyDizyQuantCampaignRegime(input: Readonly<{
  frames: readonly DizyQuantLiquidityFrame[];
  priceStep: number;
  contractSize: number;
  sequenceContinuous: boolean | null;
  hasGaps: boolean;
}>): DizyQuantCampaignRegimeResult {
  if (!finitePositive(input.priceStep) || !finitePositive(input.contractSize)) {
    return unavailable("Campaign regime price step or contract size is unavailable.", input.sequenceContinuous, input.hasGaps);
  }
  if (input.sequenceContinuous !== true || input.hasGaps) {
    return unavailable("Campaign regime classification requires proven continuous, gap-free depth.", input.sequenceContinuous, input.hasGaps);
  }
  const frames = input.frames;
  const expectedFrames = DIZYQUANT_RESILIENCE_WINDOW_MS / DIZYQUANT_CAMPAIGN_REGIME_GRID_MS + 1;
  if (!Array.isArray(frames) || frames.length !== expectedFrames) {
    return unavailable("Campaign regime classification requires one exact sixty-second one-second grid.", input.sequenceContinuous, input.hasGaps);
  }
  const windowFromMs = frames[0]?.timestampMs;
  const windowToMs = frames.at(-1)?.timestampMs;
  if (
    !Number.isSafeInteger(windowFromMs) ||
    !Number.isSafeInteger(windowToMs) ||
    windowFromMs! <= 0 ||
    windowToMs! - windowFromMs! !== DIZYQUANT_RESILIENCE_WINDOW_MS
  ) {
    return unavailable("Campaign regime coverage endpoints are invalid.", input.sequenceContinuous, input.hasGaps);
  }
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (
      !frame ||
      frame.timestampMs !== windowFromMs! + index * DIZYQUANT_CAMPAIGN_REGIME_GRID_MS ||
      !finitePositive(frame.midpoint)
    ) {
      return unavailable("Campaign regime frames are not an exact event-time grid.", input.sequenceContinuous, input.hasGaps);
    }
  }

  const shocks = shockCandidates(frames, input.priceStep, input.contractSize);
  if (shocks === null) {
    return unavailable("Campaign regime depth statistics or twenty-five-basis-point coverage are invalid or incomplete.", input.sequenceContinuous, input.hasGaps);
  }

  const signedSteps: number[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1].midpoint;
    const current = frames[index].midpoint;
    const moveBps = (current - previous) / previous * 10_000;
    if (!Number.isFinite(moveBps)) {
      return unavailable("Campaign regime midpoint arithmetic overflowed.", input.sequenceContinuous, input.hasGaps);
    }
    signedSteps.push(moveBps);
  }
  const openingMidpoint = frames[0].midpoint;
  const closingMidpoint = frames.at(-1)!.midpoint;
  const netMoveBps = (closingMidpoint - openingMidpoint) / openingMidpoint * 10_000;
  const absoluteSteps = signedSteps.map(Math.abs);
  const pathMoveBps = absoluteSteps.reduce((sum, value) => sum + value, 0);
  const medianAbsStepBps = median(absoluteSteps) ?? 0;
  const directionalFloorBps = Math.max(
    DIZYQUANT_DIRECTIONAL_MIN_NET_BPS,
    medianAbsStepBps * DIZYQUANT_DIRECTIONAL_NOISE_MULTIPLE,
  );
  const directionalEfficiency = pathMoveBps > 0 ? Math.abs(netMoveBps) / pathMoveBps : 0;
  const direction: DizyQuantCampaignDirection =
    netMoveBps > 1e-12 ? "up" : netMoveBps < -1e-12 ? "down" : "flat";
  const nonZeroSteps = signedSteps.filter((value) => Math.abs(value) > 1e-12);
  const matchingSteps =
    direction === "up"
      ? nonZeroSteps.filter((value) => value > 0).length
      : direction === "down"
        ? nonZeroSteps.filter((value) => value < 0).length
        : 0;
  const signConsistency = nonZeroSteps.length ? matchingSteps / nonZeroSteps.length : 0;

  const selectedShock = shocks[0] ?? null;
  const regime: DizyQuantCampaignRegime = selectedShock
    ? "volatility-shock"
    : Math.abs(netMoveBps) + 1e-9 >= directionalFloorBps &&
        directionalEfficiency + 1e-9 >= DIZYQUANT_DIRECTIONAL_MIN_EFFICIENCY &&
        signConsistency + 1e-9 >= DIZYQUANT_DIRECTIONAL_MIN_SIGN_CONSISTENCY
      ? "directional"
      : "range";

  return Object.freeze({
    schemaVersion: DIZYQUANT_CAMPAIGN_REGIME_SCHEMA_VERSION,
    formulaVersion: DIZYQUANT_CAMPAIGN_REGIME_FORMULA_VERSION,
    available: true,
    regime,
    direction,
    windowFromMs: windowFromMs!,
    windowToMs: windowToMs!,
    frameCount: frames.length,
    netMoveBps: round(netMoveBps),
    pathMoveBps: round(pathMoveBps),
    medianAbsStepBps: round(medianAbsStepBps),
    directionalFloorBps: round(directionalFloorBps),
    directionalEfficiency: round(directionalEfficiency),
    signConsistency: round(signConsistency),
    shock: selectedShock,
    sequenceContinuous: input.sequenceContinuous,
    hasGaps: false,
    limitations: Object.freeze([
      "Regime labels describe only the reviewed sixty-second public depth/midpoint predictor window; they are not strategy trend labels.",
      "Every classified frame must prove displayed depth coverage through twenty-five basis points on both sides.",
      "Volatility-shock precedence reuses the versioned DizyQuant resilience spread/depth thresholds and never uses a future outcome.",
      "Range versus directional classification uses midpoint path geometry only and does not infer cause, participant identity or future direction.",
    ]),
    researchOnly: true,
    decisionEligible: false,
    signalEligible: false,
    executionEligible: false,
    promotionEligible: false,
  });
}
