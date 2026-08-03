import type {MarginMode,PaperSide} from "./manual-paper-engine";

export type PaperMarginPositionInput=Readonly<{
 symbol:string;
 side:PaperSide;
 quantity:number;
 entryPrice:number;
 markPrice:number;
 margin:number;
 marginMode:MarginMode;
 maintenanceMarginRate:number;
 liquidationPenaltyRate:number;
}>;

export type PaperMarginAccountSnapshot=Readonly<{
 calculationMethod:"single-asset-usdt-margin-pool-v1";
 settlementAsset:"USDT";
 cashBalance:number;
 isolatedReservedMargin:number;
 crossInitialMargin:number;
 crossPoolCash:number;
 crossUnrealisedPnl:number;
 crossEquity:number;
 crossAvailableEquity:number;
 crossMaintenanceRequirement:number;
 crossLiquidationReserve:number;
 crossPositionCount:number;
 capturedAt:number;
}>;

export type PaperPositionMarginAudit=Readonly<{
 calculationMethod:"isolated-position-collateral-v1"|"cross-shared-usdt-pool-v1";
 marginMode:MarginMode;
 settlementAsset:"USDT";
 assignedMargin:number;
 collateralAvailableToPosition:number;
 positionUnrealisedPnl:number;
 positionMaintenanceRequirement:number;
 positionLiquidationReserve:number;
 otherCrossUnrealisedPnl:number;
 otherCrossMaintenanceRequirement:number;
 otherCrossLiquidationReserve:number;
 supportingCrossPositionCount:number;
 account:PaperMarginAccountSnapshot;
}>;

export type PaperMarginSettlementAudit=Readonly<{
 calculationMethod:"isolated-position-loss-cap-v1"|"cross-shared-pool-loss-cap-v1";
 marginMode:MarginMode;
 cashBefore:number;
 requestedCashDelta:number;
 appliedCashDelta:number;
 protectedCollateral:number;
 minimumCashBalance:number;
 cashAfter:number;
 capped:boolean;
}>;

const finite=(value:number)=>Number.isFinite(value);
const positive=(value:number)=>finite(value)&&value>0;
const nonNegative=(value:number)=>finite(value)&&value>=0;
const tolerance=(value:number)=>Math.max(1e-9,Math.abs(value)*1e-10);

export function paperMarginPositionPnl(position:PaperMarginPositionInput){
 if(!positive(position.quantity)||!positive(position.entryPrice)||!positive(position.markPrice))throw new Error("INVALID_MARGIN_POSITION");
 return (position.markPrice-position.entryPrice)*position.quantity*(position.side==="long"?1:-1);
}

export function buildPaperMarginAccountSnapshot(cashBalance:number,positions:readonly PaperMarginPositionInput[],capturedAt=Date.now()):PaperMarginAccountSnapshot{
 if(!nonNegative(cashBalance)||!Number.isInteger(Math.trunc(capturedAt))||capturedAt<0)throw new Error("INVALID_MARGIN_ACCOUNT");
 let isolatedReservedMargin=0,crossInitialMargin=0,crossUnrealisedPnl=0,crossMaintenanceRequirement=0,crossLiquidationReserve=0,crossPositionCount=0;
 for(const position of positions){
  if(!nonNegative(position.margin)||!nonNegative(position.maintenanceMarginRate)||position.maintenanceMarginRate>=1||!nonNegative(position.liquidationPenaltyRate)||position.liquidationPenaltyRate>=1)throw new Error("INVALID_MARGIN_POSITION");
  if(position.marginMode==="isolated")isolatedReservedMargin+=position.margin;
  else{
   crossPositionCount+=1;
   crossInitialMargin+=position.margin;
   crossUnrealisedPnl+=paperMarginPositionPnl(position);
   crossMaintenanceRequirement+=position.markPrice*position.quantity*position.maintenanceMarginRate;
   crossLiquidationReserve+=position.markPrice*position.quantity*position.liquidationPenaltyRate;
  }
 }
 const crossPoolCash=cashBalance-isolatedReservedMargin,crossEquity=crossPoolCash+crossUnrealisedPnl,crossAvailableEquity=crossEquity-crossInitialMargin;
 return Object.freeze({calculationMethod:"single-asset-usdt-margin-pool-v1",settlementAsset:"USDT",cashBalance,isolatedReservedMargin,crossInitialMargin,crossPoolCash,crossUnrealisedPnl,crossEquity,crossAvailableEquity,crossMaintenanceRequirement,crossLiquidationReserve,crossPositionCount,capturedAt});
}

