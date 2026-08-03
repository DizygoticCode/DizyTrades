import "server-only";

import type {
  ManualAccount,
  ManualFill,
  ManualFundingPayment,
  ManualPosition,
} from "./manual-paper";

export const MANUAL_PAPER_ACCOUNTING_METHOD = "manual-paper-accounting-reconciliation-v1" as const;

export type ManualPaperAccountingCoverage = "complete-history" | "retained-window";

export type ManualPaperAccountingAudit = Readonly<{
  calculationMethod: typeof MANUAL_PAPER_ACCOUNTING_METHOD;
  coverage: ManualPaperAccountingCoverage;
  retainedFillCount: number;
  retainedFundingPaymentCount: number;
  activePositionCount: number;
  activeEntryFees: number;
  expectedCashBalance: number;
  cashDifference: number;
  retainedFees: number;
  feeDifference: number | null;
  retainedFundingPnl: number;
  fundingDifference: number | null;
  retainedRealisedPnl: number;
  realisedDifference: number | null;
  violations: readonly string[];
  warnings: readonly string[];
}>;

const finite = (value: number) => Number.isFinite(value);
const total = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0);
const tolerance = (...values: number[]) =>
  Math.max(1e-8, ...values.filter(finite).map((value) => Math.abs(value) * 1e-9));
const reconciles = (actual: number, expected: number, ...scale: number[]) =>
  Math.abs(actual - expected) <= tolerance(actual, expected, ...scale);

function fillFee(fill: ManualFill) {
  return finite(fill.fee) ? fill.fee : 0;
}

function fundingCash(payment: ManualFundingPayment) {
  return finite(payment.cashDelta) ? payment.cashDelta : 0;
}

function activeEntryFee(position: ManualPosition) {
  return finite(position.entryFee) ? position.entryFee : 0;
}

function validateFill(fill: ManualFill, index: number, violations: string[], warnings: string[]) {
  const label = `Manual Paper fill ${index + 1}`;
  const expectedNotional = fill.price * fill.quantity;
  if (!reconciles(fill.notional, expectedNotional)) {
    violations.push(`${label} notional does not reconcile with price and quantity.`);
  }

  const tradingFee = fill.tradingFee;
  const liquidationPenalty = fill.liquidationPenalty;
  if (finite(tradingFee ?? Number.NaN) && finite(liquidationPenalty ?? Number.NaN)) {
    const expectedFee = Number(tradingFee) + Number(liquidationPenalty);
    if (!reconciles(fill.fee, expectedFee)) {
      violations.push(`${label} fee does not reconcile with trading fee and liquidation penalty.`);
    }
  } else {
    warnings.push(`${label} predates complete fee-component evidence.`);
  }

  if (fill.side !== "close") {
    if (fill.entryFee != null && !reconciles(fill.entryFee, fill.fee)) {
      violations.push(`${label} entry fee does not reconcile with its charged fee.`);
    }
    if (!reconciles(fill.realisedPnl, 0)) {
      violations.push(`${label} records realised P/L on an opening fill.`);
    }
    return;
  }

  if (fill.exitFee != null && !reconciles(fill.exitFee, fill.fee)) {
    violations.push(`${label} exit fee does not reconcile with its charged fee.`);
  }
  if (fill.marginSettlement) {
    const settlement = fill.marginSettlement;
    if (!reconciles(settlement.cashBefore + settlement.appliedCashDelta, settlement.cashAfter)) {
      violations.push(`${label} margin settlement cash movement does not reconcile.`);
    }
    if (!reconciles(settlement.cashAfter, fill.resultingBalance)) {
      violations.push(`${label} resulting balance does not reconcile with margin settlement.`);
    }
    if (fill.grossPnl != null && !reconciles(settlement.requestedCashDelta, fill.grossPnl - fill.fee)) {
      violations.push(`${label} requested cash movement does not reconcile with gross P/L and fee.`);
    }
    const expectedRealised = settlement.appliedCashDelta - Number(fill.entryFee ?? 0) + Number(fill.fundingPnl ?? 0);
    if (!reconciles(fill.realisedPnl, expectedRealised)) {
      violations.push(`${label} realised P/L does not reconcile with settlement, entry fee and funding.`);
    }
    if (fill.netPnl != null && !reconciles(fill.netPnl, fill.realisedPnl)) {
      violations.push(`${label} net P/L does not reconcile with realised P/L.`);
    }
  } else {
    warnings.push(`${label} predates margin-settlement evidence.`);
  }

  if (fill.grossPnl != null && fill.entryPrice != null && fill.reduceOnly) {
    const direction = fill.reduceOnly.expectedSide === "long" ? 1 : -1;
    const expectedGross = (fill.price - fill.entryPrice) * fill.quantity * direction;
    if (!reconciles(fill.grossPnl, expectedGross)) {
      violations.push(`${label} gross P/L does not reconcile with the reduced position side.`);
    }
  }
}

