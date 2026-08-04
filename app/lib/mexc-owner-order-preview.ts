import "server-only";

import {
  calculateManualSizing,
  latestPublicContractMetadata,
  latestPublicRiskPrice,
  manualEquity,
  readManualAccount,
  usedManualMargin,
  type ManualAccount,
  type ManualSide,
  type ManualSizeMode,
} from "./manual-paper";
import {
  auditPaperLiquidation,
  type MarginMode,
} from "./manual-paper-engine";
import {
  isMexcStepAligned,
  sizeMexcContractOrder,
  type MexcContractMetadata,
} from "./mexc-contract-metadata";
import type { MexcOwnerAccountCompanionRefreshResult } from "./mexc-owner-account-companion";

export const MEXC_OWNER_ORDER_PREVIEW_POLICY_VERSION =
  "mexc-owner-order-preview/1.0.0" as const;

export type MexcOwnerOrderPreviewRequest = Readonly<{
  symbol: string;
  side: ManualSide;
  sizeMode: ManualSizeMode;
  amount: number;
  leverage: number;
  marginMode: MarginMode;
  stopLoss: number | null;
  takeProfit: number | null;
}>;

export type MexcOwnerOrderPreviewState =
  | Readonly<{
      policyVersion: typeof MEXC_OWNER_ORDER_PREVIEW_POLICY_VERSION;
      status: "fresh";
      displayEligible: true;
      decisionEligible: false;
      executable: false;
      exchangeWriteCapability: "none";
      request: MexcOwnerOrderPreviewRequest;
      market: Readonly<{
        price: number;
        priceSource: "fair" | "last";
        contractVolume: number;
        contractSize: number;
        quantity: number;
        notional: number;
        takerFeeRate: number;
      }>;
      paperBefore: Readonly<{
        cashBalance: number;
        equity: number;
        usedMargin: number;
        availableMargin: number;
        openPositionCount: number;
      }>;
      projectedPaper: Readonly<{
        cashBalance: number;
        equity: number;
        usedMargin: number;
        availableMargin: number;
        positionMargin: number;
        entryFee: number;
        estimatedLiquidation: number;
        bankruptcyPrice: number;
        grossExposure: number;
        openPositionCount: number;
      }>;
      exchangeObserved: Readonly<{
        observedAtMs: number;
        settlementCurrency: "USDT";
        assetPresent: boolean;
        equity: string | null;
        availableBalance: string | null;
        positionMargin: string | null;
        matchingSymbolPositionCount: number;
        matchingSymbolGrossExposure: number;
        combinedObservedAndHypotheticalExposure: number;
      }>;
      warnings: readonly string[];
      failure: null;
    }>
  | Readonly<{
      policyVersion: typeof MEXC_OWNER_ORDER_PREVIEW_POLICY_VERSION;
      status: "blocked";
      displayEligible: false;
      decisionEligible: false;
      executable: false;
      exchangeWriteCapability: "none";
      reason: "account-state-not-fresh";
      failure: null;
    }>
  | Readonly<{
      policyVersion: typeof MEXC_OWNER_ORDER_PREVIEW_POLICY_VERSION;
      status: "unavailable";
      displayEligible: false;
      decisionEligible: false;
      executable: false;
      exchangeWriteCapability: "none";
      reason:
        | "invalid-request"
        | "paper-account-unavailable"
        | "public-market-unavailable"
        | "existing-paper-position"
        | "insufficient-paper-equity"
        | "preview-calculation-failed";
      failure: Readonly<{
        message: string;
      }>;
    }>;

type PublicMark = Readonly<{
  price: number;
  source: "fair" | "last";
}>;

type Dependencies = Readonly<{
  readPaperAccount?: (userId: string) => Promise<ManualAccount>;
  loadPublicMark?: (symbol: string, previous?: number) => Promise<PublicMark>;
  loadContract?: (symbol: string) => Promise<MexcContractMetadata>;
}>;

