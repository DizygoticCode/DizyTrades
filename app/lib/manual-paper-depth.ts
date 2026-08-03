import {
  quantizeMexcExecutionPrice,
  quantizeMexcStep,
  type MexcContractMetadata,
} from "./mexc-contract-metadata";
import type { DepthEnvelope, DepthLevel, DepthSourceMode } from "./order-flow/types";

export type PaperDepthFillStatus = "full" | "partial";
export type PaperDepthFillEvidence = Readonly<{
  source: "dizyflow-public-depth";
  calculationMethod: "visible-book-walk";
  bookSide: "bid" | "ask";
  fillStatus: PaperDepthFillStatus;
  requestedContractVolume: number;
  filledContractVolume: number;
  unfilledContractVolume: number;
  availableContractVolume: number;
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

function sortedLevels(
  side: "long" | "short",
  envelope: DepthEnvelope,
): readonly DepthLevel[] {
  const values = side === "long" ? envelope.snapshot.asks : envelope.snapshot.bids;
  return [...values].sort((a, b) =>
    side === "long" ? a.price - b.price : b.price - a.price,
  );
}

export function simulatePaperMarketDepthFill(input: {
  side: "long" | "short";
  requestedContractVolume: number;
  referencePrice: number;
  contract: MexcContractMetadata;
  depth: DepthEnvelope;
  observedAt?: number;
  maxAgeMs?: number;
}): PaperDepthFillEvidence {
  const observedAt = input.observedAt ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? 10_000;
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

  const levels = sortedLevels(side, depth);
  let remaining = requestedContractVolume;
  let filledContractVolume = 0;
  let weightedPriceTotal = 0;
  let availableContractVolume = 0;
  const consumed: Array<{ price: number; volume: number }> = [];

  for (const level of levels) {
    positive(level.price, "INVALID_DEPTH_LEVEL");
    nonNegative(level.contractQuantity, "INVALID_DEPTH_LEVEL");
    const available = quantizeMexcStep(
      level.contractQuantity,
      contract.volUnit,
      "floor",
    );
    availableContractVolume += available;
    if (remaining <= contract.volUnit * 1e-9 || available <= 0) continue;
    const volume = quantizeMexcStep(
      Math.min(remaining, available),
      contract.volUnit,
      "floor",
    );
    if (volume <= 0) continue;
    consumed.push({ price: level.price, volume });
    filledContractVolume += volume;
    weightedPriceTotal += level.price * volume;
    remaining = Number((requestedContractVolume - filledContractVolume).toPrecision(15));
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
  const rawWeightedAveragePrice = weightedPriceTotal / filledContractVolume;
  const executionPrice = quantizeMexcExecutionPrice(
    rawWeightedAveragePrice,
    contract.priceUnit,
    side,
    true,
  );
  const quantity = Number(
    (filledContractVolume * contract.contractSize).toPrecision(15),
  );
  const notional = Number((quantity * executionPrice).toPrecision(15));
  const directionalMove =
    side === "long"
      ? executionPrice - input.referencePrice
      : input.referencePrice - executionPrice;

  return Object.freeze({
    source: "dizyflow-public-depth",
    calculationMethod: "visible-book-walk",
    bookSide: side === "long" ? "ask" : "bid",
    fillStatus: unfilledContractVolume > contract.volUnit * 1e-9 ? "partial" : "full",
    requestedContractVolume,
    filledContractVolume,
    unfilledContractVolume,
    availableContractVolume: quantizeMexcStep(
      availableContractVolume,
      contract.volUnit,
      "floor",
    ),
    quantity,
    notional,
    rawWeightedAveragePrice,
    executionPrice,
    bestPrice: consumed[0].price,
    worstPrice: consumed.at(-1)!.price,
    levelsConsumed: consumed.length,
    priceImpactBps: (directionalMove / input.referencePrice) * 10_000,
    snapshotVersion: depth.snapshot.version,
    snapshotReceivedAt: depth.receivedAt,
    snapshotAgeMs,
    sourceMode: depth.diagnostic.sourceMode ?? null,
  });
}
