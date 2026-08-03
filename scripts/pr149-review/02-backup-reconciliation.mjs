import {readFile,writeFile} from "node:fs/promises";
const replaceOnce=(source,from,to,label)=>{const index=source.indexOf(from);if(index<0)throw new Error(`Missing ${label}`);if(source.indexOf(from,index+from.length)>=0)throw new Error(`Ambiguous ${label}`);return source.slice(0,index)+to+source.slice(index+from.length)};
const transform=(source,start,end,replacement,label)=>{const a=source.indexOf(start);if(a<0)throw new Error(`Missing ${label} start`);const b=source.indexOf(end,a+start.length);if(b<0)throw new Error(`Missing ${label} end`);return source.slice(0,a)+replacement+source.slice(b)};
let source=await readFile("app/lib/manual-paper-backup.ts","utf8");
source=replaceOnce(source,'} from "./manual-paper";','} from "./manual-paper";\nimport { buildPaperMarginAccountSnapshot, type PaperMarginPositionInput } from "./manual-paper-margin-model";',"backup margin model import");

const settlementParser=String.raw`function marginSettlementAudit(value:unknown,field:string,expectedMode?:unknown,expectedMargin?:unknown):ManualFill["marginSettlement"]{
 if(value==null)return undefined;
 const input=object(value,field),audit=Object.freeze({calculationMethod:oneOf(input.calculationMethod,field+".calculationMethod",["isolated-position-loss-cap-v1","cross-shared-pool-loss-cap-v1"] as const),marginMode:oneOf(input.marginMode,field+".marginMode",["isolated","cross"] as const),cashBefore:number(input.cashBefore,field+".cashBefore",0),requestedCashDelta:number(input.requestedCashDelta,field+".requestedCashDelta"),appliedCashDelta:number(input.appliedCashDelta,field+".appliedCashDelta"),protectedCollateral:number(input.protectedCollateral,field+".protectedCollateral",0),minimumCashBalance:number(input.minimumCashBalance,field+".minimumCashBalance",0),cashAfter:number(input.cashAfter,field+".cashAfter",0),capped:boolean(input.capped,field+".capped")}),tol=Math.max(1e-8,Math.abs(audit.cashBefore)*1e-9),expectedMethod=audit.marginMode==="isolated"?"isolated-position-loss-cap-v1":"cross-shared-pool-loss-cap-v1";
 if(expectedMode!==undefined&&audit.marginMode!==expectedMode)throw new Error(field+" margin mode does not reconcile.");
 if(audit.calculationMethod!==expectedMethod)throw new Error(field+" calculation method does not reconcile.");
 if(expectedMargin!=null&&audit.marginMode==="isolated"&&Math.abs(audit.protectedCollateral-Math.min(audit.cashBefore,number(expectedMargin,field+".expectedMargin",0)))>tol)throw new Error(field+" protected isolated collateral does not reconcile.");
 const expectedMinimum=audit.marginMode==="isolated"?Math.max(0,audit.cashBefore-audit.protectedCollateral):audit.protectedCollateral,expectedCashAfter=audit.requestedCashDelta>=0?audit.cashBefore+audit.requestedCashDelta:Math.max(expectedMinimum,audit.cashBefore+audit.requestedCashDelta),expectedApplied=expectedCashAfter-audit.cashBefore;
 if(Math.abs(audit.minimumCashBalance-expectedMinimum)>tol||Math.abs(audit.cashAfter-expectedCashAfter)>tol||Math.abs(audit.appliedCashDelta-expectedApplied)>tol||audit.protectedCollateral-audit.cashBefore>tol)throw new Error(field+" cash settlement does not reconcile.");
 const differs=Math.abs(audit.appliedCashDelta-audit.requestedCashDelta)>Math.max(1e-9,Math.abs(audit.requestedCashDelta)*1e-9);
 if(audit.capped!==differs)throw new Error(field+" capped state does not reconcile.");
 return audit
}`;
source=transform(source,"function marginSettlementAudit(","\nfunction riskExitTrigger",settlementParser,"margin settlement parser");
source=replaceOnce(source,'marginSettlement: marginSettlementAudit(input.marginSettlement, "manualPaper.fill.marginSettlement", input.marginMode),','marginSettlement: marginSettlementAudit(input.marginSettlement, "manualPaper.fill.marginSettlement", input.marginMode, input.marginUsed),',"fill settlement margin basis");