export function buildPaperPositionMarginAudit(position:PaperMarginPositionInput,account:PaperMarginAccountSnapshot):PaperPositionMarginAudit{
 const positionUnrealisedPnl=paperMarginPositionPnl(position),positionMaintenanceRequirement=position.markPrice*position.quantity*position.maintenanceMarginRate,positionLiquidationReserve=position.markPrice*position.quantity*position.liquidationPenaltyRate;
 if(position.marginMode==="isolated")return Object.freeze({calculationMethod:"isolated-position-collateral-v1",marginMode:"isolated",settlementAsset:"USDT",assignedMargin:position.margin,collateralAvailableToPosition:position.margin,positionUnrealisedPnl,positionMaintenanceRequirement,positionLiquidationReserve,otherCrossUnrealisedPnl:0,otherCrossMaintenanceRequirement:0,otherCrossLiquidationReserve:0,supportingCrossPositionCount:1,account});
 const otherCrossUnrealisedPnl=account.crossUnrealisedPnl-positionUnrealisedPnl,otherCrossMaintenanceRequirement=Math.max(0,account.crossMaintenanceRequirement-positionMaintenanceRequirement),otherCrossLiquidationReserve=Math.max(0,account.crossLiquidationReserve-positionLiquidationReserve),collateralAvailableToPosition=account.crossPoolCash+otherCrossUnrealisedPnl-otherCrossMaintenanceRequirement-otherCrossLiquidationReserve;
 return Object.freeze({calculationMethod:"cross-shared-usdt-pool-v1",marginMode:"cross",settlementAsset:"USDT",assignedMargin:position.margin,collateralAvailableToPosition,positionUnrealisedPnl,positionMaintenanceRequirement,positionLiquidationReserve,otherCrossUnrealisedPnl,otherCrossMaintenanceRequirement,otherCrossLiquidationReserve,supportingCrossPositionCount:account.crossPositionCount,account});
}

export function settlePaperMarginCash(input:{cashBalance:number;marginMode:MarginMode;allocatedMargin:number;isolatedReservedMargin:number;requestedCashDelta:number}):PaperMarginSettlementAudit{
 if(!nonNegative(input.cashBalance)||!nonNegative(input.allocatedMargin)||!nonNegative(input.isolatedReservedMargin)||!finite(input.requestedCashDelta))throw new Error("INVALID_MARGIN_SETTLEMENT");
 const protectedCollateral=input.marginMode==="isolated"?Math.min(input.cashBalance,input.allocatedMargin):Math.min(input.cashBalance,input.isolatedReservedMargin),minimumCashBalance=input.marginMode==="isolated"?Math.max(0,input.cashBalance-protectedCollateral):protectedCollateral,requestedAfter=input.cashBalance+input.requestedCashDelta,cashAfter=input.requestedCashDelta>=0?requestedAfter:Math.max(minimumCashBalance,requestedAfter),appliedCashDelta=cashAfter-input.cashBalance,capped=Math.abs(appliedCashDelta-input.requestedCashDelta)>tolerance(input.requestedCashDelta);
 return Object.freeze({calculationMethod:input.marginMode==="isolated"?"isolated-position-loss-cap-v1":"cross-shared-pool-loss-cap-v1",marginMode:input.marginMode,cashBefore:input.cashBalance,requestedCashDelta:input.requestedCashDelta,appliedCashDelta,protectedCollateral,minimumCashBalance,cashAfter,capped});
}
