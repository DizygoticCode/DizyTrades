import "server-only";

import {
  requireFreshMexcAccountSnapshot,
  type MexcAccountAvailabilityState,
} from "./mexc-account-state-availability";
import type {
  MexcAccountAsset,
  MexcAccountPosition,
} from "./mexc-account-state";
import {
  auditManualPaperAccounting,
  type ManualPaperAccountingAudit,
} from "./manual-paper-accounting-audit";
import {
  manualEquity,
  usedManualMargin,
  type ManualAccount,
  type ManualPosition,
} from "./manual-paper";

export const MEXC_DIZYPAPER_RECONCILIATION_METHOD =
  "mexc-dizypaper-shadow-reconciliation-v1" as const;

export type ShadowNumericComparison = Readonly<{
  exchangeValue: string | null;
  paperValue: number | null;
  difference: number | null;
  comparable: boolean;
  withinTolerance: boolean | null;
}>;

export type MexcDizyPaperPositionStatus =
  | "aligned"
  | "different"
  | "incomparable"
  | "exchange-only"
  | "paper-only"
  | "ambiguous-exchange";

export type MexcDizyPaperPositionReconciliation = Readonly<{
  key: string;
  symbol: string;
  side: "long" | "short";
  status: MexcDizyPaperPositionStatus;
  exchangePositionIds: readonly string[];
  paperTradeId: string | null;
  marginModeMatches: boolean | null;
  leverageMatches: boolean | null;
  contractVolume: ShadowNumericComparison;
  entryPrice: ShadowNumericComparison;
  margin: ShadowNumericComparison;
  liquidationPrice: ShadowNumericComparison;
  warnings: readonly string[];
}>;

export type MexcDizyPaperReconciliation = Readonly<{
  calculationMethod: typeof MEXC_DIZYPAPER_RECONCILIATION_METHOD;
  exchangeObservedAtMs: number;
  paperUpdatedAt: string;
  settlementCurrency: string;
  tolerance: Readonly<{
    absolute: number;
    relative: number;
  }>;
  paperAccounting: ManualPaperAccountingAudit;
  account: Readonly<{
    exchangeAssetPresent: boolean;
    marksComplete: boolean;
    availableCash: ShadowNumericComparison;
    equity: ShadowNumericComparison;
    positionMargin: ShadowNumericComparison;
    unrealizedPnl: ShadowNumericComparison;
  }>;
  positions: readonly MexcDizyPaperPositionReconciliation[];
  summary: Readonly<{
    aligned: number;
    different: number;
    incomparable: number;
    exchangeOnly: number;
    paperOnly: number;
    ambiguousExchange: number;
  }>;
  warnings: readonly string[];
}>;

export class MexcDizyPaperReconciliationError extends Error {
  constructor(
    public readonly kind:
      | "invalid-policy"
      | "invalid-paper-account"
      | "duplicate-paper-position",
    message: string,
  ) {
    super(message);
    this.name = "MexcDizyPaperReconciliationError";
  }
}

const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const currencyPattern = /^[A-Z0-9]{1,20}$/;

function finiteNonNegative(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new MexcDizyPaperReconciliationError(
      "invalid-policy",
      `${field} must be a finite non-negative number.`,
    );
  }
  return value;
}

function tolerance(input?: Readonly<{ absolute?: number; relative?: number }>) {
  const absolute = finiteNonNegative(input?.absolute ?? 1e-8, "absolute tolerance");
  const relative = finiteNonNegative(input?.relative ?? 1e-6, "relative tolerance");
  if (absolute > 1 || relative > 0.1) {
    throw new MexcDizyPaperReconciliationError(
      "invalid-policy",
      "Reconciliation tolerance is excessively permissive.",
    );
  }
  return Object.freeze({ absolute, relative });
}