const fundingParser=String.raw`function fundingPayment(value:unknown,index:number):ManualFundingPayment{
 const input=object(value,"manualPaper.fundingPayments."+index),marginMode=input.marginMode==null?undefined:oneOf(input.marginMode,"manualPaper.fundingPayment.marginMode",["isolated","cross"] as const),settlementMethod=input.settlementMethod==null?undefined:oneOf(input.settlementMethod,"manualPaper.fundingPayment.settlementMethod",["single-asset-usdt-funding-settlement-v1"] as const),protectedIsolatedMargin=input.protectedIsolatedMargin==null?undefined:number(input.protectedIsolatedMargin,"manualPaper.fundingPayment.protectedIsolatedMargin",0),isolatedMarginDebit=input.isolatedMarginDebit==null?undefined:number(input.isolatedMarginDebit,"manualPaper.fundingPayment.isolatedMarginDebit",0);
 if(settlementMethod&&(!marginMode||protectedIsolatedMargin===undefined||isolatedMarginDebit===undefined))throw new Error("Manual Paper funding settlement evidence is incomplete.");
 if(isolatedMarginDebit!==undefined&&isolatedMarginDebit>0&&marginMode!=="isolated")throw new Error("Manual Paper funding isolated margin debit contradicts its mode.");
 if(protectedIsolatedMargin!==undefined&&isolatedMarginDebit!==undefined&&isolatedMarginDebit-protectedIsolatedMargin>1e-8)throw new Error("Manual Paper funding margin debit exceeds protected collateral.");
 return Object.freeze({paymentId:string(input.paymentId,"manualPaper.fundingPayment.paymentId",300),tradeId:string(input.tradeId,"manualPaper.fundingPayment.tradeId",300),userId:string(input.userId,"manualPaper.fundingPayment.userId",120),symbol:symbol(input.symbol,"manualPaper.fundingPayment.symbol"),side:oneOf(input.side,"manualPaper.fundingPayment.side",["long","short"] as const),settleTime:number(input.settleTime,"manualPaper.fundingPayment.settleTime",1),observedAt:number(input.observedAt,"manualPaper.fundingPayment.observedAt",1),price:number(input.price,"manualPaper.fundingPayment.price",0.000000000001),priceSource:oneOf(input.priceSource,"manualPaper.fundingPayment.priceSource",["fair","last"] as const),quantity:number(input.quantity,"manualPaper.fundingPayment.quantity",0.000000000001),notional:number(input.notional,"manualPaper.fundingPayment.notional",0),fundingRate:number(input.fundingRate,"manualPaper.fundingPayment.fundingRate",-1,1),calculatedCashDelta:number(input.calculatedCashDelta,"manualPaper.fundingPayment.calculatedCashDelta"),cashDelta:number(input.cashDelta,"manualPaper.fundingPayment.cashDelta"),balanceCapped:boolean(input.balanceCapped,"manualPaper.fundingPayment.balanceCapped"),source:oneOf(input.source,"manualPaper.fundingPayment.source",["mexc-public-funding-history"] as const),calculationMethod:oneOf(input.calculationMethod,"manualPaper.fundingPayment.calculationMethod",["observed-risk-price-notional"] as const),marginMode,protectedIsolatedMargin,isolatedMarginDebit,settlementMethod,resultingBalance:number(input.resultingBalance,"manualPaper.fundingPayment.resultingBalance",0)})
}`;
source=transform(source,"function fundingPayment(","\n\nexport function validateManualPaperBackup",fundingParser,"funding payment parser");

