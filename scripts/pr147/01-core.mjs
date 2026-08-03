import { readFile, writeFile } from "node:fs/promises";

const replaceOnce = (source, search, replacement, label) => {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(label + ": expected 1 match, found " + count);
  return source.replace(search, replacement);
};
const replaceFunction = (source, startName, nextName, replacement) => {
  const start = source.indexOf(startName);
  const end = source.indexOf(nextName, start + startName.length);
  if (start < 0 || end < 0) throw new Error("Function boundary missing: " + startName + " -> " + nextName);
  return source.slice(0, start) + replacement + "\n" + source.slice(end);
};

await writeFile("app/lib/manual-paper-reduce-only.ts", String.raw`export type ManualReduceOnlySide = "long" | "short";
export type ManualReduceOnlySource =
  | "manual-close"
  | "partial-close"
  | "reverse"
  | "flatten-all"
  | "risk-exit"
  | "opposite-order-replacement";

export type ManualReduceOnlyTarget = Readonly<{
  expectedTradeId: string;
  expectedSide: ManualReduceOnlySide;
}>;

export type ManualReduceOnlyPlan = Readonly<{
  enabled: true;
  calculationMethod: "position-bound-cap";
  source: ManualReduceOnlySource;
  expectedTradeId: string;
  expectedSide: ManualReduceOnlySide;
  positionQuantityBefore: number;
  requestedQuantity: number;
  acceptedQuantity: number;
  capped: boolean;
}>;

export type ManualReduceOnlyEvidence = ManualReduceOnlyPlan & Readonly<{
  filledQuantity: number;
  remainingQuantity: number;
  result: "closed" | "reduced";
}>;

const tolerance = (value: number) => Math.max(1e-12, Math.abs(value) * 1e-10);
const finitePositive = (value: number, code: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(code);
};

export function createManualReduceOnlyPlan(input: {
  source: ManualReduceOnlySource;
  target: ManualReduceOnlyTarget;
  positionTradeId: string;
  positionSide: ManualReduceOnlySide;
  positionQuantity: number;
  requestedQuantity: number;
  acceptedQuantity?: number;
}): ManualReduceOnlyPlan {
  if (!input.target.expectedTradeId || input.target.expectedTradeId !== input.positionTradeId) {
    throw new Error("STALE_REDUCE_ONLY_TARGET");
  }
  if (input.target.expectedSide !== input.positionSide) {
    throw new Error("REDUCE_ONLY_SIDE_MISMATCH");
  }
  finitePositive(input.positionQuantity, "INVALID_REDUCE_ONLY_POSITION");
  finitePositive(input.requestedQuantity, "INVALID_REDUCE_ONLY_QUANTITY");
  const maximumAccepted = Math.min(input.requestedQuantity, input.positionQuantity);
  const acceptedQuantity = input.acceptedQuantity ?? maximumAccepted;
  finitePositive(acceptedQuantity, "INVALID_REDUCE_ONLY_QUANTITY");
  if (acceptedQuantity - maximumAccepted > tolerance(input.positionQuantity)) {
    throw new Error("REDUCE_ONLY_EXCEEDS_POSITION");
  }
  return Object.freeze({
    enabled: true,
    calculationMethod: "position-bound-cap",
    source: input.source,
    expectedTradeId: input.target.expectedTradeId,
    expectedSide: input.target.expectedSide,
    positionQuantityBefore: input.positionQuantity,
    requestedQuantity: input.requestedQuantity,
    acceptedQuantity,
    capped: input.requestedQuantity - acceptedQuantity > tolerance(input.positionQuantity),
  });
}

export function finaliseManualReduceOnly(
  plan: ManualReduceOnlyPlan,
  filledQuantity: number,
): ManualReduceOnlyEvidence {
  finitePositive(filledQuantity, "INVALID_REDUCE_ONLY_FILL");
  if (filledQuantity - plan.acceptedQuantity > tolerance(plan.positionQuantityBefore)) {
    throw new Error("REDUCE_ONLY_FILL_EXCEEDS_ACCEPTED");
  }
  const remainingQuantity = Math.max(0, plan.positionQuantityBefore - filledQuantity);
  return Object.freeze({
    ...plan,
    filledQuantity,
    remainingQuantity,
    result: remainingQuantity <= tolerance(plan.positionQuantityBefore) ? "closed" : "reduced",
  });
}
`);