function decimalNumber(value: string | null) {
  if (value === null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compareNumeric(
  exchangeValue: string | null,
  paperValue: number | null,
  checkedTolerance: Readonly<{ absolute: number; relative: number }>,
): ShadowNumericComparison {
  const exchangeNumber = decimalNumber(exchangeValue);
  if (
    exchangeNumber === null ||
    paperValue === null ||
    !Number.isFinite(paperValue)
  ) {
    return Object.freeze({
      exchangeValue,
      paperValue: Number.isFinite(paperValue) ? paperValue : null,
      difference: null,
      comparable: false,
      withinTolerance: null,
    });
  }
  const difference = paperValue - exchangeNumber;
  const allowed = Math.max(
    checkedTolerance.absolute,
    Math.max(Math.abs(exchangeNumber), Math.abs(paperValue)) * checkedTolerance.relative,
  );
  return Object.freeze({
    exchangeValue,
    paperValue,
    difference,
    comparable: true,
    withinTolerance: Math.abs(difference) <= allowed,
  });
}

function positionKey(symbol: string, side: "long" | "short") {
  return `${symbol}:${side}`;
}

function normaliseSettlementCurrency(value: string | undefined) {
  const currency = (value ?? "USDT").trim().toUpperCase();
  if (!currencyPattern.test(currency)) {
    throw new MexcDizyPaperReconciliationError(
      "invalid-policy",
      "Settlement currency is invalid.",
    );
  }
  return currency;
}

function validatePaperPosition(position: ManualPosition) {
  if (!symbolPattern.test(position.symbol)) {
    throw new MexcDizyPaperReconciliationError(
      "invalid-paper-account",
      "DizyPaper contains an invalid futures symbol.",
    );
  }
  if (position.side !== "long" && position.side !== "short") {
    throw new MexcDizyPaperReconciliationError(
      "invalid-paper-account",
      "DizyPaper contains an invalid position side.",
    );
  }
  return position;
}

function paperPositionMap(account: ManualAccount) {
  const result = new Map<string, ManualPosition>();
  for (const value of Object.values(account.positions)) {
    const position = validatePaperPosition(value);
    const key = positionKey(position.symbol, position.side);
    if (result.has(key)) {
      throw new MexcDizyPaperReconciliationError(
        "duplicate-paper-position",
        `DizyPaper contains duplicate position identity ${key}.`,
      );
    }
    result.set(key, position);
  }
  return result;
}

function exchangePositionMap(positions: readonly MexcAccountPosition[]) {
  const result = new Map<string, MexcAccountPosition[]>();
  for (const position of positions) {
    const key = positionKey(position.symbol, position.side);
    const existing = result.get(key) ?? [];
    existing.push(position);
    result.set(key, existing);
  }
  for (const values of result.values()) {
    values.sort((left, right) => left.positionId.localeCompare(right.positionId));
  }
  return result;
}

function emptyComparison(
  exchangeValue: string | null,
  paperValue: number | null,
): ShadowNumericComparison {
  return Object.freeze({
    exchangeValue,
    paperValue,
    difference: null,
    comparable: false,
    withinTolerance: null,
  });
}

function positionReconciliation(input: Readonly<{
  key: string;
  exchange: readonly MexcAccountPosition[];
  paper: ManualPosition | null;
  tolerance: Readonly<{ absolute: number; relative: number }>;
}>): MexcDizyPaperPositionReconciliation {
  const [symbol, sideText] = input.key.split(":");
  const side = sideText as "long" | "short";
  const warnings: string[] = [];

  if (input.exchange.length > 1) {
    warnings.push(
      "MEXC returned multiple current positions for the same symbol and side; one-to-one comparison is ambiguous.",
    );
    return Object.freeze({
      key: input.key,
      symbol,
      side,
      status: "ambiguous-exchange",
      exchangePositionIds: Object.freeze(
        input.exchange.map((position) => position.positionId),
      ),
      paperTradeId: input.paper?.tradeId ?? null,
      marginModeMatches: null,
      leverageMatches: null,
      contractVolume: emptyComparison(null, input.paper?.contractVolume ?? null),
      entryPrice: emptyComparison(null, input.paper?.entryPrice ?? null),
      margin: emptyComparison(null, input.paper?.margin ?? null),
      liquidationPrice: emptyComparison(
        null,
        input.paper?.estimatedLiquidation ?? null,
      ),
      warnings: Object.freeze(warnings),
    });
  }

  const exchange = input.exchange[0] ?? null;
  if (!exchange && input.paper) {
    return Object.freeze({
      key: input.key,
      symbol,
      side,
      status: "paper-only",
      exchangePositionIds: Object.freeze([]),
      paperTradeId: input.paper.tradeId,
      marginModeMatches: null,
      leverageMatches: null,
      contractVolume: emptyComparison(null, input.paper.contractVolume ?? null),
      entryPrice: emptyComparison(null, input.paper.entryPrice),
      margin: emptyComparison(null, input.paper.margin),
      liquidationPrice: emptyComparison(null, input.paper.estimatedLiquidation),
      warnings: Object.freeze([
        "DizyPaper has an open position with no matching current MEXC position.",
      ]),
    });
  }
  if (exchange && !input.paper) {
    return Object.freeze({
      key: input.key,
      symbol,
      side,
      status: "exchange-only",
      exchangePositionIds: Object.freeze([exchange.positionId]),
      paperTradeId: null,
      marginModeMatches: null,
      leverageMatches: null,
      contractVolume: emptyComparison(exchange.holdVolume, null),
      entryPrice: emptyComparison(exchange.holdAveragePrice, null),
      margin: emptyComparison(exchange.initialMargin, null),
      liquidationPrice: emptyComparison(exchange.liquidationPrice, null),
      warnings: Object.freeze([
        "MEXC has a current position with no matching DizyPaper position.",
      ]),
    });
  }
  if (!exchange || !input.paper) {
    throw new MexcDizyPaperReconciliationError(
      "invalid-paper-account",
      "Position reconciliation reached an impossible identity state.",
    );
  }

  const contractVolume = compareNumeric(
    exchange.holdVolume,
    input.paper.contractVolume ?? null,
    input.tolerance,
  );
  if (!contractVolume.comparable) {
    warnings.push(
      "DizyPaper did not retain comparable contract volume; base quantity is not substituted for MEXC hold volume.",
    );
  }
  const entryPrice = compareNumeric(
    exchange.holdAveragePrice,
    input.paper.entryPrice,
    input.tolerance,
  );
  const margin = compareNumeric(
    exchange.initialMargin,
    input.paper.margin,
    input.tolerance,
  );
  const liquidationPrice = compareNumeric(
    exchange.liquidationPrice,
    input.paper.estimatedLiquidation,
    input.tolerance,
  );
  const marginModeMatches = exchange.marginMode === input.paper.marginMode;
  const leverageMatches = exchange.leverage === input.paper.leverage;
  const comparisons = [contractVolume, entryPrice, margin, liquidationPrice];
  const complete = comparisons.every((comparison) => comparison.comparable);
  const numericMatches = comparisons.every(
    (comparison) => comparison.withinTolerance !== false,
  );
  const status: MexcDizyPaperPositionStatus = !complete
    ? "incomparable"
    : marginModeMatches && leverageMatches && numericMatches
      ? "aligned"
      : "different";

  return Object.freeze({
    key: input.key,
    symbol,
    side,
    status,
    exchangePositionIds: Object.freeze([exchange.positionId]),
    paperTradeId: input.paper.tradeId,
    marginModeMatches,
    leverageMatches,
    contractVolume,
    entryPrice,
    margin,
    liquidationPrice,
    warnings: Object.freeze(warnings),
  });
}

function completePaperMarks(
  account: ManualAccount,
  marks: Readonly<Record<string, number>>,
) {
  const required = [...new Set(Object.values(account.positions).map((position) => position.symbol))];
  return required.every((symbol) => {
    const value = marks[symbol];
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  });
}

function accountReconciliation(input: Readonly<{
  asset: MexcAccountAsset | null;
  paper: ManualAccount;
  marks: Readonly<Record<string, number>>;
  tolerance: Readonly<{ absolute: number; relative: number }>;
}>) {
  const marksComplete = completePaperMarks(input.paper, input.marks);
  const paperEquity = marksComplete ? manualEquity(input.paper, { ...input.marks }) : null;
  const paperUnrealized = paperEquity === null
    ? null
    : paperEquity - input.paper.cashBalance;
  const paperMargin = usedManualMargin(input.paper);
  return Object.freeze({
    exchangeAssetPresent: input.asset !== null,
    marksComplete,
    availableCash: compareNumeric(
      input.asset?.availableBalance ?? null,
      input.paper.cashBalance,
      input.tolerance,
    ),
    equity: compareNumeric(
      input.asset?.equity ?? null,
      paperEquity,
      input.tolerance,
    ),
    positionMargin: compareNumeric(
      input.asset?.positionMargin ?? null,
      paperMargin,
      input.tolerance,
    ),
    unrealizedPnl: compareNumeric(
      input.asset?.unrealizedPnl ?? null,
      paperUnrealized,
      input.tolerance,
    ),
  });
}

export function reconcileMexcAccountWithDizyPaper(input: Readonly<{
  exchangeState: MexcAccountAvailabilityState;
  paperAccount: ManualAccount;
  marks?: Readonly<Record<string, number>>;
  settlementCurrency?: string;
  tolerance?: Readonly<{ absolute?: number; relative?: number }>;
}>): MexcDizyPaperReconciliation {
  const snapshot = requireFreshMexcAccountSnapshot(input.exchangeState);
  const checkedTolerance = tolerance(input.tolerance);
  const settlementCurrency = normaliseSettlementCurrency(input.settlementCurrency);
  const paperAccounting = auditManualPaperAccounting(input.paperAccount);
  if (paperAccounting.violations.length > 0) {
    throw new MexcDizyPaperReconciliationError(
      "invalid-paper-account",
      paperAccounting.violations[0],
    );
  }

  const paperPositions = paperPositionMap(input.paperAccount);
  const exchangePositions = exchangePositionMap(snapshot.positions);
  const keys = [...new Set([...paperPositions.keys(), ...exchangePositions.keys()])].sort();
  const positions = keys.map((key) =>
    positionReconciliation({
      key,
      exchange: exchangePositions.get(key) ?? [],
      paper: paperPositions.get(key) ?? null,
      tolerance: checkedTolerance,
    }),
  );
  const summary = {
    aligned: positions.filter((position) => position.status === "aligned").length,
    different: positions.filter((position) => position.status === "different").length,
    incomparable: positions.filter((position) => position.status === "incomparable").length,
    exchangeOnly: positions.filter((position) => position.status === "exchange-only").length,
    paperOnly: positions.filter((position) => position.status === "paper-only").length,
    ambiguousExchange: positions.filter(
      (position) => position.status === "ambiguous-exchange",
    ).length,
  };
  const asset = snapshot.assets.find(
    (candidate) => candidate.currency === settlementCurrency,
  ) ?? null;
  const marks = input.marks ?? {};
  const account = accountReconciliation({
    asset,
    paper: input.paperAccount,
    marks,
    tolerance: checkedTolerance,
  });
  const warnings = [
    ...paperAccounting.warnings,
    ...(asset
      ? []
      : [`MEXC did not return a ${settlementCurrency} futures asset.`]),
    ...(account.marksComplete
      ? []
      : [
          "Current marks are incomplete; DizyPaper equity and unrealised P/L are not compared.",
        ]),
    "DizyPaper and MEXC are independent states; differences are observations, not automatic corrections.",
  ];

  return Object.freeze({
    calculationMethod: MEXC_DIZYPAPER_RECONCILIATION_METHOD,
    exchangeObservedAtMs: snapshot.observedAtMs,
    paperUpdatedAt: input.paperAccount.updatedAt,
    settlementCurrency,
    tolerance: checkedTolerance,
    paperAccounting,
    account,
    positions: Object.freeze(positions),
    summary: Object.freeze(summary),
    warnings: Object.freeze([...new Set(warnings)]),
  });
}
