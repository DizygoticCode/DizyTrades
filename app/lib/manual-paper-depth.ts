import {
  quantizeMexcExecutionPrice,
  quantizeMexcStep,
} from "./mexc-contract-metadata";
import type { DepthEnvelope, DepthLevel, DepthSourceMode } from "./order-flow/types";

export type PaperDepthContractRules = Readonly<{
  symbol: string;
  contractSize: number;
  priceUnit: number;
  volUnit: number;
  minVol: number;
  maxVol: number;
}>;
export type PaperDepthFillStatus = "full" | "partial";
export type PaperDepthFillEvidence = Readonly<{
  source: "dizyflow-public-depth";
  calculationMethod: "visible-book-walk";
  executionContext?: "entry" | "exit";
  bookSide: "bid" | "ask";
  fillStatus: PaperDepthFillStatus;
  requestedContractVolume: number;
  filledContractVolume: number;
  unfilledContractVolume: number;
  availableContractVolume: number;
  remainingPositionContractVolume?: number;
  quantity: number;
  notional: number;
  rawWeightedAveragePrice: number;
  executionPrice: number;
  bestPrice: number;
  worstPrice: number;
  levelsConsumed: number;
  priceImpactBps: number;
  snapshotVersion: number;
  snapshotReceivedAt: number;
  snapshotAgeMs: number;
  sourceMode: DepthSourceMode | null;
}>;

const positive = (value: number, code: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(code);
  return value;
};
const nonNegative = (value: number, code: string) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(code);
  return value;
};

const takesAsks = (side: "long" | "short", opening: boolean) =>
  (side === "long") === opening;

function sortedLevels(
  side: "long" | "short",
  opening: boolean,
  envelope: DepthEnvelope,
): readonly DepthLevel[] {
  const askSide = takesAsks(side, opening);
  const values = askSide ? envelope.snapshot.asks : envelope.snapshot.bids;
  return [...values].sort((a, b) =>
    askSide ? a.price - b.price : b.price - a.price,
  );
}