class PreviewError extends Error {
  constructor(
    readonly reason: Extract<MexcOwnerOrderPreviewState, { status: "unavailable" }>["reason"],
    message: string,
  ) {
    super(message);
    this.name = "PreviewError";
  }
}

const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const sizeModes = new Set<ManualSizeMode>([
  "fixed-margin",
  "fixed-notional",
  "equity-percent",
  "risk-percent",
]);

function unavailable(
  reason: Extract<MexcOwnerOrderPreviewState, { status: "unavailable" }>["reason"],
  message: string,
): MexcOwnerOrderPreviewState {
  return Object.freeze({
    policyVersion: MEXC_OWNER_ORDER_PREVIEW_POLICY_VERSION,
    status: "unavailable" as const,
    displayEligible: false as const,
    decisionEligible: false as const,
    executable: false as const,
    exchangeWriteCapability: "none" as const,
    reason,
    failure: Object.freeze({ message }),
  });
}

function finitePositive(value: unknown, field: string) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new PreviewError("invalid-request", `${field} must be greater than zero.`);
  }
  return numeric;
}

function optionalPrice(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  return finitePositive(value, field);
}

function request(input: Readonly<{
  symbol: unknown;
  side: unknown;
  sizeMode: unknown;
  amount: unknown;
  leverage: unknown;
  marginMode: unknown;
  stopLoss?: unknown;
  takeProfit?: unknown;
}>): MexcOwnerOrderPreviewRequest {
  const symbol = String(input.symbol ?? "").trim().toUpperCase();
  if (!symbolPattern.test(symbol)) {
    throw new PreviewError("invalid-request", "Symbol must use the MEXC futures form BASE_QUOTE.");
  }
  if (input.side !== "long" && input.side !== "short") {
    throw new PreviewError("invalid-request", "Side must be long or short.");
  }
  if (!sizeModes.has(input.sizeMode as ManualSizeMode)) {
    throw new PreviewError("invalid-request", "Choose a supported DizyPaper sizing mode.");
  }
  if (input.marginMode !== "isolated" && input.marginMode !== "cross") {
    throw new PreviewError("invalid-request", "Margin mode must be isolated or cross.");
  }
  return Object.freeze({
    symbol,
    side: input.side,
    sizeMode: input.sizeMode as ManualSizeMode,
    amount: finitePositive(input.amount, "Amount"),
    leverage: finitePositive(input.leverage, "Leverage"),
    marginMode: input.marginMode,
    stopLoss: optionalPrice(input.stopLoss, "Stop loss"),
    takeProfit: optionalPrice(input.takeProfit, "Take profit"),
  });
}

function validateExitPrices(
  checked: MexcOwnerOrderPreviewRequest,
  price: number,
  contract: MexcContractMetadata,
) {
  if (checked.stopLoss !== null) {
    if (!isMexcStepAligned(checked.stopLoss, contract.priceUnit)) {
      throw new PreviewError(
        "invalid-request",
        `Stop loss must use ${contract.priceUnit} price increments.`,
      );
    }
    if (
      (checked.side === "long" && checked.stopLoss >= price) ||
      (checked.side === "short" && checked.stopLoss <= price)
    ) {
      throw new PreviewError(
        "invalid-request",
        checked.side === "long"
          ? "A long stop loss must be below the current price."
          : "A short stop loss must be above the current price.",
      );
    }
  }
  if (checked.takeProfit !== null) {
    if (!isMexcStepAligned(checked.takeProfit, contract.priceUnit)) {
      throw new PreviewError(
        "invalid-request",
        `Take profit must use ${contract.priceUnit} price increments.`,
      );
    }
    if (
      (checked.side === "long" && checked.takeProfit <= price) ||
      (checked.side === "short" && checked.takeProfit >= price)
    ) {
      throw new PreviewError(
        "invalid-request",
        checked.side === "long"
          ? "A long take profit must be above the current price."
          : "A short take profit must be below the current price.",
      );
    }
  }
}

async function defaultMarkLoader(symbol: string, previous?: number): Promise<PublicMark> {
  const observed = await latestPublicRiskPrice(symbol, previous);
  return Object.freeze({ price: observed.price, source: observed.source });
}

