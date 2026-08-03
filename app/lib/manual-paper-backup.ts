import "server-only";

import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_MANUAL_SETTINGS,
  newManualAccount,
  type ManualAccount,
  type ManualFill,
  type ManualFundingPayment,
  type ManualPosition,
  type ManualSettings,
} from "./manual-paper";

const root = () => process.env.DATA_DIR || join(process.cwd(), ".data");
const safeUserId = (value: string) => {
  if (!/^[a-z0-9_-]{1,120}$/i.test(value)) {
    throw new Error("Invalid Manual Paper owner identifier.");
  }
  return value;
};
const targetPath = (userId: string) =>
  join(root(), "manual-paper", `${safeUserId(userId)}.json`);

const object = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
};
const string = (value: unknown, field: string, max = 300) => {
  if (typeof value !== "string" || !value || value.length > max) {
    throw new Error(`${field} is invalid.`);
  }
  return value;
};
const optionalString = (value: unknown, field: string, max = 300) =>
  value == null ? undefined : string(value, field, max);
const number = (
  value: unknown,
  field: string,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${field} is invalid.`);
  }
  return value;
};
const nullableNumber = (
  value: unknown,
  field: string,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
) =>
  value == null ? null : number(value, field, minimum, maximum);
const boolean = (value: unknown, field: string) => {
  if (typeof value !== "boolean") throw new Error(`${field} is invalid.`);
  return value;
};
const iso = (value: unknown, field: string) => {
  const candidate = string(value, field, 50);
  const milliseconds = Date.parse(candidate);
  if (!Number.isFinite(milliseconds)) throw new Error(`${field} is invalid.`);
  return new Date(milliseconds).toISOString();
};
const oneOf = <T extends string>(
  value: unknown,
  field: string,
  values: readonly T[],
): T => {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`${field} is invalid.`);
  }
  return value as T;
};
const symbol = (value: unknown, field: string) => {
  const candidate = string(value, field, 40);
  if (!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(candidate)) {
    throw new Error(`${field} is invalid.`);
  }
  return candidate;
};

function settings(value: unknown): ManualSettings {
  const input = object(value, "manualPaper.settings");
  return Object.freeze({
    enabled: boolean(input.enabled, "manualPaper.settings.enabled"),
    showQuickButtons: boolean(
      input.showQuickButtons,
      "manualPaper.settings.showQuickButtons",
    ),
    commissionPct: number(
      input.commissionPct,
      "manualPaper.settings.commissionPct",
      0,
      5,
    ),
    makerCommissionPct: number(
      input.makerCommissionPct,
      "manualPaper.settings.makerCommissionPct",
      0,
      5,
    ),
    slippagePct: number(
      input.slippagePct,
      "manualPaper.settings.slippagePct",
      0,
      10,
    ),
    liquidationPenaltyPct: number(
      input.liquidationPenaltyPct,
      "manualPaper.settings.liquidationPenaltyPct",
      0,
      25,
    ),
    maintenanceMarginPct: number(
      input.maintenanceMarginPct,
      "manualPaper.settings.maintenanceMarginPct",
      0,
      25,
    ),
    allowAdding: boolean(input.allowAdding, "manualPaper.settings.allowAdding"),
    confirmationRequired: boolean(
      input.confirmationRequired,
      "manualPaper.settings.confirmationRequired",
    ),
    defaultSizeMode: oneOf(
      input.defaultSizeMode,
      "manualPaper.settings.defaultSizeMode",
      ["fixed-margin", "fixed-notional", "equity-percent", "risk-percent"] as const,
    ),
    defaultAmount: number(
      input.defaultAmount,
      "manualPaper.settings.defaultAmount",
      0.000001,
      1_000_000_000,
    ),
    defaultEquityPct: number(
      input.defaultEquityPct,
      "manualPaper.settings.defaultEquityPct",
      0.01,
      100,
    ),
    defaultLeverage: number(
      input.defaultLeverage,
      "manualPaper.settings.defaultLeverage",
      1,
      1_000,
    ),
    defaultMarginMode: oneOf(
      input.defaultMarginMode,
      "manualPaper.settings.defaultMarginMode",
      ["isolated", "cross"] as const,
    ),
    panelHeight: number(
      input.panelHeight,
      "manualPaper.settings.panelHeight",
      120,
      1_200,
    ),
    panelCollapsed: boolean(
      input.panelCollapsed,
      "manualPaper.settings.panelCollapsed",
    ),
    panelHidden: boolean(input.panelHidden, "manualPaper.settings.panelHidden"),
  });
}

function position(value: unknown, key: string): ManualPosition {
  const input = object(value, `manualPaper.positions.${key}`);
  const marketSymbol = symbol(input.symbol, `manualPaper.positions.${key}.symbol`);
  if (marketSymbol !== key) throw new Error("Manual Paper position key mismatch.");
  const entryPrice = number(input.entryPrice, "manualPaper.position.entryPrice", 0.000000000001);
  const quantity = number(input.quantity, "manualPaper.position.quantity", 0.000000000001);
  const leverage = number(input.leverage, "manualPaper.position.leverage", 1, 1_000);
  return Object.freeze({
    tradeId: string(input.tradeId, "manualPaper.position.tradeId", 300),
    marketKey: string(input.marketKey, "manualPaper.position.marketKey", 100),
    marketType: oneOf(input.marketType, "manualPaper.position.marketType", ["futures"] as const),
    symbol: marketSymbol,
    side: oneOf(input.side, "manualPaper.position.side", ["long", "short"] as const),
    quantity,
    contractVolume: input.contractVolume == null ? undefined : number(input.contractVolume, "manualPaper.position.contractVolume", 0.000000000001),
    contractSize: input.contractSize == null ? undefined : number(input.contractSize, "manualPaper.position.contractSize", 0.000000000001),
    priceUnit: input.priceUnit == null ? undefined : number(input.priceUnit, "manualPaper.position.priceUnit", 0.000000000001),
    volUnit: input.volUnit == null ? undefined : number(input.volUnit, "manualPaper.position.volUnit", 0.000000000001),
    minContractVolume: input.minContractVolume == null ? undefined : number(input.minContractVolume, "manualPaper.position.minContractVolume", 0.000000000001),
    maxContractVolume: input.maxContractVolume == null ? undefined : number(input.maxContractVolume, "manualPaper.position.maxContractVolume", 0.000000000001),
    entryPrice,
    leverage,
    margin: number(input.margin, "manualPaper.position.margin", 0),
    marginMode: oneOf(
      input.marginMode,
      "manualPaper.position.marginMode",
      ["isolated", "cross"] as const,
    ),
    stopLoss: nullableNumber(input.stopLoss, "manualPaper.position.stopLoss", 0),
    takeProfit: nullableNumber(input.takeProfit, "manualPaper.position.takeProfit", 0),
    estimatedLiquidation: number(
      input.estimatedLiquidation,
      "manualPaper.position.estimatedLiquidation",
      0,
    ),
    entryFee: number(input.entryFee, "manualPaper.position.entryFee", 0),
    executionType: input.executionType == null ? undefined : oneOf(input.executionType, "manualPaper.position.executionType", ["market"] as const),
    liquidityRole: input.liquidityRole == null ? undefined : oneOf(input.liquidityRole, "manualPaper.position.liquidityRole", ["maker", "taker"] as const),
    feeRate: input.feeRate == null ? undefined : number(input.feeRate, "manualPaper.position.feeRate", 0, 1),
    feeSource: input.feeSource == null ? undefined : oneOf(input.feeSource, "manualPaper.position.feeSource", ["mexc-public-contract", "legacy-settings-fallback"] as const),
    makerFeeRate: input.makerFeeRate == null ? undefined : number(input.makerFeeRate, "manualPaper.position.makerFeeRate", 0, 1),
    takerFeeRate: input.takerFeeRate == null ? undefined : number(input.takerFeeRate, "manualPaper.position.takerFeeRate", 0, 1),
    fundingRate: input.fundingRate == null ? undefined : number(input.fundingRate, "manualPaper.position.fundingRate", -1, 1),
    fundingMinRate: input.fundingMinRate == null ? undefined : number(input.fundingMinRate, "manualPaper.position.fundingMinRate", -1, 1),
    fundingMaxRate: input.fundingMaxRate == null ? undefined : number(input.fundingMaxRate, "manualPaper.position.fundingMaxRate", -1, 1),
    fundingCollectCycleHours: input.fundingCollectCycleHours == null ? undefined : number(input.fundingCollectCycleHours, "manualPaper.position.fundingCollectCycleHours", 0.01, 168),
    nextFundingTime: input.nextFundingTime == null ? undefined : number(input.nextFundingTime, "manualPaper.position.nextFundingTime", 1),
    fundingSource: input.fundingSource == null ? undefined : oneOf(input.fundingSource, "manualPaper.position.fundingSource", ["mexc-public-funding-rate"] as const),
    fundingObservedAt: input.fundingObservedAt == null ? undefined : number(input.fundingObservedAt, "manualPaper.position.fundingObservedAt", 1),
    fundingPnl: input.fundingPnl == null ? undefined : number(input.fundingPnl, "manualPaper.position.fundingPnl"),
    lastFundingSettlementAt: input.lastFundingSettlementAt == null ? undefined : number(input.lastFundingSettlementAt, "manualPaper.position.lastFundingSettlementAt", 1),
    riskPriceSource: oneOf(
      input.riskPriceSource,
      "manualPaper.position.riskPriceSource",
      ["fair", "last"] as const,
    ),
    lastRiskPrice: number(input.lastRiskPrice, "manualPaper.position.lastRiskPrice", 0),
    openedAt: iso(input.openedAt, "manualPaper.position.openedAt"),
  });
}

function flowReference(value: unknown): ManualFill["historicalDizyFlow"] {
  if (value == null) return undefined;
  const input = object(value, "manualPaper.fill.historicalDizyFlow");
  if (input.available !== true) {
    return Object.freeze({
      available: false,
      memoryId: null,
      captureStartMs: null,
      captureEndMs: null,
      sampleCount: 0,
      eventCount: 0,
      averageConfidence: null,
      coveragePct: null,
      limitations: Object.freeze([]),
    });
  }
  const limitations = Array.isArray(input.limitations)
    ? input.limitations.map((item, index) =>
        string(item, `manualPaper.fill.historicalDizyFlow.limitations.${index}`, 80),
      )
    : [];
  if (limitations.length > 50) throw new Error("Historical DizyFlow limitations are excessive.");
  return Object.freeze({
    available: true,
    memoryId: string(input.memoryId, "manualPaper.fill.historicalDizyFlow.memoryId", 120),
    captureStartMs: number(input.captureStartMs, "manualPaper.fill.historicalDizyFlow.captureStartMs", 0),
    captureEndMs: number(input.captureEndMs, "manualPaper.fill.historicalDizyFlow.captureEndMs", 0),
    sampleCount: number(input.sampleCount, "manualPaper.fill.historicalDizyFlow.sampleCount", 0),
    eventCount: number(input.eventCount, "manualPaper.fill.historicalDizyFlow.eventCount", 0),
    averageConfidence: nullableNumber(
      input.averageConfidence,
      "manualPaper.fill.historicalDizyFlow.averageConfidence",
      0,
      100,
    ),
    coveragePct: nullableNumber(
      input.coveragePct,
      "manualPaper.fill.historicalDizyFlow.coveragePct",
      0,
      100,
    ),
    limitations: Object.freeze(limitations),
  });
}

function fill(value: unknown, index: number): ManualFill {
  const input = object(value, `manualPaper.fills.${index}`);
  return Object.freeze({
    orderId: string(input.orderId, "manualPaper.fill.orderId", 120),
    fillId: string(input.fillId, "manualPaper.fill.fillId", 120),
    tradeId: optionalString(input.tradeId, "manualPaper.fill.tradeId", 300),
    marketKey: optionalString(input.marketKey, "manualPaper.fill.marketKey", 100),
    marketType:
      input.marketType == null
        ? undefined
        : oneOf(input.marketType, "manualPaper.fill.marketType", ["futures"] as const),
    historicalDizyFlow: flowReference(input.historicalDizyFlow),
    idempotencyKey: string(input.idempotencyKey, "manualPaper.fill.idempotencyKey", 120),
    userId: string(input.userId, "manualPaper.fill.userId", 120),
    symbol: symbol(input.symbol, "manualPaper.fill.symbol"),
    side: oneOf(input.side, "manualPaper.fill.side", ["long", "short", "close"] as const),
    marginMode:
      input.marginMode == null
        ? undefined
        : oneOf(input.marginMode, "manualPaper.fill.marginMode", ["isolated", "cross"] as const),
    leverage:
      input.leverage == null
        ? undefined
        : number(input.leverage, "manualPaper.fill.leverage", 1, 1_000),
    price: number(input.price, "manualPaper.fill.price", 0),
    entryPrice:
      input.entryPrice == null
        ? undefined
        : number(input.entryPrice, "manualPaper.fill.entryPrice", 0),
    quantity: number(input.quantity, "manualPaper.fill.quantity", 0),
    contractVolume: input.contractVolume == null ? undefined : number(input.contractVolume, "manualPaper.fill.contractVolume", 0.000000000001),
    contractSize: input.contractSize == null ? undefined : number(input.contractSize, "manualPaper.fill.contractSize", 0.000000000001),
    priceUnit: input.priceUnit == null ? undefined : number(input.priceUnit, "manualPaper.fill.priceUnit", 0.000000000001),
    volUnit: input.volUnit == null ? undefined : number(input.volUnit, "manualPaper.fill.volUnit", 0.000000000001),
    minContractVolume: input.minContractVolume == null ? undefined : number(input.minContractVolume, "manualPaper.fill.minContractVolume", 0.000000000001),
    maxContractVolume: input.maxContractVolume == null ? undefined : number(input.maxContractVolume, "manualPaper.fill.maxContractVolume", 0.000000000001),
    notional: number(input.notional, "manualPaper.fill.notional", 0),
    marginUsed:
      input.marginUsed == null
        ? undefined
        : number(input.marginUsed, "manualPaper.fill.marginUsed", 0),
    stopLoss:
      input.stopLoss === undefined
        ? undefined
        : nullableNumber(input.stopLoss, "manualPaper.fill.stopLoss", 0),
    takeProfit:
      input.takeProfit === undefined
        ? undefined
        : nullableNumber(input.takeProfit, "manualPaper.fill.takeProfit", 0),
    estimatedLiquidation:
      input.estimatedLiquidation == null
        ? undefined
        : number(input.estimatedLiquidation, "manualPaper.fill.estimatedLiquidation", 0),
    riskPriceSource:
      input.riskPriceSource == null
        ? undefined
        : oneOf(input.riskPriceSource, "manualPaper.fill.riskPriceSource", ["fair", "last"] as const),
    entryFee:
      input.entryFee == null
        ? undefined
        : number(input.entryFee, "manualPaper.fill.entryFee", 0),
    exitFee:
      input.exitFee == null
        ? undefined
        : number(input.exitFee, "manualPaper.fill.exitFee", 0),
    executionType: input.executionType == null ? undefined : oneOf(input.executionType, "manualPaper.fill.executionType", ["market"] as const),
    liquidityRole: input.liquidityRole == null ? undefined : oneOf(input.liquidityRole, "manualPaper.fill.liquidityRole", ["maker", "taker"] as const),
    feeRate: input.feeRate == null ? undefined : number(input.feeRate, "manualPaper.fill.feeRate", 0, 1),
    feeSource: input.feeSource == null ? undefined : oneOf(input.feeSource, "manualPaper.fill.feeSource", ["mexc-public-contract", "legacy-settings-fallback"] as const),
    makerFeeRate: input.makerFeeRate == null ? undefined : number(input.makerFeeRate, "manualPaper.fill.makerFeeRate", 0, 1),
    takerFeeRate: input.takerFeeRate == null ? undefined : number(input.takerFeeRate, "manualPaper.fill.takerFeeRate", 0, 1),
    tradingFee: input.tradingFee == null ? undefined : number(input.tradingFee, "manualPaper.fill.tradingFee", 0),
    liquidationPenalty: input.liquidationPenalty == null ? undefined : number(input.liquidationPenalty, "manualPaper.fill.liquidationPenalty", 0),
    fundingPnl: input.fundingPnl == null ? undefined : number(input.fundingPnl, "manualPaper.fill.fundingPnl"),
    fee: number(input.fee, "manualPaper.fill.fee", 0),
    timestamp: iso(input.timestamp, "manualPaper.fill.timestamp"),
    openedAt:
      input.openedAt == null ? undefined : iso(input.openedAt, "manualPaper.fill.openedAt"),
    closeReason:
      input.closeReason == null
        ? undefined
        : oneOf(
            input.closeReason,
            "manualPaper.fill.closeReason",
            ["manual", "stop", "target", "liquidation", "reversal"] as const,
          ),
    grossPnl:
      input.grossPnl == null
        ? undefined
        : number(input.grossPnl, "manualPaper.fill.grossPnl"),
    netPnl:
      input.netPnl == null ? undefined : number(input.netPnl, "manualPaper.fill.netPnl"),
    realisedPnl: number(input.realisedPnl, "manualPaper.fill.realisedPnl"),
    resultingBalance: number(input.resultingBalance, "manualPaper.fill.resultingBalance", 0),
  });
}

function fundingPayment(value:unknown,index:number):ManualFundingPayment{const input=object(value,`manualPaper.fundingPayments.${index}`);return Object.freeze({paymentId:string(input.paymentId,"manualPaper.fundingPayment.paymentId",300),tradeId:string(input.tradeId,"manualPaper.fundingPayment.tradeId",300),userId:string(input.userId,"manualPaper.fundingPayment.userId",120),symbol:symbol(input.symbol,"manualPaper.fundingPayment.symbol"),side:oneOf(input.side,"manualPaper.fundingPayment.side",["long","short"] as const),settleTime:number(input.settleTime,"manualPaper.fundingPayment.settleTime",1),observedAt:number(input.observedAt,"manualPaper.fundingPayment.observedAt",1),price:number(input.price,"manualPaper.fundingPayment.price",0.000000000001),priceSource:oneOf(input.priceSource,"manualPaper.fundingPayment.priceSource",["fair","last"] as const),quantity:number(input.quantity,"manualPaper.fundingPayment.quantity",0.000000000001),notional:number(input.notional,"manualPaper.fundingPayment.notional",0),fundingRate:number(input.fundingRate,"manualPaper.fundingPayment.fundingRate",-1,1),calculatedCashDelta:number(input.calculatedCashDelta,"manualPaper.fundingPayment.calculatedCashDelta"),cashDelta:number(input.cashDelta,"manualPaper.fundingPayment.cashDelta"),balanceCapped:boolean(input.balanceCapped,"manualPaper.fundingPayment.balanceCapped"),source:oneOf(input.source,"manualPaper.fundingPayment.source",["mexc-public-funding-history"] as const),calculationMethod:oneOf(input.calculationMethod,"manualPaper.fundingPayment.calculationMethod",["observed-risk-price-notional"] as const),resultingBalance:number(input.resultingBalance,"manualPaper.fundingPayment.resultingBalance",0)})}

export function validateManualPaperBackup(value: unknown, ownerId: string): ManualAccount {
  const input = object(value, "manualPaper");
  if (input.version !== 3) throw new Error("Unsupported Manual Paper backup version.");
  const positionsInput = object(input.positions, "manualPaper.positions");
  const positionEntries = Object.entries(positionsInput);
  if (positionEntries.length > 100) throw new Error("Manual Paper position count is excessive.");
  const positions = Object.fromEntries(
    positionEntries.map(([key, item]) => [key, position(item, key)]),
  );
  if (!Array.isArray(input.fills) || input.fills.length > 500) {
    throw new Error("Manual Paper fill history is invalid.");
  }
  const fills = input.fills.map(fill);
  const fundingInput=input.fundingPayments??[];
  if(!Array.isArray(fundingInput)||fundingInput.length>1_000)throw new Error("Manual Paper funding history is invalid.");
  const fundingPayments=fundingInput.map(fundingPayment);
  if(fundingPayments.some(item=>item.userId!==ownerId))throw new Error("Manual Paper funding owner mismatch.");
  if (fills.some((item) => item.userId !== ownerId)) {
    throw new Error("Manual Paper fill owner mismatch.");
  }
  if (
    !Array.isArray(input.idempotencyKeys) ||
    input.idempotencyKeys.length > 1_000
  ) {
    throw new Error("Manual Paper idempotency history is invalid.");
  }
  const idempotencyKeys = input.idempotencyKeys.map((item, index) =>
    string(item, `manualPaper.idempotencyKeys.${index}`, 120),
  );
  if (new Set(idempotencyKeys).size !== idempotencyKeys.length) {
    throw new Error("Manual Paper idempotency history contains duplicates.");
  }
  return Object.freeze({
    version: 3 as const,
    cashBalance: number(input.cashBalance, "manualPaper.cashBalance", 0),
    startingBalance: number(input.startingBalance, "manualPaper.startingBalance", 0),
    realisedPnl: number(input.realisedPnl, "manualPaper.realisedPnl"),
    fees: number(input.fees, "manualPaper.fees", 0),
    fundingPnl: input.fundingPnl==null?0:number(input.fundingPnl, "manualPaper.fundingPnl"),
    fundingPayments: Object.freeze(fundingPayments) as unknown as ManualFundingPayment[],
    positions: Object.freeze(positions),
    fills: Object.freeze(fills) as unknown as ManualFill[],
    idempotencyKeys: Object.freeze(idempotencyKeys) as unknown as string[],
    settings: settings(input.settings),
    updatedAt: iso(input.updatedAt, "manualPaper.updatedAt"),
  });
}

export function manualPaperIsEmpty(account: ManualAccount) {
  const baseline = newManualAccount();
  return (
    Object.keys(account.positions).length === 0 &&
    account.fills.length === 0 &&
    account.fundingPayments.length === 0 &&
    account.fundingPnl === 0 &&
    account.idempotencyKeys.length === 0 &&
    account.cashBalance === baseline.cashBalance &&
    account.startingBalance === baseline.startingBalance &&
    account.realisedPnl === 0 &&
    account.fees === 0 &&
    JSON.stringify(account.settings) === JSON.stringify(DEFAULT_MANUAL_SETTINGS)
  );
}

export async function writeManualPaperBackup(
  userId: string,
  account: ManualAccount,
) {
  const validated = validateManualPaperBackup(account, userId);
  const directory = join(root(), "manual-paper");
  await mkdir(directory, { recursive: true });
  const target = targetPath(userId);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, target);
}
