export type PaperSide="long"|"short";
export type MarginMode="isolated"|"cross";
export type PaperSizeMode="fixed-margin"|"fixed-notional"|"equity-percent"|"risk-percent";
export type RiskPriceSource="fair"|"last";
export type CloseReason="manual"|"stop"|"target"|"liquidation"|"reversal";
export type PaperLiquidationAudit=Readonly<{calculationMethod:"linear-usdt-mark-notional-v2";bankruptcyCalculationMethod:"linear-usdt-zero-equity-v1";collateralBasis:"assigned-margin"|"cross-shared-usdt-pool";positionQuantity:number;collateral:number;usableCollateral:number;entryFee:number;maintenanceMarginRate:number;liquidationPenaltyRate:number;maintenanceMarginAtLiquidation:number;liquidationPenaltyReserve:number;estimatedLiquidation:number;bankruptcyPrice:number;liquidationToBankruptcyDistance:number}>;

/** Simulator assumptions, not MEXC fee tiers or an exchange-exact risk engine. */
export const PAPER_RISK_ASSUMPTIONS={maintenanceMarginRate:0.005,takerFeeRate:0.0006,makerFeeRate:0.0002,slippageRate:0.0002,liquidationPenaltyRate:0.001} as const;
export const SIMULATOR_LEVERAGE_CHOICES=[1,2,3,5,10,20] as const;
const valid=(n:number)=>Number.isFinite(n)&&n>0;

export function paperPnl(side:PaperSide,entry:number,mark:number,quantity:number){return (mark-entry)*quantity*(side==="long"?1:-1)}
export function paperFee(notional:number,rate=PAPER_RISK_ASSUMPTIONS.takerFeeRate){return valid(notional)&&Number.isFinite(rate)&&rate>=0?notional*rate:NaN}
export function applyPaperSlippage(price:number,side:PaperSide,opening:boolean,rate=PAPER_RISK_ASSUMPTIONS.slippageRate){const direction=(side==="long")===opening?1:-1;return price*(1+direction*rate)}

export function auditPaperLiquidation(input:{side:PaperSide;entryPrice:number;quantity:number;marginMode:MarginMode;assignedMargin:number;crossCollateral:number;entryFee:number;maintenanceMarginRate?:number;liquidationPenaltyRate?:number}):PaperLiquidationAudit{
 const {side,entryPrice,quantity}=input,collateral=input.marginMode==="isolated"?input.assignedMargin:input.crossCollateral,mmr=input.maintenanceMarginRate??PAPER_RISK_ASSUMPTIONS.maintenanceMarginRate,penalty=input.liquidationPenaltyRate??PAPER_RISK_ASSUMPTIONS.liquidationPenaltyRate,totalRate=mmr+penalty;
 if(!valid(entryPrice)||!valid(quantity)||!valid(collateral)||!Number.isFinite(input.entryFee)||input.entryFee<0||input.entryFee>=collateral||!Number.isFinite(mmr)||mmr<0||mmr>=1||!Number.isFinite(penalty)||penalty<0||totalRate>=1)throw new Error("INVALID_LIQUIDATION_INPUT");
 const usableCollateral=collateral-input.entryFee,bankruptcyPrice=Math.max(0,side==="long"?entryPrice-usableCollateral/quantity:entryPrice+usableCollateral/quantity),estimatedLiquidation=Math.max(0,side==="long"?(entryPrice*quantity-usableCollateral)/(quantity*(1-totalRate)):(entryPrice*quantity+usableCollateral)/(quantity*(1+totalRate))),maintenanceMarginAtLiquidation=estimatedLiquidation*quantity*mmr,liquidationPenaltyReserve=estimatedLiquidation*quantity*penalty;
 return Object.freeze({calculationMethod:"linear-usdt-mark-notional-v2",bankruptcyCalculationMethod:"linear-usdt-zero-equity-v1",collateralBasis:input.marginMode==="isolated"?"assigned-margin":"cross-shared-usdt-pool",positionQuantity:quantity,collateral,usableCollateral,entryFee:input.entryFee,maintenanceMarginRate:mmr,liquidationPenaltyRate:penalty,maintenanceMarginAtLiquidation,liquidationPenaltyReserve,estimatedLiquidation,bankruptcyPrice,liquidationToBankruptcyDistance:Math.abs(estimatedLiquidation-bankruptcyPrice)});
}

