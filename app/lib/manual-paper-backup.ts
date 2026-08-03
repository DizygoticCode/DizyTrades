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

function depthEvidence(value:unknown,field:string,expectedContext:"entry"|"exit"):ManualPosition["entryDepthFill"]{
  if(value==null)return undefined;
  const input=object(value,field),executionContext=input.executionContext==null?"entry":oneOf(input.executionContext,field+".executionContext",["entry","exit"] as const),evidence=Object.freeze({
    source:oneOf(input.source,field+".source",["dizyflow-public-depth"] as const),
    calculationMethod:oneOf(input.calculationMethod,field+".calculationMethod",["visible-book-walk"] as const),
    executionContext,
    bookSide:oneOf(input.bookSide,field+".bookSide",["bid","ask"] as const),
    fillStatus:oneOf(input.fillStatus,field+".fillStatus",["full","partial"] as const),
    requestedContractVolume:number(input.requestedContractVolume,field+".requestedContractVolume",0.000000000001),
    filledContractVolume:number(input.filledContractVolume,field+".filledContractVolume",0.000000000001),
    unfilledContractVolume:number(input.unfilledContractVolume,field+".unfilledContractVolume",0),
    availableContractVolume:number(input.availableContractVolume,field+".availableContractVolume",0),
    priorConsumedContractVolume:input.priorConsumedContractVolume==null?undefined:number(input.priorConsumedContractVolume,field+".priorConsumedContractVolume",0),
    openPositionContractVolume:input.openPositionContractVolume==null?undefined:number(input.openPositionContractVolume,field+".openPositionContractVolume",0.000000000001),
    remainingPositionContractVolume:input.remainingPositionContractVolume==null?undefined:number(input.remainingPositionContractVolume,field+".remainingPositionContractVolume",0),
    quantity:number(input.quantity,field+".quantity",0.000000000001),
    notional:number(input.notional,field+".notional",0.000000000001),
    rawWeightedAveragePrice:number(input.rawWeightedAveragePrice,field+".rawWeightedAveragePrice",0.000000000001),
    executionPrice:number(input.executionPrice,field+".executionPrice",0.000000000001),
    bestPrice:number(input.bestPrice,field+".bestPrice",0.000000000001),
    worstPrice:number(input.worstPrice,field+".worstPrice",0.000000000001),
    levelsConsumed:number(input.levelsConsumed,field+".levelsConsumed",1,1_000),
    priceImpactBps:number(input.priceImpactBps,field+".priceImpactBps"),
    snapshotVersion:number(input.snapshotVersion,field+".snapshotVersion",0),
    snapshotReceivedAt:number(input.snapshotReceivedAt,field+".snapshotReceivedAt",1),
    snapshotAgeMs:number(input.snapshotAgeMs,field+".snapshotAgeMs",0),
    sourceMode:input.sourceMode==null?null:oneOf(input.sourceMode,field+".sourceMode",["FULL DEPTH WS","REST FALLBACK","RECONNECTING — LAST BOOK RETAINED","NO VALID BOOK"] as const),
  });
  const volumeTolerance=Math.max(1e-10,evidence.requestedContractVolume*1e-9),priceTolerance=Math.max(1e-10,evidence.executionPrice*1e-9),notionalTolerance=Math.max(1e-8,evidence.notional*1e-9),hasRemainder=evidence.unfilledContractVolume>volumeTolerance;
  if(evidence.executionContext!==expectedContext)throw new Error(field+" has the wrong execution context.");
  if(!Number.isInteger(evidence.levelsConsumed)||!Number.isInteger(evidence.snapshotVersion))throw new Error(field+" has invalid integer evidence.");
  if(evidence.sourceMode==="NO VALID BOOK")throw new Error(field+" cannot reference an invalid book.");
  if(evidence.filledContractVolume-evidence.requestedContractVolume>volumeTolerance||evidence.filledContractVolume-evidence.availableContractVolume>volumeTolerance)throw new Error(field+" has impossible filled volume.");
  if(evidence.priorConsumedContractVolume!==undefined&&evidence.priorConsumedContractVolume<0)throw new Error(field+" has invalid prior book consumption.");
  if(Math.abs(evidence.filledContractVolume+evidence.unfilledContractVolume-evidence.requestedContractVolume)>volumeTolerance)throw new Error(field+" volume totals do not reconcile.");
  if((evidence.fillStatus==="partial")!==hasRemainder)throw new Error(field+" fill status contradicts its remainder.");
  if(expectedContext==="entry"&&(evidence.openPositionContractVolume!==undefined||evidence.remainingPositionContractVolume!==undefined))throw new Error(field+" entry evidence contains exit state.");
  if(expectedContext==="exit"){
    if(evidence.openPositionContractVolume===undefined||evidence.remainingPositionContractVolume===undefined)throw new Error(field+" exit evidence is incomplete.");
    if(evidence.requestedContractVolume-evidence.openPositionContractVolume>volumeTolerance)throw new Error(field+" exit request exceeds its position.");
    if(Math.abs(evidence.filledContractVolume+evidence.remainingPositionContractVolume-evidence.openPositionContractVolume)>volumeTolerance)throw new Error(field+" position volume does not reconcile.");
  }
  if(Math.abs(evidence.quantity*evidence.executionPrice-evidence.notional)>notionalTolerance)throw new Error(field+" notional does not reconcile.");
  const lower=Math.min(evidence.bestPrice,evidence.worstPrice)-priceTolerance,upper=Math.max(evidence.bestPrice,evidence.worstPrice)+priceTolerance;
  if(evidence.rawWeightedAveragePrice<lower||evidence.rawWeightedAveragePrice>upper)throw new Error(field+" weighted price is outside consumed levels.");
  if(evidence.bookSide==="ask"&&(evidence.bestPrice-evidence.worstPrice>priceTolerance||evidence.rawWeightedAveragePrice-evidence.executionPrice>priceTolerance))throw new Error(field+" has invalid ask-side prices.");
  if(evidence.bookSide==="bid"&&(evidence.worstPrice-evidence.bestPrice>priceTolerance||evidence.executionPrice-evidence.rawWeightedAveragePrice>priceTolerance))throw new Error(field+" has invalid bid-side prices.");
  return evidence;
}