export function simulatePaperMarketDepthFill(input: {
  side: "long" | "short";
  opening?: boolean;
  requestedContractVolume: number;
  openContractVolume?: number;
  minimumRemainingContractVolume?: number;
  referencePrice: number;
  contract: PaperDepthContractRules;
  depth: DepthEnvelope;
  observedAt?: number;
  maxAgeMs?: number;
}): PaperDepthFillEvidence {
  const observedAt = input.observedAt ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? 10_000;
  const opening = input.opening ?? true;
  const { contract, depth, side } = input;
  positive(input.referencePrice, "INVALID_DEPTH_REFERENCE_PRICE");
  positive(maxAgeMs, "INVALID_DEPTH_MAX_AGE");
  if (depth.snapshot.symbol !== contract.symbol) throw new Error("DEPTH_SYMBOL_MISMATCH");
  if (
    !Number.isInteger(depth.snapshot.version) ||
    depth.snapshot.version < 0 ||
    !depth.snapshot.bids.length ||
    !depth.snapshot.asks.length
  )
    throw new Error("DEPTH_INCOMPLETE");
  const snapshotAgeMs = Math.max(0, observedAt - depth.receivedAt);
  if (!Number.isFinite(depth.receivedAt) || depth.receivedAt <= 0 || snapshotAgeMs > maxAgeMs)
    throw new Error("DEPTH_STALE");

  const requestedContractVolume = quantizeMexcStep(
    positive(input.requestedContractVolume, "INVALID_DEPTH_VOLUME"),
    contract.volUnit,
    "floor",
  );
  if (requestedContractVolume < contract.minVol)
    throw new Error("DEPTH_VOLUME_BELOW_MINIMUM");
  if (requestedContractVolume > contract.maxVol)
    throw new Error("DEPTH_VOLUME_ABOVE_MAXIMUM");

  const openContractVolume = input.openContractVolume === undefined
    ? undefined
    : quantizeMexcStep(
        positive(input.openContractVolume, "INVALID_OPEN_DEPTH_VOLUME"),
        contract.volUnit,
        "floor",
      );
  if (!opening && openContractVolume !== undefined && requestedContractVolume > openContractVolume)
    throw new Error("DEPTH_EXIT_EXCEEDS_POSITION");
  const minimumRemainingContractVolume = input.minimumRemainingContractVolume === undefined
    ? 0
    : quantizeMexcStep(
        nonNegative(input.minimumRemainingContractVolume, "INVALID_DEPTH_REMAINDER"),
        contract.volUnit,
        "ceil",
      );

  const levels = sortedLevels(side, opening, depth).map((level) => {
    positive(level.price, "INVALID_DEPTH_LEVEL");
    nonNegative(level.contractQuantity, "INVALID_DEPTH_LEVEL");
    return {
      price: level.price,
      volume: quantizeMexcStep(level.contractQuantity, contract.volUnit, "floor"),
    };
  });
  const availableContractVolume = quantizeMexcStep(
    levels.reduce((sum, level) => sum + level.volume, 0),
    contract.volUnit,
    "floor",
  );
  let targetFillContractVolume = quantizeMexcStep(
    Math.min(requestedContractVolume, availableContractVolume),
    contract.volUnit,
    "floor",
  );

  if (
    !opening &&
    openContractVolume !== undefined &&
    targetFillContractVolume < requestedContractVolume
  ) {
    const remaining = quantizeMexcStep(
      Math.max(0, openContractVolume - targetFillContractVolume),
      contract.volUnit,
      "floor",
    );
    if (remaining > 0 && remaining < minimumRemainingContractVolume) {
      targetFillContractVolume = quantizeMexcStep(
        Math.max(0, openContractVolume - minimumRemainingContractVolume),
        contract.volUnit,
        "floor",
      );
    }
  }

  if (targetFillContractVolume < contract.minVol)
    throw new Error("DEPTH_LIQUIDITY_BELOW_MINIMUM");

  let remainingToFill = targetFillContractVolume;
  let filledContractVolume = 0;
  let weightedPriceTotal = 0;
  const consumed: Array<{ price: number; volume: number }> = [];

  for (const level of levels) {
    if (remainingToFill <= contract.volUnit * 1e-9 || level.volume <= 0) continue;
    const volume = quantizeMexcStep(
      Math.min(remainingToFill, level.volume),
      contract.volUnit,
      "floor",
    );
    if (volume <= 0) continue;
    consumed.push({ price: level.price, volume });
    filledContractVolume += volume;
    weightedPriceTotal += level.price * volume;
    remainingToFill = Number(
      (targetFillContractVolume - filledContractVolume).toPrecision(15),
    );
  }

  filledContractVolume = quantizeMexcStep(
    filledContractVolume,
    contract.volUnit,
    "floor",
  );
  if (filledContractVolume < contract.minVol || !consumed.length)
    throw new Error("DEPTH_LIQUIDITY_BELOW_MINIMUM");
  const unfilledContractVolume = quantizeMexcStep(
    Math.max(0, requestedContractVolume - filledContractVolume),
    contract.volUnit,
    "floor",
  );
  const remainingPositionContractVolume = openContractVolume === undefined
    ? undefined
    : quantizeMexcStep(
        Math.max(0, openContractVolume - filledContractVolume),
        contract.volUnit,
        "floor",
      );
  const rawWeightedAveragePrice = weightedPriceTotal / filledContractVolume;
  const executionPrice = quantizeMexcExecutionPrice(
    rawWeightedAveragePrice,
    contract.priceUnit,
    side,
    opening,
  );
  const quantity = Number(
    (filledContractVolume * contract.contractSize).toPrecision(15),
  );
  const notional = Number((quantity * executionPrice).toPrecision(15));
  const adverseMove = takesAsks(side, opening)
    ? executionPrice - input.referencePrice
    : input.referencePrice - executionPrice;

  return Object.freeze({
    source: "dizyflow-public-depth",
    calculationMethod: "visible-book-walk",
    executionContext: opening ? "entry" : "exit",
    bookSide: takesAsks(side, opening) ? "ask" : "bid",
    fillStatus: unfilledContractVolume > contract.volUnit * 1e-9 ? "partial" : "full",
    requestedContractVolume,
    filledContractVolume,
    unfilledContractVolume,
    availableContractVolume,
    ...(remainingPositionContractVolume === undefined
      ? {}
      : { remainingPositionContractVolume }),
    quantity,
    notional,
    rawWeightedAveragePrice,
    executionPrice,
    bestPrice: consumed[0].price,
    worstPrice: consumed.at(-1)!.price,
    levelsConsumed: consumed.length,
    priceImpactBps: (adverseMove / input.referencePrice) * 10_000,
    snapshotVersion: depth.snapshot.version,
    snapshotReceivedAt: depth.receivedAt,
    snapshotAgeMs,
    sourceMode: depth.diagnostic.sourceMode ?? null,
  });
}