const path = "app/lib/manual-paper.ts";
let source = await readFile(path, "utf8");
source = replaceOnce(
  source,
  'import {simulatePaperMarketDepthFill,type PaperDepthContractRules,type PaperDepthFillEvidence} from "./manual-paper-depth";\n',
  'import {simulatePaperMarketDepthFill,type PaperDepthContractRules,type PaperDepthFillEvidence} from "./manual-paper-depth";\nimport {createManualReduceOnlyPlan,finaliseManualReduceOnly,type ManualReduceOnlyEvidence,type ManualReduceOnlyPlan,type ManualReduceOnlySource,type ManualReduceOnlyTarget} from "./manual-paper-reduce-only";\n',
  "reduce-only import",
);
source = replaceOnce(
  source,
  'exitDepthFill?:PaperDepthFillEvidence;notional:number;',
  'exitDepthFill?:PaperDepthFillEvidence;reduceOnly?:ManualReduceOnlyEvidence;notional:number;',
  "fill evidence type",
);
source = replaceOnce(
  source,
  'confirmReverse?:boolean},marketPrice:number',
  'confirmReverse?:boolean;expectedTradeId?:unknown;expectedSide?:unknown},marketPrice:number',
  "replacement target input",
);

source = replaceOnce(
  source,
  'function precisionSnapshot(position:ManualPosition,contractVolume=position.contractVolume){const precision=contractVolume===undefined?{}:{contractVolume,contractSize:position.contractSize,priceUnit:position.priceUnit,volUnit:position.volUnit,minContractVolume:position.minContractVolume,maxContractVolume:position.maxContractVolume};return {...precision,entryDepthFill:position.entryDepthFill}}\n',
  String.raw`function precisionSnapshot(position:ManualPosition,contractVolume=position.contractVolume){const precision=contractVolume===undefined?{}:{contractVolume,contractSize:position.contractSize,priceUnit:position.priceUnit,volUnit:position.volUnit,minContractVolume:position.minContractVolume,maxContractVolume:position.maxContractVolume};return {...precision,entryDepthFill:position.entryDepthFill}}
function internalReduceOnlyTarget(position:ManualPosition):ManualReduceOnlyTarget{return {expectedTradeId:position.tradeId,expectedSide:position.side}}
function clientReduceOnlyTarget(position:ManualPosition,expectedTradeId?:unknown,expectedSide?:unknown):ManualReduceOnlyTarget{if(expectedTradeId==null&&expectedSide==null)return internalReduceOnlyTarget(position);return {expectedTradeId:String(expectedTradeId??""),expectedSide:String(expectedSide??"") as ManualSide}}
function reduceOnlySourceForReason(reason:CloseReason):ManualReduceOnlySource{return reason==="reversal"?"reverse":reason==="stop"||reason==="target"||reason==="liquidation"?"risk-exit":"manual-close"}
function manualReduceOnlyPlan(position:ManualPosition,requestedQuantity:number,acceptedQuantity:number,source:ManualReduceOnlySource,target:ManualReduceOnlyTarget=internalReduceOnlyTarget(position)){try{return createManualReduceOnlyPlan({source,target,positionTradeId:position.tradeId,positionSide:position.side,positionQuantity:position.quantity,requestedQuantity,acceptedQuantity})}catch(error){const code=error instanceof Error?error.message:"INVALID_REDUCE_ONLY_REQUEST";if(code==="STALE_REDUCE_ONLY_TARGET")return fail(code,"expectedTradeId","This reduce-only request targets a position that is no longer open.");if(code==="REDUCE_ONLY_SIDE_MISMATCH")return fail(code,"expectedSide","This reduce-only request does not match the open position side.");if(code==="REDUCE_ONLY_EXCEEDS_POSITION")return fail(code,"quantity","Reduce-only quantity cannot exceed the open position.");return fail("INVALID_REDUCE_ONLY_REQUEST","quantity","Invalid reduce-only request.")}
`,
  "reduce-only helpers",
);

source = replaceFunction(source, "function closeQuantityForInput", "function positionDepthRules", String.raw`function closeQuantityForInput(position:ManualPosition,input:{percentage?:unknown;quantity?:unknown}){const pct=number(input.percentage),requested=number(input.quantity);if(pct!==null&&(pct<=0||pct>100))fail("INVALID_CLOSE_SIZE","quantity","Close percentage must be greater than zero and no more than 100%.");const desiredValue=requested??(pct===null?null:position.quantity*pct/100);if(desiredValue===null)fail("INVALID_CLOSE_SIZE","quantity","Close size must be greater than zero.");const requestedQuantity=desiredValue as number;if(requestedQuantity<=0)fail("INVALID_CLOSE_SIZE","quantity","Close size must be greater than zero.");const bounded=Math.min(requestedQuantity,position.quantity);if(bounded>=position.quantity*(1-1e-12))return {requestedQuantity,acceptedQuantity:position.quantity};if(position.contractSize&&position.volUnit){const volume=quantizeMexcStep(bounded/position.contractSize,position.volUnit,"floor"),minimum=position.minContractVolume??position.volUnit,openVolume=position.contractVolume??position.quantity/position.contractSize,remaining=Number((openVolume-volume).toPrecision(15));if(volume<minimum)fail("INVALID_CLOSE_SIZE","quantity","Partial close must contain at least "+minimum+" contracts.");if(remaining>1e-12&&remaining<minimum)fail("INVALID_CLOSE_SIZE","quantity","Partial close would leave fewer than "+minimum+" contracts open.");const quantity=Number((volume*position.contractSize).toPrecision(15));if(quantity<=0||quantity>position.quantity)return fail("INVALID_CLOSE_SIZE","quantity","Close size is outside the open contract volume.");return {requestedQuantity,acceptedQuantity:quantity}}return {requestedQuantity,acceptedQuantity:bounded}}
`);

