import type { MexcContractMetadata } from "./mexc-contract-metadata";

export type PaperExecutionType = "market";
export type PaperLiquidityRole = "maker" | "taker";
export type PaperFeeSource = "mexc-public-contract" | "legacy-settings-fallback";

export type PaperFeeSnapshot = Readonly<{
  executionType: PaperExecutionType;
  liquidityRole: PaperLiquidityRole;
  feeRate: number;
  feeSource: PaperFeeSource;
  makerFeeRate: number;
  takerFeeRate: number;
}>;

const nonNegativeRate = (value: number, field: string) => {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error(`Invalid paper ${field}.`);
  return value;
};

export function mexcPublicMarketTakerFeeSnapshot(
  contract: MexcContractMetadata,
): PaperFeeSnapshot {
  return Object.freeze({
    executionType: "market",
    liquidityRole: "taker",
    feeRate: nonNegativeRate(contract.takerFeeRate, "taker fee rate"),
    feeSource: "mexc-public-contract",
    makerFeeRate: nonNegativeRate(contract.makerFeeRate, "maker fee rate"),
    takerFeeRate: nonNegativeRate(contract.takerFeeRate, "taker fee rate"),
  });
}

export function legacyMarketTakerFeeSnapshot(
  commissionPct: number,
  makerCommissionPct = commissionPct,
): PaperFeeSnapshot {
  const takerFeeRate = nonNegativeRate(commissionPct / 100, "legacy taker fee rate");
  return Object.freeze({
    executionType: "market",
    liquidityRole: "taker",
    feeRate: takerFeeRate,
    feeSource: "legacy-settings-fallback",
    makerFeeRate: nonNegativeRate(makerCommissionPct / 100, "legacy maker fee rate"),
    takerFeeRate,
  });
}

export function positionMarketTakerFeeSnapshot(
  position: Partial<PaperFeeSnapshot>,
  settings: { commissionPct: number; makerCommissionPct: number },
): PaperFeeSnapshot {
  if (
    position.executionType === "market" &&
    position.liquidityRole === "taker" &&
    position.feeSource === "mexc-public-contract" &&
    Number.isFinite(position.feeRate) &&
    Number.isFinite(position.makerFeeRate) &&
    Number.isFinite(position.takerFeeRate)
  ) {
    return Object.freeze({
      executionType: "market",
      liquidityRole: "taker",
      feeRate: nonNegativeRate(position.feeRate as number, "stored fee rate"),
      feeSource: "mexc-public-contract",
      makerFeeRate: nonNegativeRate(
        position.makerFeeRate as number,
        "stored maker fee rate",
      ),
      takerFeeRate: nonNegativeRate(
        position.takerFeeRate as number,
        "stored taker fee rate",
      ),
    });
  }
  return legacyMarketTakerFeeSnapshot(
    settings.commissionPct,
    settings.makerCommissionPct,
  );
}

export function paperExecutionFee(
  notional: number,
  snapshot: PaperFeeSnapshot,
  liquidationPenaltyRate = 0,
) {
  if (!Number.isFinite(notional) || notional < 0)
    throw new Error("Invalid paper execution notional.");
  const penaltyRate = nonNegativeRate(
    liquidationPenaltyRate,
    "liquidation penalty rate",
  );
  const tradingFee = notional * snapshot.feeRate;
  const liquidationPenalty = notional * penaltyRate;
  return Object.freeze({
    tradingFee,
    liquidationPenalty,
    totalFee: tradingFee + liquidationPenalty,
  });
}
