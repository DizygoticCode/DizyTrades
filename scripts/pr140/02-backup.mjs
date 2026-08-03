import { replaceExact } from "./utils.mjs";

await replaceExact(
  "app/lib/manual-paper-backup.ts",
  `function position(value: unknown, key: string): ManualPosition {`,
  `function depthEvidence(value:unknown,field:string):ManualPosition["entryDepthFill"]{if(value==null)return undefined;const input=object(value,field);return Object.freeze({source:oneOf(input.source,field+".source",["dizyflow-public-depth"] as const),calculationMethod:oneOf(input.calculationMethod,field+".calculationMethod",["visible-book-walk"] as const),bookSide:oneOf(input.bookSide,field+".bookSide",["bid","ask"] as const),fillStatus:oneOf(input.fillStatus,field+".fillStatus",["full","partial"] as const),requestedContractVolume:number(input.requestedContractVolume,field+".requestedContractVolume",0.000000000001),filledContractVolume:number(input.filledContractVolume,field+".filledContractVolume",0.000000000001),unfilledContractVolume:number(input.unfilledContractVolume,field+".unfilledContractVolume",0),availableContractVolume:number(input.availableContractVolume,field+".availableContractVolume",0),quantity:number(input.quantity,field+".quantity",0.000000000001),notional:number(input.notional,field+".notional",0.000000000001),rawWeightedAveragePrice:number(input.rawWeightedAveragePrice,field+".rawWeightedAveragePrice",0.000000000001),executionPrice:number(input.executionPrice,field+".executionPrice",0.000000000001),bestPrice:number(input.bestPrice,field+".bestPrice",0.000000000001),worstPrice:number(input.worstPrice,field+".worstPrice",0.000000000001),levelsConsumed:number(input.levelsConsumed,field+".levelsConsumed",1,1_000),priceImpactBps:number(input.priceImpactBps,field+".priceImpactBps"),snapshotVersion:number(input.snapshotVersion,field+".snapshotVersion",0),snapshotReceivedAt:number(input.snapshotReceivedAt,field+".snapshotReceivedAt",1),snapshotAgeMs:number(input.snapshotAgeMs,field+".snapshotAgeMs",0),sourceMode:input.sourceMode==null?null:oneOf(input.sourceMode,field+".sourceMode",["FULL DEPTH WS","REST FALLBACK","RECONNECTING — LAST BOOK RETAINED","NO VALID BOOK"] as const)})}\n\nfunction position(value: unknown, key: string): ManualPosition {`
);

await replaceExact(
  "app/lib/manual-paper-backup.ts",
  `    maxContractVolume: input.maxContractVolume == null ? undefined : number(input.maxContractVolume, "manualPaper.position.maxContractVolume", 0.000000000001),\n    entryPrice,`,
  `    maxContractVolume: input.maxContractVolume == null ? undefined : number(input.maxContractVolume, "manualPaper.position.maxContractVolume", 0.000000000001),\n    entryDepthFill: depthEvidence(input.entryDepthFill,"manualPaper.position.entryDepthFill"),\n    entryPrice,`
);

await replaceExact(
  "app/lib/manual-paper-backup.ts",
  `    maxContractVolume: input.maxContractVolume == null ? undefined : number(input.maxContractVolume, "manualPaper.fill.maxContractVolume", 0.000000000001),\n    notional:`,
  `    maxContractVolume: input.maxContractVolume == null ? undefined : number(input.maxContractVolume, "manualPaper.fill.maxContractVolume", 0.000000000001),\n    entryDepthFill: depthEvidence(input.entryDepthFill,"manualPaper.fill.entryDepthFill"),\n    notional:`
);