const validationFunction=String.raw`export function validateManualPaperBackup(value: unknown, ownerId: string): ManualAccount {
  const input = object(value, "manualPaper");
  if (input.version !== 3) throw new Error("Unsupported Manual Paper backup version.");
  const positionsInput = object(input.positions, "manualPaper.positions");
  const positionEntries = Object.entries(positionsInput);
  if (positionEntries.length > 100) throw new Error("Manual Paper position count is excessive.");
  const positions = Object.fromEntries(positionEntries.map(([key, item]) => [key, position(item, key)]));
  if (!Array.isArray(input.fills) || input.fills.length > 500) throw new Error("Manual Paper fill history is invalid.");
  const fills = input.fills.map(fill);
  const fundingInput=input.fundingPayments??[];
  if(!Array.isArray(fundingInput)||fundingInput.length>1_000)throw new Error("Manual Paper funding history is invalid.");
  const fundingPayments=fundingInput.map(fundingPayment);
  if(fundingPayments.some(item=>item.userId!==ownerId))throw new Error("Manual Paper funding owner mismatch.");
  if (fills.some((item) => item.userId !== ownerId)) throw new Error("Manual Paper fill owner mismatch.");
  if (!Array.isArray(input.idempotencyKeys) || input.idempotencyKeys.length > 1_000) throw new Error("Manual Paper idempotency history is invalid.");
  const idempotencyKeys = input.idempotencyKeys.map((item, index) => string(item, "manualPaper.idempotencyKeys."+index, 120));
  if (new Set(idempotencyKeys).size !== idempotencyKeys.length) throw new Error("Manual Paper idempotency history contains duplicates.");
  const cashBalance=number(input.cashBalance,"manualPaper.cashBalance",0),parsedSettings=settings(input.settings),storedMarginSnapshot=marginAccountSnapshot(input.marginSnapshot,"manualPaper.marginSnapshot"),activePositions=Object.values(positions);
  if(storedMarginSnapshot){
    const marginInputs:PaperMarginPositionInput[]=activePositions.map(item=>({symbol:item.symbol,side:item.side,quantity:item.quantity,entryPrice:item.entryPrice,markPrice:item.lastRiskPrice>0?item.lastRiskPrice:item.entryPrice,margin:item.margin,marginMode:item.marginMode,maintenanceMarginRate:item.riskTier?.maintenanceMarginRate??parsedSettings.maintenanceMarginPct/100,liquidationPenaltyRate:parsedSettings.liquidationPenaltyPct/100})),expected=buildPaperMarginAccountSnapshot(cashBalance,marginInputs,storedMarginSnapshot.capturedAt),snapshotFields=["cashBalance","isolatedReservedMargin","crossInitialMargin","crossPoolCash","crossUnrealisedPnl","crossEquity","crossAvailableEquity","crossMaintenanceRequirement","crossLiquidationReserve","crossPositionCount"] as const;
    for(const field of snapshotFields){const actual=storedMarginSnapshot[field],wanted=expected[field],tol=Math.max(1e-8,Math.abs(Number(wanted))*1e-9);if(Math.abs(Number(actual)-Number(wanted))>tol)throw new Error("manualPaper.marginSnapshot "+field+" does not reconcile with active positions.")}
    for(const item of activePositions){
      const audit=item.marginAudit;
      if(!audit)throw new Error("Active Manual Paper position is missing margin audit evidence.");
      for(const field of snapshotFields){const actual=audit.account[field],wanted=storedMarginSnapshot[field],tol=Math.max(1e-8,Math.abs(Number(wanted))*1e-9);if(Math.abs(Number(actual)-Number(wanted))>tol)throw new Error("Manual Paper position margin audit account snapshot does not reconcile.")}
      const mark=item.lastRiskPrice>0?item.lastRiskPrice:item.entryPrice,direction=item.side==="long"?1:-1,positionUnrealised=(mark-item.entryPrice)*item.quantity*direction,mmr=item.riskTier?.maintenanceMarginRate??parsedSettings.maintenanceMarginPct/100,maintenance=mark*item.quantity*mmr,reserve=mark*item.quantity*parsedSettings.liquidationPenaltyPct/100,tol=Math.max(1e-8,Math.abs(item.margin)*1e-9);
      if(Math.abs(audit.assignedMargin-item.margin)>tol||Math.abs(audit.positionUnrealisedPnl-positionUnrealised)>Math.max(tol,Math.abs(positionUnrealised)*1e-9)||Math.abs(audit.positionMaintenanceRequirement-maintenance)>Math.max(tol,maintenance*1e-9)||Math.abs(audit.positionLiquidationReserve-reserve)>Math.max(tol,reserve*1e-9))throw new Error("Manual Paper position margin audit does not reconcile with its position.");
      if(item.marginMode==="cross"){
        const otherPnl=storedMarginSnapshot.crossUnrealisedPnl-positionUnrealised,otherMaintenance=Math.max(0,storedMarginSnapshot.crossMaintenanceRequirement-maintenance),otherReserve=Math.max(0,storedMarginSnapshot.crossLiquidationReserve-reserve),collateral=storedMarginSnapshot.crossPoolCash+otherPnl-otherMaintenance-otherReserve;
        if(Math.abs(audit.otherCrossUnrealisedPnl-otherPnl)>Math.max(tol,Math.abs(otherPnl)*1e-9)||Math.abs(audit.otherCrossMaintenanceRequirement-otherMaintenance)>Math.max(tol,otherMaintenance*1e-9)||Math.abs(audit.otherCrossLiquidationReserve-otherReserve)>Math.max(tol,otherReserve*1e-9)||Math.abs(audit.collateralAvailableToPosition-collateral)>Math.max(tol,Math.abs(collateral)*1e-9))throw new Error("Manual Paper cross position support does not reconcile with the shared pool.");
      }
      if(item.liquidationAudit){const expectedCollateral=item.marginMode==="isolated"?item.margin:Math.max(1e-9,audit.collateralAvailableToPosition);if(Math.abs(item.liquidationAudit.collateral-expectedCollateral)>Math.max(tol,Math.abs(expectedCollateral)*1e-9))throw new Error("Manual Paper liquidation collateral does not reconcile with margin support.")}
    }
  }else if(activePositions.some(item=>item.marginAudit))throw new Error("Manual Paper margin audit evidence requires an account snapshot.");
  return Object.freeze({
    version: 3 as const,
    cashBalance,
    startingBalance: number(input.startingBalance, "manualPaper.startingBalance", 0),
    realisedPnl: number(input.realisedPnl, "manualPaper.realisedPnl"),
    fees: number(input.fees, "manualPaper.fees", 0),
    fundingPnl: input.fundingPnl==null?0:number(input.fundingPnl, "manualPaper.fundingPnl"),
    fundingPayments: Object.freeze(fundingPayments) as unknown as ManualFundingPayment[],
    positions: Object.freeze(positions),
    fills: Object.freeze(fills) as unknown as ManualFill[],
    idempotencyKeys: Object.freeze(idempotencyKeys) as unknown as string[],
    settings: parsedSettings,
    marginSnapshot: storedMarginSnapshot,
    updatedAt: iso(input.updatedAt, "manualPaper.updatedAt"),
  });
}`;
source=transform(source,"export function validateManualPaperBackup(","\n\nexport function manualPaperIsEmpty",validationFunction,"backup account reconciliation");
await writeFile("app/lib/manual-paper-backup.ts",source,"utf8");