function marginAccountSnapshot(value:unknown,field:string):ManualAccount["marginSnapshot"]{if(value==null)return undefined;const input=object(value,field),snapshot=Object.freeze({calculationMethod:oneOf(input.calculationMethod,field+".calculationMethod",["single-asset-usdt-margin-pool-v1"] as const),settlementAsset:oneOf(input.settlementAsset,field+".settlementAsset",["USDT"] as const),cashBalance:number(input.cashBalance,field+".cashBalance",0),isolatedReservedMargin:number(input.isolatedReservedMargin,field+".isolatedReservedMargin",0),crossInitialMargin:number(input.crossInitialMargin,field+".crossInitialMargin",0),crossPoolCash:number(input.crossPoolCash,field+".crossPoolCash"),crossUnrealisedPnl:number(input.crossUnrealisedPnl,field+".crossUnrealisedPnl"),crossEquity:number(input.crossEquity,field+".crossEquity"),crossAvailableEquity:number(input.crossAvailableEquity,field+".crossAvailableEquity"),crossMaintenanceRequirement:number(input.crossMaintenanceRequirement,field+".crossMaintenanceRequirement",0),crossLiquidationReserve:number(input.crossLiquidationReserve,field+".crossLiquidationReserve",0),crossPositionCount:number(input.crossPositionCount,field+".crossPositionCount",0,100),capturedAt:number(input.capturedAt,field+".capturedAt",0)}),tol=Math.max(1e-8,Math.abs(snapshot.cashBalance)*1e-9);if(!Number.isInteger(snapshot.crossPositionCount))throw new Error(field+" cross position count is invalid.");if(Math.abs(snapshot.crossPoolCash-(snapshot.cashBalance-snapshot.isolatedReservedMargin))>tol)throw new Error(field+" cross pool cash does not reconcile.");if(Math.abs(snapshot.crossEquity-(snapshot.crossPoolCash+snapshot.crossUnrealisedPnl))>tol)throw new Error(field+" cross equity does not reconcile.");if(Math.abs(snapshot.crossAvailableEquity-(snapshot.crossEquity-snapshot.crossInitialMargin))>tol)throw new Error(field+" cross available equity does not reconcile.");return snapshot}
function positionMarginAudit(value:unknown,field:string,expectedMode?:unknown,expectedMargin?:number):ManualPosition["marginAudit"]{if(value==null)return undefined;const input=object(value,field),account=marginAccountSnapshot(input.account,field+".account");if(!account)throw new Error(field+" account snapshot is missing.");const audit=Object.freeze({calculationMethod:oneOf(input.calculationMethod,field+".calculationMethod",["isolated-position-collateral-v1","cross-shared-usdt-pool-v1"] as const),marginMode:oneOf(input.marginMode,field+".marginMode",["isolated","cross"] as const),settlementAsset:oneOf(input.settlementAsset,field+".settlementAsset",["USDT"] as const),assignedMargin:number(input.assignedMargin,field+".assignedMargin",0),collateralAvailableToPosition:number(input.collateralAvailableToPosition,field+".collateralAvailableToPosition"),positionUnrealisedPnl:number(input.positionUnrealisedPnl,field+".positionUnrealisedPnl"),positionMaintenanceRequirement:number(input.positionMaintenanceRequirement,field+".positionMaintenanceRequirement",0),positionLiquidationReserve:number(input.positionLiquidationReserve,field+".positionLiquidationReserve",0),otherCrossUnrealisedPnl:number(input.otherCrossUnrealisedPnl,field+".otherCrossUnrealisedPnl"),otherCrossMaintenanceRequirement:number(input.otherCrossMaintenanceRequirement,field+".otherCrossMaintenanceRequirement",0),otherCrossLiquidationReserve:number(input.otherCrossLiquidationReserve,field+".otherCrossLiquidationReserve",0),supportingCrossPositionCount:number(input.supportingCrossPositionCount,field+".supportingCrossPositionCount",1,100),account}),tol=Math.max(1e-8,Math.abs(audit.assignedMargin)*1e-9);if(expectedMode!==undefined&&audit.marginMode!==expectedMode)throw new Error(field+" margin mode does not reconcile.");if(expectedMargin!==undefined&&Math.abs(audit.assignedMargin-expectedMargin)>tol)throw new Error(field+" assigned margin does not reconcile.");if(audit.marginMode==="isolated"){if(audit.calculationMethod!=="isolated-position-collateral-v1"||Math.abs(audit.collateralAvailableToPosition-audit.assignedMargin)>tol||audit.supportingCrossPositionCount!==1||Math.abs(audit.otherCrossUnrealisedPnl)+audit.otherCrossMaintenanceRequirement+audit.otherCrossLiquidationReserve>tol)throw new Error(field+" isolated collateral does not reconcile.")}else{const expected=account.crossPoolCash+audit.otherCrossUnrealisedPnl-audit.otherCrossMaintenanceRequirement-audit.otherCrossLiquidationReserve;if(audit.calculationMethod!=="cross-shared-usdt-pool-v1"||Math.abs(audit.collateralAvailableToPosition-expected)>Math.max(tol,Math.abs(expected)*1e-9)||audit.supportingCrossPositionCount!==account.crossPositionCount)throw new Error(field+" cross collateral does not reconcile.")}return audit}
function marginSettlementAudit(value:unknown,field:string,expectedMode?:unknown):ManualFill["marginSettlement"]{if(value==null)return undefined;const input=object(value,field),audit=Object.freeze({calculationMethod:oneOf(input.calculationMethod,field+".calculationMethod",["isolated-position-loss-cap-v1","cross-shared-pool-loss-cap-v1"] as const),marginMode:oneOf(input.marginMode,field+".marginMode",["isolated","cross"] as const),cashBefore:number(input.cashBefore,field+".cashBefore",0),requestedCashDelta:number(input.requestedCashDelta,field+".requestedCashDelta"),appliedCashDelta:number(input.appliedCashDelta,field+".appliedCashDelta"),protectedCollateral:number(input.protectedCollateral,field+".protectedCollateral",0),minimumCashBalance:number(input.minimumCashBalance,field+".minimumCashBalance",0),cashAfter:number(input.cashAfter,field+".cashAfter",0),capped:boolean(input.capped,field+".capped")}),tol=Math.max(1e-8,Math.abs(audit.cashBefore)*1e-9),expectedMethod=audit.marginMode==="isolated"?"isolated-position-loss-cap-v1":"cross-shared-pool-loss-cap-v1";if(expectedMode!==undefined&&audit.marginMode!==expectedMode)throw new Error(field+" margin mode does not reconcile.");if(audit.calculationMethod!==expectedMethod||Math.abs(audit.cashAfter-audit.cashBefore-audit.appliedCashDelta)>tol||audit.cashAfter+tol<audit.minimumCashBalance||audit.protectedCollateral-audit.cashBefore>tol)throw new Error(field+" cash settlement does not reconcile.");const differs=Math.abs(audit.appliedCashDelta-audit.requestedCashDelta)>Math.max(1e-9,Math.abs(audit.requestedCashDelta)*1e-9);if(audit.capped!==differs)throw new Error(field+" capped state does not reconcile.");return audit}
function riskExitTrigger(value:unknown,field:string):ManualPosition["pendingRiskExit"]{if(value==null)return undefined;const input=object(value,field);return Object.freeze({reason:oneOf(input.reason,field+".reason",["stop","target","liquidation"] as const),triggeredAt:iso(input.triggeredAt,field+".triggeredAt"),triggerPrice:number(input.triggerPrice,field+".triggerPrice",0.000000000001),priceSource:oneOf(input.priceSource,field+".priceSource",["fair","last"] as const)})}
function reduceOnlyEvidence(value:unknown,field:string,fillTradeId:unknown,fillSide:unknown,fillQuantity:unknown):ManualFill["reduceOnly"]{if(value==null)return undefined;const input=object(value,field),enabled=boolean(input.enabled,field+".enabled");if(enabled!==true)throw new Error(field+" must be enabled.");const evidence=Object.freeze({enabled:true as const,calculationMethod:oneOf(input.calculationMethod,field+".calculationMethod",["position-bound-cap"] as const),source:oneOf(input.source,field+".source",["manual-close","partial-close","reverse","flatten-all","risk-exit","opposite-order-replacement"] as const),expectedTradeId:string(input.expectedTradeId,field+".expectedTradeId",300),expectedSide:oneOf(input.expectedSide,field+".expectedSide",["long","short"] as const),positionQuantityBefore:number(input.positionQuantityBefore,field+".positionQuantityBefore",0.000000000001),requestedQuantity:number(input.requestedQuantity,field+".requestedQuantity",0.000000000001),acceptedQuantity:number(input.acceptedQuantity,field+".acceptedQuantity",0.000000000001),capped:boolean(input.capped,field+".capped"),filledQuantity:number(input.filledQuantity,field+".filledQuantity",0.000000000001),remainingQuantity:number(input.remainingQuantity,field+".remainingQuantity",0),result:oneOf(input.result,field+".result",["closed","reduced"] as const)}),tolerance=Math.max(1e-10,evidence.positionQuantityBefore*1e-9),tradeId=string(fillTradeId,field+".fillTradeId",300),quantity=number(fillQuantity,field+".fillQuantity",0.000000000001);if(fillSide!=="close")throw new Error(field+" is not attached to a close fill.");if(evidence.expectedTradeId!==tradeId)throw new Error(field+" targets a different trade.");if(evidence.acceptedQuantity-evidence.requestedQuantity>tolerance||evidence.acceptedQuantity-evidence.positionQuantityBefore>tolerance)throw new Error(field+" accepts too much quantity.");if(evidence.filledQuantity-evidence.acceptedQuantity>tolerance||Math.abs(evidence.filledQuantity-quantity)>tolerance)throw new Error(field+" filled quantity does not reconcile.");if(Math.abs(evidence.filledQuantity+evidence.remainingQuantity-evidence.positionQuantityBefore)>tolerance)throw new Error(field+" position quantity does not reconcile.");if(evidence.capped!==(evidence.requestedQuantity-evidence.acceptedQuantity>tolerance))throw new Error(field+" capped state contradicts its quantities.");if((evidence.result==="closed")!==(evidence.remainingQuantity<=tolerance))throw new Error(field+" result contradicts its remainder.");return evidence}
function riskTierSnapshot(value:unknown,field:string):ManualPosition["riskTier"]{if(value==null)return undefined;const input=object(value,field),snapshot=Object.freeze({symbol:symbol(input.symbol,field+".symbol"),source:oneOf(input.source,field+".source",["mexc-public-contract-derived","mexc-public-contract-flat-fallback","legacy-flat-assumption"] as const),calculationMethod:oneOf(input.calculationMethod,field+".calculationMethod",["contract-tier-increments","flat-contract-fallback","legacy-flat-assumption"] as const),riskLimitType:oneOf(input.riskLimitType,field+".riskLimitType",["BY_VOLUME","BY_VALUE","UNKNOWN"] as const),level:number(input.level,field+".level",1,1000),exposure:number(input.exposure,field+".exposure",0.000000000001),maxExposure:input.maxExposure==null?null:number(input.maxExposure,field+".maxExposure",0.000000000001),maintenanceMarginRate:number(input.maintenanceMarginRate,field+".maintenanceMarginRate",0,0.999999999),initialMarginRate:number(input.initialMarginRate,field+".initialMarginRate",0,0.999999999),maxLeverage:number(input.maxLeverage,field+".maxLeverage",1,1000),contractMaxLeverage:number(input.contractMaxLeverage,field+".contractMaxLeverage",1,1000),baseExposure:input.baseExposure==null?null:number(input.baseExposure,field+".baseExposure",0.000000000001),exposureIncrement:input.exposureIncrement==null?null:number(input.exposureIncrement,field+".exposureIncrement",0.000000000001),maintenanceIncrement:number(input.maintenanceIncrement,field+".maintenanceIncrement",0,0.999999999),initialIncrement:number(input.initialIncrement,field+".initialIncrement",0,0.999999999),levelLimit:number(input.levelLimit,field+".levelLimit",1,1000),capturedAt:number(input.capturedAt,field+".capturedAt",1)}),tol=Math.max(1e-9,snapshot.exposure*1e-9);if(snapshot.level>snapshot.levelLimit)throw new Error(field+" level exceeds its schedule.");if(snapshot.maxLeverage-snapshot.contractMaxLeverage>1e-10)throw new Error(field+" tier leverage exceeds the contract maximum.");if(snapshot.maxExposure!==null&&snapshot.exposure-snapshot.maxExposure>tol)throw new Error(field+" exposure exceeds its tier.");if(snapshot.calculationMethod==="contract-tier-increments"){if(snapshot.source!=="mexc-public-contract-derived"||snapshot.baseExposure===null||snapshot.exposureIncrement===null)throw new Error(field+" has incomplete derived provenance.");const expected=snapshot.baseExposure+snapshot.exposureIncrement*(snapshot.level-1);if(snapshot.maxExposure===null||Math.abs(snapshot.maxExposure-expected)>Math.max(1e-9,expected*1e-9))throw new Error(field+" tier boundary does not reconcile.")}return snapshot}
function liquidationAuditEvidence(value:unknown,field:string,estimated:unknown,bankruptcy:unknown):ManualPosition["liquidationAudit"]{if(value==null)return undefined;const input=object(value,field),audit=Object.freeze({calculationMethod:oneOf(input.calculationMethod,field+".calculationMethod",["linear-usdt-mark-notional-v2"] as const),bankruptcyCalculationMethod:oneOf(input.bankruptcyCalculationMethod,field+".bankruptcyCalculationMethod",["linear-usdt-zero-equity-v1"] as const),collateralBasis:oneOf(input.collateralBasis,field+".collateralBasis",["assigned-margin","cross-shared-usdt-pool"] as const),positionQuantity:number(input.positionQuantity,field+".positionQuantity",0.000000000001),collateral:number(input.collateral,field+".collateral",0.000000000001),usableCollateral:number(input.usableCollateral,field+".usableCollateral",0),entryFee:number(input.entryFee,field+".entryFee",0),maintenanceMarginRate:number(input.maintenanceMarginRate,field+".maintenanceMarginRate",0,0.999999999),liquidationPenaltyRate:number(input.liquidationPenaltyRate,field+".liquidationPenaltyRate",0,0.999999999),maintenanceMarginAtLiquidation:number(input.maintenanceMarginAtLiquidation,field+".maintenanceMarginAtLiquidation",0),liquidationPenaltyReserve:number(input.liquidationPenaltyReserve,field+".liquidationPenaltyReserve",0),estimatedLiquidation:number(input.estimatedLiquidation,field+".estimatedLiquidation",0),bankruptcyPrice:number(input.bankruptcyPrice,field+".bankruptcyPrice",0),liquidationToBankruptcyDistance:number(input.liquidationToBankruptcyDistance,field+".liquidationToBankruptcyDistance",0)}),storedEstimated=number(estimated,field+".storedEstimated",0),storedBankruptcy=number(bankruptcy,field+".storedBankruptcy",0),tol=Math.max(1e-8,Math.abs(storedEstimated)*1e-9);if(Math.abs(audit.estimatedLiquidation-storedEstimated)>tol||Math.abs(audit.bankruptcyPrice-storedBankruptcy)>Math.max(1e-8,Math.abs(storedBankruptcy)*1e-9))throw new Error(field+" stored prices do not reconcile.");if(Math.abs(audit.collateral-audit.entryFee-audit.usableCollateral)>Math.max(1e-8,audit.collateral*1e-9))throw new Error(field+" collateral does not reconcile.");if(Math.abs(audit.maintenanceMarginAtLiquidation-audit.estimatedLiquidation*audit.positionQuantity*audit.maintenanceMarginRate)>Math.max(1e-8,audit.maintenanceMarginAtLiquidation*1e-9))throw new Error(field+" maintenance margin does not reconcile.");if(Math.abs(audit.liquidationPenaltyReserve-audit.estimatedLiquidation*audit.positionQuantity*audit.liquidationPenaltyRate)>Math.max(1e-8,audit.liquidationPenaltyReserve*1e-9)||Math.abs(audit.liquidationToBankruptcyDistance-Math.abs(audit.estimatedLiquidation-audit.bankruptcyPrice))>tol)throw new Error(field+" liquidation buffer does not reconcile.");return audit}


