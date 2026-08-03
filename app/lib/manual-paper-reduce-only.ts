export type ManualReduceOnlySide = "long" | "short";
export type ManualReduceOnlySource =
  | "manual-close"
  | "partial-close"
  | "reverse"
  | "flatten-all"
  | "risk-exit"
  | "opposite-order-replacement";

export type ManualReduceOnlyTarget = Readonly<{
  expectedTradeId: string;
  expectedSide: ManualReduceOnlySide;
}>;

export type ManualReduceOnlyPlan = Readonly<{
  enabled: true;
  calculationMethod: "position-bound-cap";
  source: ManualReduceOnlySource;
  expectedTradeId: string;
  expectedSide: ManualReduceOnlySide;
  positionQuantityBefore: number;
  requestedQuantity: number;
  acceptedQuantity: number;
  capped: boolean;
}>;

export type ManualReduceOnlyEvidence = ManualReduceOnlyPlan & Readonly<{
  filledQuantity: number;
  remainingQuantity: number;
  result: "closed" | "reduced";
}>;

const tolerance = (value: number) => Math.max(1e-12, Math.abs(value) * 1e-10);
const finitePositive = (value: number, code: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(code);
};

export function createManualReduceOnlyPlan(input: {
  source: ManualReduceOnlySource;
  target: ManualReduceOnlyTarget;
  positionTradeId: string;
  positionSide: ManualReduceOnlySide;
  positionQuantity: number;
  requestedQuantity: number;
  acceptedQuantity?: number;
}): ManualReduceOnlyPlan {
  if (!input.target.expectedTradeId || input.target.expectedTradeId !== input.positionTradeId) {
    throw new Error("STALE_REDUCE_ONLY_TARGET");
  }
  if (input.target.expectedSide !== input.positionSide) {
    throw new Error("REDUCE_ONLY_SIDE_MISMATCH");
  }
  finitePositive(input.positionQuantity, "INVALID_REDUCE_ONLY_POSITION");
  finitePositive(input.requestedQuantity, "INVALID_REDUCE_ONLY_QUANTITY");
  const maximumAccepted = Math.min(input.requestedQuantity, input.positionQuantity);
  const acceptedQuantity = input.acceptedQuantity ?? maximumAccepted;
  finitePositive(acceptedQuantity, "INVALID_REDUCE_ONLY_QUANTITY");
  if (acceptedQuantity - maximumAccepted > tolerance(input.positionQuantity)) {
    throw new Error("REDUCE_ONLY_EXCEEDS_POSITION");
  }
  return Object.freeze({
    enabled: true,
    calculationMethod: "position-bound-cap",
    source: input.source,
    expectedTradeId: input.target.expectedTradeId,
    expectedSide: input.target.expectedSide,
    positionQuantityBefore: input.positionQuantity,
    requestedQuantity: input.requestedQuantity,
    acceptedQuantity,
    capped: input.requestedQuantity - acceptedQuantity > tolerance(input.positionQuantity),
  });
}

export function finaliseManualReduceOnly(
  plan: ManualReduceOnlyPlan,
  filledQuantity: number,
): ManualReduceOnlyEvidence {
  finitePositive(filledQuantity, "INVALID_REDUCE_ONLY_FILL");
  if (filledQuantity - plan.acceptedQuantity > tolerance(plan.positionQuantityBefore)) {
    throw new Error("REDUCE_ONLY_FILL_EXCEEDS_ACCEPTED");
  }
  const remainingQuantity = Math.max(0, plan.positionQuantityBefore - filledQuantity);
  return Object.freeze({
    ...plan,
    filledQuantity,
    remainingQuantity,
    result: remainingQuantity <= tolerance(plan.positionQuantityBefore) ? "closed" : "reduced",
  });
}
