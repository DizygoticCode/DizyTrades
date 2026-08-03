import "server-only";

import {
  requireFreshMexcAccountSnapshot,
  type MexcAccountAvailabilityState,
} from "./mexc-account-state-availability";
import type { MexcAccountPosition } from "./mexc-account-state";
import {
  isMexcStepAligned,
  type MexcContractMetadata,
} from "./mexc-contract-metadata";

export const MEXC_SHADOW_ORDER_PREVIEW_METHOD =
  "mexc-shadow-order-preview/1.0.0" as const;

export type MexcShadowOrderBlocker =
  | "symbol-mismatch"
  | "invalid-price"
  | "price-step"
  | "invalid-volume"
  | "volume-step"
  | "volume-range"
  | "leverage-range"
  | "margin-mode-unsupported"
  | "settlement-asset-unavailable"
  | "insufficient-available-balance"
  | "contract-volume-limit";

export type MexcShadowOrderIntent = Readonly<{
  symbol: string;
  side: "long" | "short";
  marginMode: "isolated" | "cross";
  leverage: number;
  contractVolume: number;
  executionPrice: number;
  liquidityRole: "maker" | "taker";
  settlementCurrency?: string;
}>;

export type MexcShadowOrderPreview = Readonly<{
  calculationMethod: typeof MEXC_SHADOW_ORDER_PREVIEW_METHOD;
  hypotheticalOnly: true;
  executable: false;
  status: "calculable" | "blocked";
  exchangeObservedAtMs: number;
  symbol: string;
  side: "long" | "short";
  marginMode: "isolated" | "cross";
  settlementCurrency: string;
  inputs: Readonly<{
    leverage: number;
    contractVolume: number;
    executionPrice: number;
    liquidityRole: "maker" | "taker";
  }>;
  estimates: Readonly<{
    baseQuantity: number | null;
    notional: number | null;
    effectiveInitialMarginRate: number | null;
    initialMargin: number | null;
    feeRate: number | null;
    fee: number | null;
    cashRequirement: number | null;
  }>;
  accountContext: Readonly<{
    availableBalance: string | null;
    availableBalanceSufficient: boolean | null;
    sameSidePositionCount: number;
    oppositeSidePositionCount: number;
    existingSameSideContractVolume: string;
    projectedSameSideContractVolume: number | null;
  }>;
  blockers: readonly MexcShadowOrderBlocker[];
  unchecked: readonly (
    | "user-risk-tier"
    | "position-mode"
    | "pending-orders"
    | "live-order-book"
    | "actual-fill"
    | "funding-between-preview-and-fill"
    | "contract-api-availability"
  )[];
  warnings: readonly string[];
}>;

const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const currencyPattern = /^[A-Z0-9]{1,20}$/;