source = replaceFunction(source, "function closeWithDepthAt", "function planOppositeDepthReplacement", String.raw`function closeWithDepthAt(account:ManualAccount,userId:string,symbol:string,marketPrice:number,key:string,requestedQuantity:number,depth:DepthEnvelope,current?:MexcContractMetadata,closeReason:CloseReason="manual",reduceOnlyPlan?:ManualReduceOnlyPlan){const position=account.positions[symbol];if(!position)fail("NO_POSITION","symbol","No manual position.");const plan=reduceOnlyPlan??manualReduceOnlyPlan(position,requestedQuantity,Math.min(requestedQuantity,position.quantity),reduceOnlySourceForReason(closeReason));requestedQuantity=plan.acceptedQuantity;const rules=positionDepthRules(position,current),openContractVolume=quantizeMexcStep(position.contractVolume??position.quantity/rules.contractSize,rules.volUnit,"nearest"),requestedContractVolume=quantizeMexcStep(requestedQuantity/rules.contractSize,rules.volUnit,"floor");let exitDepthFill:PaperDepthFillEvidence;try{exitDepthFill=simulatePaperMarketDepthFill({side:position.side,opening:false,requestedContractVolume,openContractVolume,minimumRemainingContractVolume:position.minContractVolume??rules.minVol,referencePrice:marketPrice,contract:rules,depth})}catch(error){return mapDepthExitError(error,rules)}const closeQuantity=exitDepthFill.quantity,reduceOnly=finaliseManualReduceOnly(plan,closeQuantity),slipped=exitDepthFill.executionPrice,notional=exitDepthFill.notional,feeSnapshot=positionMarketTakerFeeSnapshot(position,account.settings),feeBreakdown=paperExecutionFee(notional,feeSnapshot,closeReason==="liquidation"?account.settings.liquidationPenaltyPct/100:0),riskExitTrigger=isRiskExitReason(closeReason)?position.pendingRiskExit:undefined,fee=feeBreakdown.totalFee,pnl=(slipped-position.entryPrice)*closeQuantity*(position.side==="long"?1:-1),ratio=closeQuantity/position.quantity,remainingContractVolume=exitDepthFill.remainingPositionContractVolume??quantizeMexcStep(Math.max(0,openContractVolume-exitDepthFill.filledContractVolume),rules.volUnit,"floor"),fullyClosed=remainingContractVolume<=rules.volUnit*1e-9,timestamp=new Date().toISOString(),allocatedEntryFee=(position.entryFee??0)*ratio,fundingPnl=fullyClosed?(position.fundingPnl??0):0,tradingNet=pnl-allocatedEntryFee-fee,net=tradingNet+fundingPnl;account.cashBalance=Math.max(0,account.cashBalance+pnl-fee);account.realisedPnl+=tradingNet;account.fees+=fee;account.fills.push({orderId:randomUUID(),fillId:randomUUID(),tradeId:position.tradeId,marketKey:position.marketKey,marketType:position.marketType,idempotencyKey:key,userId,symbol,side:"close",marginMode:position.marginMode,leverage:position.leverage,entryPrice:position.entryPrice,price:slipped,quantity:closeQuantity,...precisionSnapshot(position,exitDepthFill.filledContractVolume),exitDepthFill,reduceOnly,notional,marginUsed:(position.margin??position.quantity*position.entryPrice/position.leverage)*ratio,entryFee:allocatedEntryFee,exitFee:fee,...feeSnapshot,tradingFee:feeBreakdown.tradingFee,liquidationPenalty:feeBreakdown.liquidationPenalty,fee,timestamp,openedAt:position.openedAt,...(riskExitTrigger?{riskExitTrigger}:{}),closeReason:fullyClosed?closeReason:undefined,grossPnl:pnl,fundingPnl,netPnl:net,realisedPnl:net,resultingBalance:account.cashBalance});if(fullyClosed)delete account.positions[symbol];else account.positions[symbol]={...position,...feeSnapshot,quantity:Number((remainingContractVolume*rules.contractSize).toPrecision(15)),contractVolume:remainingContractVolume,contractSize:rules.contractSize,priceUnit:rules.priceUnit,volUnit:rules.volUnit,minContractVolume:rules.minVol,maxContractVolume:rules.maxVol,margin:(position.margin??position.quantity*position.entryPrice/position.leverage)*(1-ratio),entryFee:(position.entryFee??0)*(1-ratio)};return exitDepthFill}
`);