function position(value: unknown, key: string): ManualPosition {
  const input = object(value, `manualPaper.positions.${key}`);
  const marketSymbol = symbol(input.symbol, `manualPaper.positions.${key}.symbol`);
  if (marketSymbol !== key) throw new Error("Manual Paper position key mismatch.");
  const entryPrice = number(input.entryPrice, "manualPaper.position.entryPrice", 0.000000000001);
  const quantity = number(input.quantity, "manualPaper.position.quantity", 0.000000000001);
  const leverage = number(input.leverage, "manualPaper.position.leverage", 1, 1_000);
  const margin = number(input.margin, "manualPaper.position.margin", 0);
  const marginMode = oneOf(input.marginMode, "manualPaper.position.marginMode", ["isolated", "cross"] as const);
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
    entryDepthFill: depthEvidence(input.entryDepthFill,"manualPaper.position.entryDepthFill","entry"),
    entryPrice,
    leverage,
    margin,
    marginMode,
    stopLoss: nullableNumber(input.stopLoss, "manualPaper.position.stopLoss", 0),
    takeProfit: nullableNumber(input.takeProfit, "manualPaper.position.takeProfit", 0),
    estimatedLiquidation: number(
      input.estimatedLiquidation,
      "manualPaper.position.estimatedLiquidation",
      0,
    ),
    bankruptcyPrice: input.bankruptcyPrice == null ? undefined : number(input.bankruptcyPrice, "manualPaper.position.bankruptcyPrice", 0),
    riskTier: riskTierSnapshot(input.riskTier, "manualPaper.position.riskTier"),
    liquidationAudit: liquidationAuditEvidence(input.liquidationAudit, "manualPaper.position.liquidationAudit", input.estimatedLiquidation, input.bankruptcyPrice),
    marginAudit: positionMarginAudit(input.marginAudit, "manualPaper.position.marginAudit", marginMode, margin),
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
    pendingRiskExit: riskExitTrigger(input.pendingRiskExit, "manualPaper.position.pendingRiskExit"),
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
    entryDepthFill: depthEvidence(input.entryDepthFill,"manualPaper.fill.entryDepthFill","entry"),
    exitDepthFill: depthEvidence(input.exitDepthFill,"manualPaper.fill.exitDepthFill","exit"),
    reduceOnly: reduceOnlyEvidence(input.reduceOnly,"manualPaper.fill.reduceOnly",input.tradeId,input.side,input.quantity),
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
    bankruptcyPrice: input.bankruptcyPrice == null ? undefined : number(input.bankruptcyPrice, "manualPaper.fill.bankruptcyPrice", 0),
    riskTier: riskTierSnapshot(input.riskTier, "manualPaper.fill.riskTier"),
    liquidationAudit: input.liquidationAudit == null ? undefined : liquidationAuditEvidence(input.liquidationAudit, "manualPaper.fill.liquidationAudit", input.estimatedLiquidation, input.bankruptcyPrice),
    marginAudit: positionMarginAudit(input.marginAudit, "manualPaper.fill.marginAudit", input.marginMode),
    marginSettlement: marginSettlementAudit(input.marginSettlement, "manualPaper.fill.marginSettlement", input.marginMode),
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
    riskExitTrigger: riskExitTrigger(input.riskExitTrigger, "manualPaper.fill.riskExitTrigger"),
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
    marginSnapshot: marginAccountSnapshot(input.marginSnapshot, "manualPaper.marginSnapshot"),
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
