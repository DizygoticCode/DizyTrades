import { replaceExact, replaceRegex } from "./utils.mjs";

await replaceRegex(
  "app/lib/manual-paper-backup.ts",
  /function depthEvidence.*?\n\nfunction position/s,
  `function depthEvidence(value:unknown,field:string,expectedContext:"entry"|"exit"):ManualPosition["entryDepthFill"]{
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

function position`
);
await replaceExact(
  "app/lib/manual-paper-backup.ts",
  `entryDepthFill: depthEvidence(input.entryDepthFill,"manualPaper.position.entryDepthFill"),`,
  `entryDepthFill: depthEvidence(input.entryDepthFill,"manualPaper.position.entryDepthFill","entry"),`
);
await replaceExact(
  "app/lib/manual-paper-backup.ts",
  `entryDepthFill: depthEvidence(input.entryDepthFill,"manualPaper.fill.entryDepthFill"),`,
  `entryDepthFill: depthEvidence(input.entryDepthFill,"manualPaper.fill.entryDepthFill","entry"),\n    exitDepthFill: depthEvidence(input.exitDepthFill,"manualPaper.fill.exitDepthFill","exit"),`
);
