import { readFile, writeFile } from "node:fs/promises";

const replaceOnce = (source, search, replacement, label) => {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(label + ": expected 1 match, found " + count);
  return source.replace(search, replacement);
};

{
  const path = "app/api/manual-paper/route.ts";
  let source = await readFile(path, "utf8");
  source = replaceOnce(
    source,
    'import {latestManualPaperDepth} from "../../lib/manual-paper-depth-source";\n',
    'import {latestManualPaperDepth} from "../../lib/manual-paper-depth-source";\nimport type {ManualReduceOnlyTarget} from "../../lib/manual-paper-reduce-only";\n',
    "route reduce-only import",
  );
  source = replaceOnce(
    source,
    'async function requiredDepth(symbol:string){try{return await latestManualPaperDepth(symbol)}catch{throw new ManualPaperError("DEPTH_UNAVAILABLE","depth","Fresh public DizyFlow depth is unavailable for this market action.")}}\n',
    'async function requiredDepth(symbol:string){try{return await latestManualPaperDepth(symbol)}catch{throw new ManualPaperError("DEPTH_UNAVAILABLE","depth","Fresh public DizyFlow depth is unavailable for this market action.")}}\nfunction reduceOnlyTarget(body:Record<string,unknown>):ManualReduceOnlyTarget{return {expectedTradeId:String(body.expectedTradeId??""),expectedSide:String(body.expectedSide??"") as ManualReduceOnlyTarget["expectedSide"]}}\n',
    "route target parser",
  );
  source = replaceOnce(source,
    'account=await closeManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,depth,contract)',
    'account=await closeManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,depth,contract,reduceOnlyTarget(body))',
    "route close target",
  );
  source = replaceOnce(source,
    'account=await partialCloseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,body,depth,contract)',
    'account=await partialCloseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,body,depth,contract,reduceOnlyTarget(body))',
    "route partial target",
  );
  source = replaceOnce(source,
    'account=await reverseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,depth,contract)',
    'account=await reverseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,depth,contract,reduceOnlyTarget(body))',
    "route reverse target",
  );
  source = replaceOnce(source,
    'await appendAudit(user.id,"manual-paper."+action,{symbol:body.symbol});',
    'await appendAudit(user.id,"manual-paper."+action,{symbol:body.symbol,expectedTradeId:body.expectedTradeId});',
    "route audit target",
  );
  await writeFile(path, source);
}

{
  const path = "app/manual-paper-ticket.tsx";
  let source = await readFile(path, "utf8");
  source = replaceOnce(
    source,
    'type FundingPayment={paymentId:string;tradeId:string;symbol:string;side:"long"|"short";settleTime:number;observedAt:number;price:number;priceSource:"fair"|"last";notional:number;fundingRate:number;calculatedCashDelta:number;cashDelta:number;balanceCapped:boolean;source:"mexc-public-funding-history";calculationMethod:"observed-risk-price-notional";resultingBalance:number};\n',
    'type FundingPayment={paymentId:string;tradeId:string;symbol:string;side:"long"|"short";settleTime:number;observedAt:number;price:number;priceSource:"fair"|"last";notional:number;fundingRate:number;calculatedCashDelta:number;cashDelta:number;balanceCapped:boolean;source:"mexc-public-funding-history";calculationMethod:"observed-risk-price-notional";resultingBalance:number};\ntype ReduceOnlyEvidence={enabled:true;calculationMethod:"position-bound-cap";source:"manual-close"|"partial-close"|"reverse"|"flatten-all"|"risk-exit"|"opposite-order-replacement";expectedTradeId:string;expectedSide:"long"|"short";positionQuantityBefore:number;requestedQuantity:number;acceptedQuantity:number;capped:boolean;filledQuantity:number;remainingQuantity:number;result:"closed"|"reduced"};\n',
    "ticket evidence type",
  );
  source = replaceOnce(
    source,
    '  exitDepthFill?: PaperDepthFillEvidence;\n  fee: number;',
    '  exitDepthFill?: PaperDepthFillEvidence;\n  reduceOnly?: ReduceOnlyEvidence;\n  fee: number;',
    "ticket fill evidence",
  );
  source = replaceOnce(
    source,
    '      confirmReverse: Boolean(position && position.side !== orderSide),\n      idempotencyKey: crypto.randomUUID(),',
    '      confirmReverse: Boolean(position && position.side !== orderSide),\n      expectedTradeId: position?.tradeId,\n      expectedSide: position?.side,\n      idempotencyKey: crypto.randomUUID(),',
    "ticket replacement target",
  );
  source = replaceOnce(
    source,
    '  const action = (value: string, extra: Record<string, unknown> = {}) =>\n      post({\n        action: value,\n        symbol,\n        idempotencyKey: crypto.randomUUID(),\n        ...extra,\n      }),\n    positions = useMemo(',
    '  const action = (value: string, extra: Record<string, unknown> = {}) => {\n    const actionSymbol=String(extra.symbol??symbol),actionPosition=account?.positions[actionSymbol];\n    return post({action:value,symbol:actionSymbol,idempotencyKey:crypto.randomUUID(),expectedTradeId:actionPosition?.tradeId,expectedSide:actionPosition?.side,...extra});\n  };\n  const positions = useMemo(',
    "ticket row target binding",
  );
  source = replaceOnce(
    source,
    '                          {fill.exitDepthFill?<small>{`exit depth ${fill.exitDepthFill.fillStatus} · ${fill.exitDepthFill.filledContractVolume}/${fill.exitDepthFill.requestedContractVolume} contracts · remaining ${fill.exitDepthFill.remainingPositionContractVolume??0} · ${fill.exitDepthFill.levelsConsumed} levels · ${fill.exitDepthFill.priceImpactBps.toFixed(2)} bps`}</small>:null}\n',
    '                          {fill.exitDepthFill?<small>{`exit depth ${fill.exitDepthFill.fillStatus} · ${fill.exitDepthFill.filledContractVolume}/${fill.exitDepthFill.requestedContractVolume} contracts · remaining ${fill.exitDepthFill.remainingPositionContractVolume??0} · ${fill.exitDepthFill.levelsConsumed} levels · ${fill.exitDepthFill.priceImpactBps.toFixed(2)} bps`}</small>:null}\n                          {fill.reduceOnly?<small>{`reduce-only ${fill.reduceOnly.source} · requested ${fill.reduceOnly.requestedQuantity} · filled ${fill.reduceOnly.filledQuantity} · remaining ${fill.reduceOnly.remainingQuantity}${fill.reduceOnly.capped?" · capped":""}`}</small>:null}\n',
    "ticket history evidence",
  );
  await writeFile(path, source);
}