source = replaceFunction(source, "function closeAt", "export async function closeManualPosition", String.raw`function closeAt(account:ManualAccount,userId:string,symbol:string,marketPrice:number,key:string,closeReason:CloseReason="manual",reduceOnlyPlan?:ManualReduceOnlyPlan){const position=account.positions[symbol];if(!position)fail("NO_POSITION","symbol","No manual position.");const plan=reduceOnlyPlan??manualReduceOnlyPlan(position,position.quantity,position.quantity,reduceOnlySourceForReason(closeReason));if(Math.abs(plan.acceptedQuantity-position.quantity)>Math.max(1e-12,position.quantity*1e-10))fail("INVALID_REDUCE_ONLY_REQUEST","quantity","Full close must reduce the entire remaining position.");const reduceOnly=finaliseManualReduceOnly(plan,position.quantity),rawSlipped=marketPrice*(1+(position.side==="long"?-1:1)*account.settings.slippagePct/100),slipped=position.priceUnit?quantizeMexcExecutionPrice(rawSlipped,position.priceUnit,position.side,false):rawSlipped,notional=position.quantity*slipped,feeSnapshot=positionMarketTakerFeeSnapshot(position,account.settings),feeBreakdown=paperExecutionFee(notional,feeSnapshot,closeReason==="liquidation"?account.settings.liquidationPenaltyPct/100:0),baseFee=feeBreakdown.tradingFee,penalty=feeBreakdown.liquidationPenalty,fee=feeBreakdown.totalFee,pnl=(slipped-position.entryPrice)*position.quantity*(position.side==="long"?1:-1),tradingNet=pnl-position.entryFee-fee,fundingPnl=position.fundingPnl??0,net=tradingNet+fundingPnl;account.cashBalance=Math.max(0,account.cashBalance+pnl-fee);account.realisedPnl+=tradingNet;account.fees+=fee;const timestamp=new Date().toISOString();account.fills.push({orderId:randomUUID(),fillId:randomUUID(),tradeId:position.tradeId,marketKey:position.marketKey,marketType:position.marketType,idempotencyKey:key,userId,symbol,side:"close",marginMode:position.marginMode,leverage:position.leverage,entryPrice:position.entryPrice,price:slipped,quantity:position.quantity,...precisionSnapshot(position),reduceOnly,notional,marginUsed:position.margin,stopLoss:position.stopLoss,takeProfit:position.takeProfit,estimatedLiquidation:position.estimatedLiquidation,riskPriceSource:position.riskPriceSource,entryFee:position.entryFee,exitFee:fee,...feeSnapshot,tradingFee:baseFee,liquidationPenalty:penalty,fee,timestamp,openedAt:position.openedAt,...(position.pendingRiskExit?{riskExitTrigger:position.pendingRiskExit}:{}),closeReason,grossPnl:pnl,fundingPnl,netPnl:net,realisedPnl:net,resultingBalance:account.cashBalance});delete account.positions[symbol]}
`);

source = replaceFunction(source, "export async function closeManualPosition", "export async function syncManualFunding", String.raw`export async function closeManualPosition(userId:string,symbol:string,key:string,marketPrice:number,depth?:DepthEnvelope,current?:MexcContractMetadata,target?:ManualReduceOnlyTarget){return serial(userId,async()=>{const account=await readManualAccount(userId);if(!account.settings.enabled)fail("MANUAL_PAPER_DISABLED","settings.enabled","Manual Paper is disabled.");validateKey(account,key);const position=account.positions[symbol];if(!position)fail("NO_POSITION","symbol","No manual position.");const plan=manualReduceOnlyPlan(position,position.quantity,position.quantity,"manual-close",target);if(depth)closeWithDepthAt(account,userId,symbol,marketPrice,key,position.quantity,depth,current,"manual",plan);else closeAt(account,userId,symbol,marketPrice,key,"manual",plan);account.idempotencyKeys.push(key);account.fills=account.fills.slice(-500);account.updatedAt=new Date().toISOString();await writeManualAccount(userId,account);return account})}
`);

await writeFile(path, source);