function safeFailure(error: unknown) {
  if (error instanceof PreviewError) return unavailable(error.reason, error.message);
  const message = error instanceof Error && error.message.trim().length <= 220
    ? error.message.trim()
    : "Hypothetical preview could not be calculated safely.";
  return unavailable("preview-calculation-failed", message || "Hypothetical preview failed.");
}

export async function previewOwnerMexcOrder(
  input: Readonly<{
    userId: string;
    companion: MexcOwnerAccountCompanionRefreshResult;
    request: Readonly<{
      symbol: unknown;
      side: unknown;
      sizeMode: unknown;
      amount: unknown;
      leverage: unknown;
      marginMode: unknown;
      stopLoss?: unknown;
      takeProfit?: unknown;
    }>;
  }>,
  dependencies: Dependencies = {},
): Promise<MexcOwnerOrderPreviewState> {
  if (input.companion.account.state.status !== "fresh") {
    return Object.freeze({
      policyVersion: MEXC_OWNER_ORDER_PREVIEW_POLICY_VERSION,
      status: "blocked" as const,
      displayEligible: false as const,
      decisionEligible: false as const,
      executable: false as const,
      exchangeWriteCapability: "none" as const,
      reason: "account-state-not-fresh" as const,
      failure: null,
    });
  }

  let checked: MexcOwnerOrderPreviewRequest;
  try {
    checked = request(input.request);
  } catch (error) {
    return safeFailure(error);
  }

  const readPaper = dependencies.readPaperAccount ?? readManualAccount;
  const loadMark = dependencies.loadPublicMark ?? defaultMarkLoader;
  const loadContract = dependencies.loadContract ?? latestPublicContractMetadata;

  let paper: ManualAccount;
  try {
    paper = await readPaper(input.userId);
  } catch (error) {
    const message = error instanceof Error && error.message.trim().length <= 220
      ? error.message.trim()
      : "DizyPaper account could not be loaded.";
    return unavailable("paper-account-unavailable", message || "DizyPaper account unavailable.");
  }

  if (paper.positions[checked.symbol]) {
    return unavailable(
      "existing-paper-position",
      "This symbol already has an open DizyPaper position. Add, reduce and reversal behaviour is intentionally excluded from the read-only preview.",
    );
  }

  let mark: PublicMark;
  let contract: MexcContractMetadata;
  try {
    [mark, contract] = await Promise.all([
      loadMark(checked.symbol),
      loadContract(checked.symbol),
    ]);
    if (contract.symbol !== checked.symbol) {
      throw new PreviewError("public-market-unavailable", "Public contract metadata did not match the requested symbol.");
    }
    if (!Number.isFinite(mark.price) || mark.price <= 0) {
      throw new PreviewError("public-market-unavailable", "Current fair/last price is unavailable.");
    }
  } catch (error) {
    if (error instanceof PreviewError) return safeFailure(error);
    const message = error instanceof Error && error.message.trim().length <= 220
      ? error.message.trim()
      : "Current public price or contract metadata is unavailable.";
    return unavailable("public-market-unavailable", message || "Public market context unavailable.");
  }

  try {
    validateExitPrices(checked, mark.price, contract);
    const marks = Object.fromEntries(
      Object.values(paper.positions).map((position) => [position.symbol, position.lastRiskPrice]),
    );
    marks[checked.symbol] = mark.price;
    const equityBefore = manualEquity(paper, marks);
    const usedBefore = usedManualMargin(paper);
    const availableBefore = Math.max(0, equityBefore - usedBefore);
    const sizing = calculateManualSizing(
      {
        sizeMode: checked.sizeMode,
        amount: checked.amount,
        leverage: checked.leverage,
        side: checked.side,
        stopLoss: checked.stopLoss,
        minLeverage: contract.minLeverage,
        maxLeverage: contract.maxLeverage,
      },
      equityBefore,
      mark.price,
    );
    const order = sizeMexcContractOrder(sizing.notional, mark.price, contract);
    const positionMargin = order.notional / sizing.leverage;
    const entryFee = order.notional * contract.takerFeeRate;
    if (positionMargin + entryFee > availableBefore + 1e-10) {
      throw new PreviewError(
        "insufficient-paper-equity",
        "Projected DizyPaper margin and entry fee exceed currently available paper equity.",
      );
    }
    const liquidation = auditPaperLiquidation({
      side: checked.side,
      entryPrice: mark.price,
      quantity: order.quantity,
      marginMode: checked.marginMode,
      assignedMargin: positionMargin,
      crossCollateral: equityBefore,
      entryFee,
      maintenanceMarginRate: contract.maintenanceMarginRate,
      liquidationPenaltyRate: paper.settings.liquidationPenaltyPct / 100,
    });
    const projectedCash = paper.cashBalance - entryFee;
    const projectedEquity = equityBefore - entryFee;
    const projectedUsed = usedBefore + positionMargin;
    const projectedAvailable = Math.max(0, projectedEquity - projectedUsed);
    const snapshot = input.companion.account.state.snapshot;
    const settlementAsset = snapshot.assets.find((asset) => asset.currency === "USDT") ?? null;
    const matchingPositions = snapshot.positions.filter(
      (position) => position.symbol === checked.symbol,
    );
    const exchangeExposure = matchingPositions.reduce((total, position) => {
      const volume = Number(position.holdVolume);
      return Number.isFinite(volume)
        ? total + volume * contract.contractSize * mark.price
        : total;
    }, 0);
    const warnings = Object.freeze([
      "This preview changes neither MEXC nor DizyPaper state.",
      "It excludes pending orders, queue priority, depth slippage, funding accrued after observation and future provider tier changes.",
      ...(matchingPositions.length > 0
        ? ["MEXC already has observed exposure in this symbol; combined exposure is informational only."]
        : []),
      ...(settlementAsset
        ? []
        : ["MEXC did not return a USDT asset row, so account-level exchange values are unavailable."]),
    ]);

    return Object.freeze({
      policyVersion: MEXC_OWNER_ORDER_PREVIEW_POLICY_VERSION,
      status: "fresh" as const,
      displayEligible: true as const,
      decisionEligible: false as const,
      executable: false as const,
      exchangeWriteCapability: "none" as const,
      request: checked,
      market: Object.freeze({
        price: mark.price,
        priceSource: mark.source,
        contractVolume: order.contractVolume,
        contractSize: order.contractSize,
        quantity: order.quantity,
        notional: order.notional,
        takerFeeRate: contract.takerFeeRate,
      }),
      paperBefore: Object.freeze({
        cashBalance: paper.cashBalance,
        equity: equityBefore,
        usedMargin: usedBefore,
        availableMargin: availableBefore,
        openPositionCount: Object.keys(paper.positions).length,
      }),
      projectedPaper: Object.freeze({
        cashBalance: projectedCash,
        equity: projectedEquity,
        usedMargin: projectedUsed,
        availableMargin: projectedAvailable,
        positionMargin,
        entryFee,
        estimatedLiquidation: liquidation.estimatedLiquidation,
        bankruptcyPrice: liquidation.bankruptcyPrice,
        grossExposure: order.notional,
        openPositionCount: Object.keys(paper.positions).length + 1,
      }),
      exchangeObserved: Object.freeze({
        observedAtMs: snapshot.observedAtMs,
        settlementCurrency: "USDT" as const,
        assetPresent: settlementAsset !== null,
        equity: settlementAsset?.equity ?? null,
        availableBalance: settlementAsset?.availableBalance ?? null,
        positionMargin: settlementAsset?.positionMargin ?? null,
        matchingSymbolPositionCount: matchingPositions.length,
        matchingSymbolGrossExposure: exchangeExposure,
        combinedObservedAndHypotheticalExposure: exchangeExposure + order.notional,
      }),
      warnings,
      failure: null,
    });
  } catch (error) {
    return safeFailure(error);
  }
}