function finitePositive(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function decimalNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function settlementCurrency(value: string | undefined) {
  const currency = (value ?? "USDT").trim().toUpperCase();
  if (!currencyPattern.test(currency)) {
    throw new TypeError("Settlement currency is invalid.");
  }
  return currency;
}

function marginModeSupported(
  mode: MexcShadowOrderIntent["marginMode"],
  contract: MexcContractMetadata,
) {
  return contract.positionOpenType === 3 ||
    (mode === "isolated" && contract.positionOpenType === 1) ||
    (mode === "cross" && contract.positionOpenType === 2);
}

function positionVolume(positions: readonly MexcAccountPosition[]) {
  return positions.reduce((sum, position) => {
    const value = decimalNumber(position.holdVolume);
    return value === null ? sum : sum + value;
  }, 0);
}

export function previewMexcShadowOrder(input: Readonly<{
  accountState: MexcAccountAvailabilityState;
  contract: MexcContractMetadata;
  intent: MexcShadowOrderIntent;
}>): MexcShadowOrderPreview {
  const snapshot = requireFreshMexcAccountSnapshot(input.accountState);
  const symbol = input.intent.symbol.trim().toUpperCase();
  const settleCurrency = settlementCurrency(input.intent.settlementCurrency);
  const blockers: MexcShadowOrderBlocker[] = [];

  if (!symbolPattern.test(symbol) || symbol !== input.contract.symbol) {
    blockers.push("symbol-mismatch");
  }
  if (!finitePositive(input.intent.executionPrice)) {
    blockers.push("invalid-price");
  } else if (!isMexcStepAligned(input.intent.executionPrice, input.contract.priceUnit)) {
    blockers.push("price-step");
  }
  if (!finitePositive(input.intent.contractVolume)) {
    blockers.push("invalid-volume");
  } else {
    if (!isMexcStepAligned(input.intent.contractVolume, input.contract.volUnit)) {
      blockers.push("volume-step");
    }
    if (
      input.intent.contractVolume < input.contract.minVol ||
      input.intent.contractVolume > input.contract.maxVol
    ) {
      blockers.push("volume-range");
    }
  }
  if (
    !Number.isSafeInteger(input.intent.leverage) ||
    input.intent.leverage < input.contract.minLeverage ||
    input.intent.leverage > input.contract.maxLeverage
  ) {
    blockers.push("leverage-range");
  }
  if (!marginModeSupported(input.intent.marginMode, input.contract)) {
    blockers.push("margin-mode-unsupported");
  }

  const sameSide = snapshot.positions.filter(
    (position) => position.symbol === symbol && position.side === input.intent.side,
  );
  const oppositeSide = snapshot.positions.filter(
    (position) => position.symbol === symbol && position.side !== input.intent.side,
  );
  const existingSameSideVolume = positionVolume(sameSide);
  const canCalculate =
    finitePositive(input.intent.executionPrice) &&
    finitePositive(input.intent.contractVolume) &&
    Number.isSafeInteger(input.intent.leverage) &&
    input.intent.leverage > 0 &&
    finitePositive(input.contract.contractSize);

  const baseQuantity = canCalculate
    ? input.intent.contractVolume * input.contract.contractSize
    : null;
  const notional = baseQuantity === null
    ? null
    : baseQuantity * input.intent.executionPrice;
  const effectiveInitialMarginRate = notional === null
    ? null
    : Math.max(1 / input.intent.leverage, input.contract.initialMarginRate);
  const initialMargin =
    notional === null || effectiveInitialMarginRate === null
      ? null
      : notional * effectiveInitialMarginRate;
  const feeRate = notional === null
    ? null
    : input.intent.liquidityRole === "maker"
      ? input.contract.makerFeeRate
      : input.contract.takerFeeRate;
  const fee = notional === null || feeRate === null ? null : notional * feeRate;
  const cashRequirement = initialMargin === null || fee === null
    ? null
    : initialMargin + fee;

  const projectedSameSideContractVolume = canCalculate
    ? existingSameSideVolume + input.intent.contractVolume
    : null;
  if (
    projectedSameSideContractVolume !== null &&
    projectedSameSideContractVolume > input.contract.maxVol
  ) {
    blockers.push("contract-volume-limit");
  }

  const asset = snapshot.assets.find(
    (candidate) => candidate.currency === settleCurrency,
  ) ?? null;
  const availableBalance = asset ? decimalNumber(asset.availableBalance) : null;
  if (!asset || availableBalance === null) {
    blockers.push("settlement-asset-unavailable");
  }
  const availableBalanceSufficient =
    availableBalance === null || cashRequirement === null
      ? null
      : availableBalance >= cashRequirement;
  if (availableBalanceSufficient === false) {
    blockers.push("insufficient-available-balance");
  }

  const uniqueBlockers = Object.freeze([...new Set(blockers)]);
  const unchecked = Object.freeze([
    "user-risk-tier",
    "position-mode",
    "pending-orders",
    "live-order-book",
    "actual-fill",
    "funding-between-preview-and-fill",
    "contract-api-availability",
  ] as const);
  const warnings = Object.freeze([
    "This is a hypothetical calculation, not exchange approval or an executable order.",
    "Public contract limits can differ from the user's current risk tier and account restrictions.",
    ...(oppositeSide.length > 0
      ? [
          "An opposite-side MEXC position exists; position mode is not available to this credentialless preview.",
        ]
      : []),
    ...(input.intent.liquidityRole === "maker"
      ? [
          "Maker fee is illustrative; an order that crosses or later executes as taker will use different economics.",
        ]
      : []),
  ]);

  return Object.freeze({
    calculationMethod: MEXC_SHADOW_ORDER_PREVIEW_METHOD,
    hypotheticalOnly: true,
    executable: false,
    status: uniqueBlockers.length === 0 ? "calculable" : "blocked",
    exchangeObservedAtMs: snapshot.observedAtMs,
    symbol,
    side: input.intent.side,
    marginMode: input.intent.marginMode,
    settlementCurrency: settleCurrency,
    inputs: Object.freeze({
      leverage: input.intent.leverage,
      contractVolume: input.intent.contractVolume,
      executionPrice: input.intent.executionPrice,
      liquidityRole: input.intent.liquidityRole,
    }),
    estimates: Object.freeze({
      baseQuantity,
      notional,
      effectiveInitialMarginRate,
      initialMargin,
      feeRate,
      fee,
      cashRequirement,
    }),
    accountContext: Object.freeze({
      availableBalance: asset?.availableBalance ?? null,
      availableBalanceSufficient,
      sameSidePositionCount: sameSide.length,
      oppositeSidePositionCount: oppositeSide.length,
      existingSameSideContractVolume: String(existingSameSideVolume),
      projectedSameSideContractVolume,
    }),
    blockers: uniqueBlockers,
    unchecked,
    warnings,
  });
}