export function estimateLiquidation(input:{side:PaperSide;entryPrice:number;quantity:number;marginMode:MarginMode;assignedMargin:number;crossCollateral:number;entryFee:number;maintenanceMarginRate?:number;liquidationPenaltyRate?:number}){try{return auditPaperLiquidation(input).estimatedLiquidation}catch{return NaN}}

export function sizePaperPosition(input:{mode:PaperSizeMode;amount:number;leverage:number;equity:number;price:number;side:PaperSide;stopLoss?:number|null;minLeverage?:number;maxLeverage?:number}){
 const {amount,leverage,equity,price}=input,minLeverage=input.minLeverage??1,maxLeverage=input.maxLeverage??20;if(!valid(amount)||!valid(leverage)||!valid(minLeverage)||!valid(maxLeverage)||maxLeverage<minLeverage||leverage<minLeverage||leverage>maxLeverage||!valid(equity)||!valid(price))throw new Error("INVALID_SIZING");
 let margin:number,notional:number,riskAmount=0;
 if(input.mode==="fixed-notional"){notional=amount;margin=notional/leverage}
 else if(input.mode==="fixed-margin"){margin=amount;notional=margin*leverage}
 else if(input.mode==="equity-percent"){if(amount>100)throw new Error("INVALID_PERCENTAGE");margin=equity*amount/100;notional=margin*leverage}
 else {if(amount>100||!valid(input.stopLoss??NaN)||(input.side==="long"?input.stopLoss!>=price:input.stopLoss!<=price))throw new Error("INVALID_RISK_STOP");riskAmount=equity*amount/100;notional=riskAmount/(Math.abs(price-input.stopLoss!)/price);margin=notional/leverage}
 const quantity=notional/price;if(!valid(margin)||!valid(notional)||!valid(quantity)||margin>equity)throw new Error("INSUFFICIENT_EQUITY");
 if(!riskAmount&&valid(input.stopLoss??NaN))riskAmount=Math.abs(price-input.stopLoss!)*quantity;
 return {margin,notional,quantity,leverage,riskAmount};
}

export function evaluatePaperClose(input:{side:PaperSide;riskPrice:number;stopLoss?:number|null;takeProfit?:number|null;estimatedLiquidation:number}):CloseReason|null{
 const {side,riskPrice}=input;if(!valid(riskPrice))return null;
 const liquidation=side==="long"?riskPrice<=input.estimatedLiquidation:riskPrice>=input.estimatedLiquidation;
 const stop=valid(input.stopLoss??NaN)&&(side==="long"?riskPrice<=input.stopLoss!:riskPrice>=input.stopLoss!);
 const target=valid(input.takeProfit??NaN)&&(side==="long"?riskPrice>=input.takeProfit!:riskPrice<=input.takeProfit!);
 // A protective stop that is reached before the liquidation boundary wins.
 if(stop&&!liquidation)return "stop";if(target&&!liquidation)return "target";if(liquidation)return "liquidation";return null;
}

export function paperAccountSummary(cashBalance:number,positions:Array<{side:PaperSide;entryPrice:number;quantity:number;margin:number}>,marks:number[]){const unrealised=positions.reduce((sum,p,i)=>sum+(valid(marks[i])?paperPnl(p.side,p.entryPrice,marks[i],p.quantity):0),0),usedMargin=positions.reduce((sum,p)=>sum+p.margin,0),equity=Math.max(0,cashBalance+unrealised);return {unrealised,usedMargin,equity,availableBalance:Math.max(0,equity-usedMargin),marginRatio:equity>0?usedMargin/equity:usedMargin?Infinity:0}}

export function selectRiskPrice(fairPrice:unknown,lastPrice:unknown,previous?:number){const fair=Number(fairPrice),last=Number(lastPrice);if(valid(fair))return {price:fair,source:"fair" as const,fallback:false};if(valid(last))return {price:last,source:"last" as const,fallback:true};if(valid(previous??NaN))return {price:previous!,source:"last" as const,fallback:true,stale:true};return null}