{
  const path = "app/lib/manual-paper-backup.ts";
  let source = await readFile(path, "utf8");
  source = replaceOnce(
    source,
    'function riskExitTrigger(value:unknown,field:string):ManualPosition["pendingRiskExit"]{if(value==null)return undefined;const input=object(value,field);return Object.freeze({reason:oneOf(input.reason,field+".reason",["stop","target","liquidation"] as const),triggeredAt:iso(input.triggeredAt,field+".triggeredAt"),triggerPrice:number(input.triggerPrice,field+".triggerPrice",0.000000000001),priceSource:oneOf(input.priceSource,field+".priceSource",["fair","last"] as const)})}\n',
    String.raw`function riskExitTrigger(value:unknown,field:string):ManualPosition["pendingRiskExit"]{if(value==null)return undefined;const input=object(value,field);return Object.freeze({reason:oneOf(input.reason,field+".reason",["stop","target","liquidation"] as const),triggeredAt:iso(input.triggeredAt,field+".triggeredAt"),triggerPrice:number(input.triggerPrice,field+".triggerPrice",0.000000000001),priceSource:oneOf(input.priceSource,field+".priceSource",["fair","last"] as const)})}
function reduceOnlyEvidence(value:unknown,field:string,fillTradeId:unknown,fillSide:unknown,fillQuantity:unknown):ManualFill["reduceOnly"]{if(value==null)return undefined;const input=object(value,field),evidence=Object.freeze({enabled:boolean(input.enabled,field+".enabled"),calculationMethod:oneOf(input.calculationMethod,field+".calculationMethod",["position-bound-cap"] as const),source:oneOf(input.source,field+".source",["manual-close","partial-close","reverse","flatten-all","risk-exit","opposite-order-replacement"] as const),expectedTradeId:string(input.expectedTradeId,field+".expectedTradeId",300),expectedSide:oneOf(input.expectedSide,field+".expectedSide",["long","short"] as const),positionQuantityBefore:number(input.positionQuantityBefore,field+".positionQuantityBefore",0.000000000001),requestedQuantity:number(input.requestedQuantity,field+".requestedQuantity",0.000000000001),acceptedQuantity:number(input.acceptedQuantity,field+".acceptedQuantity",0.000000000001),capped:boolean(input.capped,field+".capped"),filledQuantity:number(input.filledQuantity,field+".filledQuantity",0.000000000001),remainingQuantity:number(input.remainingQuantity,field+".remainingQuantity",0),result:oneOf(input.result,field+".result",["closed","reduced"] as const)}),tolerance=Math.max(1e-10,evidence.positionQuantityBefore*1e-9),tradeId=string(fillTradeId,field+".fillTradeId",300),quantity=number(fillQuantity,field+".fillQuantity",0.000000000001);if(!evidence.enabled||fillSide!=="close")throw new Error(field+" is not attached to a close fill.");if(evidence.expectedTradeId!==tradeId)throw new Error(field+" targets a different trade.");if(evidence.acceptedQuantity-evidence.requestedQuantity>tolerance||evidence.acceptedQuantity-evidence.positionQuantityBefore>tolerance)throw new Error(field+" accepts too much quantity.");if(evidence.filledQuantity-evidence.acceptedQuantity>tolerance||Math.abs(evidence.filledQuantity-quantity)>tolerance)throw new Error(field+" filled quantity does not reconcile.");if(Math.abs(evidence.filledQuantity+evidence.remainingQuantity-evidence.positionQuantityBefore)>tolerance)throw new Error(field+" position quantity does not reconcile.");if(evidence.capped!==(evidence.requestedQuantity-evidence.acceptedQuantity>tolerance))throw new Error(field+" capped state contradicts its quantities.");if((evidence.result==="closed")!==(evidence.remainingQuantity<=tolerance))throw new Error(field+" result contradicts its remainder.");return evidence}
`,
    "backup reduce-only parser",
  );
  source = replaceOnce(
    source,
    '    exitDepthFill: depthEvidence(input.exitDepthFill,"manualPaper.fill.exitDepthFill","exit"),\n    notional:',
    '    exitDepthFill: depthEvidence(input.exitDepthFill,"manualPaper.fill.exitDepthFill","exit"),\n    reduceOnly: reduceOnlyEvidence(input.reduceOnly,"manualPaper.fill.reduceOnly",input.tradeId,input.side,input.quantity),\n    notional:',
    "backup fill evidence",
  );
  await writeFile(path, source);
}