function validateFunding(payment: ManualFundingPayment, index: number, violations: string[]) {
  const label = `Manual Paper funding payment ${index + 1}`;
  const expectedNotional = payment.price * payment.quantity;
  if (!reconciles(payment.notional, expectedNotional)) {
    violations.push(`${label} notional does not reconcile with price and quantity.`);
  }
  if (!payment.balanceCapped && !reconciles(payment.cashDelta, payment.calculatedCashDelta)) {
    violations.push(`${label} uncapped cash movement differs from its calculated value.`);
  }
  if (payment.balanceCapped) {
    if (Math.sign(payment.cashDelta) !== 0 && Math.sign(payment.cashDelta) !== Math.sign(payment.calculatedCashDelta)) {
      violations.push(`${label} capped cash movement changes direction.`);
    }
    if (Math.abs(payment.cashDelta) - Math.abs(payment.calculatedCashDelta) > tolerance(payment.cashDelta, payment.calculatedCashDelta)) {
      violations.push(`${label} capped cash movement exceeds its calculated value.`);
    }
  }
  if (payment.isolatedMarginDebit != null && payment.isolatedMarginDebit < 0) {
    violations.push(`${label} contains a negative isolated-margin debit.`);
  }
}

export function auditManualPaperAccounting(account: ManualAccount): ManualPaperAccountingAudit {
  const violations: string[] = [];
  const warnings: string[] = [];
  const positions = Object.values(account.positions);
  const activeEntryFees = total(positions.map(activeEntryFee));
  const expectedCashBalance = account.startingBalance + account.realisedPnl - activeEntryFees;
  const cashDifference = account.cashBalance - expectedCashBalance;
  const nativeAccounting = account.migration.sourceAccountVersion === 4;

  if (nativeAccounting) {
    if (!reconciles(account.cashBalance, expectedCashBalance, activeEntryFees)) {
      violations.push("Manual Paper cash balance does not reconcile with starting balance, realised P/L and active entry fees.");
    }
  } else {
    warnings.push("Legacy Manual Paper top-level accounting predates the native cash-state bridge and is preserved rather than reconstructed.");
  }

  account.fills.forEach((fill, index) => validateFill(fill, index, violations, warnings));
  account.fundingPayments.forEach((payment, index) => validateFunding(payment, index, violations));

  const retainedFees = total(account.fills.map(fillFee));
  const retainedFundingPnl = total(account.fundingPayments.map(fundingCash));
  const retainedTradingPnl = total(
    account.fills
      .filter((fill) => fill.side === "close")
      .map((fill) => fill.realisedPnl - Number(fill.fundingPnl ?? 0)),
  );
  const retainedRealisedPnl = retainedTradingPnl + retainedFundingPnl;
  const completeFills = nativeAccounting && account.fills.length < 500;
  const completeFunding = nativeAccounting && account.fundingPayments.length < 1000;
  const coverage: ManualPaperAccountingCoverage = completeFills && completeFunding
    ? "complete-history"
    : "retained-window";

  let feeDifference: number | null = null;
  if (completeFills) {
    feeDifference = account.fees - retainedFees;
    if (!reconciles(account.fees, retainedFees)) {
      violations.push("Manual Paper cumulative fees do not reconcile with complete retained fill history.");
    }
  } else {
    if (nativeAccounting && retainedFees - account.fees > tolerance(retainedFees, account.fees)) {
      violations.push("Manual Paper cumulative fees are lower than fees visible in the retained fill window.");
    }
    warnings.push("Manual Paper fee history is legacy or retention-bounded; cumulative fees cannot be reconstructed exactly from retained fills.");
  }

  let fundingDifference: number | null = null;
  if (completeFunding) {
    fundingDifference = account.fundingPnl - retainedFundingPnl;
    if (!reconciles(account.fundingPnl, retainedFundingPnl)) {
      violations.push("Manual Paper cumulative funding P/L does not reconcile with complete retained funding history.");
    }
  } else {
    warnings.push("Manual Paper funding history is legacy or retention-bounded; cumulative funding cannot be reconstructed exactly from retained payments.");
  }

  let realisedDifference: number | null = null;
  if (completeFills && completeFunding) {
    realisedDifference = account.realisedPnl - retainedRealisedPnl;
    if (!reconciles(account.realisedPnl, retainedRealisedPnl)) {
      violations.push("Manual Paper realised P/L does not reconcile with complete retained closes and funding payments.");
    }
  } else {
    warnings.push("Manual Paper realised history is legacy or retention-bounded; native current accounts use the cash-state bridge.");
  }

  return Object.freeze({
    calculationMethod: MANUAL_PAPER_ACCOUNTING_METHOD,
    coverage,
    retainedFillCount: account.fills.length,
    retainedFundingPaymentCount: account.fundingPayments.length,
    activePositionCount: positions.length,
    activeEntryFees,
    expectedCashBalance,
    cashDifference,
    retainedFees,
    feeDifference,
    retainedFundingPnl,
    fundingDifference,
    retainedRealisedPnl,
    realisedDifference,
    violations: Object.freeze([...new Set(violations)]),
    warnings: Object.freeze([...new Set(warnings)]),
  });
}

export function assertManualPaperAccounting(account: ManualAccount) {
  const audit = auditManualPaperAccounting(account);
  if (audit.violations.length) {
    throw new Error(audit.violations[0]);
  }
  return audit;
}
