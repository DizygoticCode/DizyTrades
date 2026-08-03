import { append, replaceRegex } from "./utils.mjs";

await replaceRegex(
  "app/lib/manual-paper-backup.ts",
  /function depthEvidence.*?\n\nfunction position/s,
  `function depthEvidence(value:unknown,field:string):ManualPosition["entryDepthFill"]{
  if(value==null)return undefined;
  const input=object(value,field),evidence=Object.freeze({
    source:oneOf(input.source,field+".source",["dizyflow-public-depth"] as const),
    calculationMethod:oneOf(input.calculationMethod,field+".calculationMethod",["visible-book-walk"] as const),
    bookSide:oneOf(input.bookSide,field+".bookSide",["bid","ask"] as const),
    fillStatus:oneOf(input.fillStatus,field+".fillStatus",["full","partial"] as const),
    requestedContractVolume:number(input.requestedContractVolume,field+".requestedContractVolume",0.000000000001),
    filledContractVolume:number(input.filledContractVolume,field+".filledContractVolume",0.000000000001),
    unfilledContractVolume:number(input.unfilledContractVolume,field+".unfilledContractVolume",0),
    availableContractVolume:number(input.availableContractVolume,field+".availableContractVolume",0),
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
  if(!Number.isInteger(evidence.levelsConsumed)||!Number.isInteger(evidence.snapshotVersion))throw new Error(field+" has invalid integer evidence.");
  if(evidence.sourceMode==="NO VALID BOOK")throw new Error(field+" cannot reference an invalid book.");
  if(evidence.filledContractVolume-evidence.requestedContractVolume>volumeTolerance||evidence.filledContractVolume-evidence.availableContractVolume>volumeTolerance)throw new Error(field+" has impossible filled volume.");
  if(Math.abs(evidence.filledContractVolume+evidence.unfilledContractVolume-evidence.requestedContractVolume)>volumeTolerance)throw new Error(field+" volume totals do not reconcile.");
  if((evidence.fillStatus==="partial")!==hasRemainder)throw new Error(field+" fill status contradicts its remainder.");
  if(Math.abs(evidence.quantity*evidence.executionPrice-evidence.notional)>notionalTolerance)throw new Error(field+" notional does not reconcile.");
  const lower=Math.min(evidence.bestPrice,evidence.worstPrice)-priceTolerance,upper=Math.max(evidence.bestPrice,evidence.worstPrice)+priceTolerance;
  if(evidence.rawWeightedAveragePrice<lower||evidence.rawWeightedAveragePrice>upper)throw new Error(field+" weighted price is outside consumed levels.");
  if(evidence.bookSide==="ask"&&(evidence.bestPrice-evidence.worstPrice>priceTolerance||evidence.rawWeightedAveragePrice-evidence.executionPrice>priceTolerance))throw new Error(field+" has invalid ask-side prices.");
  if(evidence.bookSide==="bid"&&(evidence.worstPrice-evidence.bestPrice>priceTolerance||evidence.executionPrice-evidence.rawWeightedAveragePrice>priceTolerance))throw new Error(field+" has invalid bid-side prices.");
  return evidence;
}

function position`
);

await append(
  "tests/manual-paper-depth.test.mjs",
  `test("backup restore rejects contradictory visible-depth evidence",async()=>{const {mkdtemp,rm}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),{join}=await import("node:path"),{submitManualOrder}=await import("../app/lib/manual-paper.ts"),{validateManualPaperBackup}=await import("../app/lib/manual-paper-backup.ts"),prior=process.env.DATA_DIR,root=await mkdtemp(join(tmpdir(),"dizy-paper-depth-tamper-"));process.env.DATA_DIR=root;try{const book=depth([{price:99.9,orderCount:1,contractQuantity:10_000}],[{price:100.1,orderCount:2,contractQuantity:2_000},{price:100.2,orderCount:3,contractQuantity:4_000}]),account=await submitManualOrder("depth-tamper",{idempotencyKey:"depth-tamper-open01",symbol:"BTC_USDT",side:"long",sizeMode:"fixed-notional",amount:500,leverage:10},100,"fair",contract,undefined,book),volumeMismatch=structuredClone(account),statusMismatch=structuredClone(account),notionalMismatch=structuredClone(account);volumeMismatch.positions.BTC_USDT.entryDepthFill.unfilledContractVolume=1;statusMismatch.fills.at(-1).entryDepthFill.fillStatus="partial";notionalMismatch.fills.at(-1).entryDepthFill.notional+=10;assert.throws(()=>validateManualPaperBackup(volumeMismatch,"depth-tamper"),/volume totals do not reconcile/);assert.throws(()=>validateManualPaperBackup(statusMismatch,"depth-tamper"),/fill status contradicts/);assert.throws(()=>validateManualPaperBackup(notionalMismatch,"depth-tamper"),/notional does not reconcile/)}finally{if(prior===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=prior;await rm(root,{recursive:true,force:true})}});`
);
