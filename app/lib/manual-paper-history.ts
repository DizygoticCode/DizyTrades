import "server-only";

import {createHash} from "node:crypto";

export const MANUAL_PAPER_ACCOUNT_VERSION=4 as const;
export const MANUAL_PAPER_HISTORY_SCHEMA_VERSION=1 as const;
export const MANUAL_PAPER_PRESERVATION_POLICY="recorded-economic-values-v1" as const;

export type ManualPaperSourceVersion=2|3|4;
export type ManualPaperHistoryGeneration="legacy-static-v2"|"v3-evidence-transition"|"fidelity-v2";
export type ManualPaperFillHistory=Readonly<{
 schemaVersion:typeof MANUAL_PAPER_HISTORY_SCHEMA_VERSION;
 generation:ManualPaperHistoryGeneration;
 sourceAccountVersion:ManualPaperSourceVersion;
 migrated:boolean;
 preservationPolicy:typeof MANUAL_PAPER_PRESERVATION_POLICY;
 economicRecordHash:string;
 unavailableEvidence:readonly string[];
}>;
export type ManualPaperMigrationLedger=Readonly<{
 schemaVersion:typeof MANUAL_PAPER_HISTORY_SCHEMA_VERSION;
 sourceAccountVersion:ManualPaperSourceVersion;
 targetAccountVersion:typeof MANUAL_PAPER_ACCOUNT_VERSION;
 migrated:boolean;
 preservationPolicy:typeof MANUAL_PAPER_PRESERVATION_POLICY;
 appliedSteps:readonly string[];
 fillCount:number;
 fundingPaymentCount:number;
 historyContentHash:string;
}>;

const ECONOMIC_FIELDS=[
 "orderId","fillId","tradeId","idempotencyKey","userId","symbol","side","marginMode","leverage",
 "price","entryPrice","quantity","contractVolume","contractSize","notional","marginUsed","fee","entryFee",
 "exitFee","tradingFee","liquidationPenalty","fundingPnl","grossPnl","netPnl","realisedPnl","resultingBalance",
 "timestamp","openedAt","closeReason"
] as const;

const record=(value:unknown):Record<string,unknown>=>{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Manual Paper history value must be an object.");
 return value as Record<string,unknown>
};
const canonical=(value:unknown):unknown=>{
 if(value===null||typeof value==="string"||typeof value==="boolean")return value;
 if(typeof value==="number"){
  if(!Number.isFinite(value))throw new Error("Manual Paper history contains a non-finite number.");
  return value
 }
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([,item])=>item!==undefined).sort(([left],[right])=>left.localeCompare(right)).map(([key,item])=>[key,canonical(item)]));
 throw new Error("Manual Paper history contains an unsupported value.")
};
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const sourceVersion=(value:unknown):ManualPaperSourceVersion=>{
 if(value!==2&&value!==3&&value!==4)throw new Error("Unsupported Manual Paper source version.");
 return value
};
const stringArray=(value:unknown,field:string)=>{
 if(!Array.isArray(value)||value.length>50)throw new Error(field+" is invalid.");
 const items=value.map(item=>{if(typeof item!=="string"||!item||item.length>100)throw new Error(field+" is invalid.");return item});
 if(new Set(items).size!==items.length)throw new Error(field+" contains duplicates.");
 return Object.freeze(items)
};

export function manualPaperEconomicRecord(value:unknown){
 const input=record(value);
 return Object.freeze(Object.fromEntries(ECONOMIC_FIELDS.filter(key=>input[key]!==undefined).map(key=>[key,input[key]])))
}
export function manualPaperEconomicHash(value:unknown){return hash(manualPaperEconomicRecord(value))}

export function manualPaperUnavailableEvidence(value:unknown){
 const input=record(value),missing:string[]=[];
 if(input.contractVolume==null||input.contractSize==null||input.priceUnit==null||input.volUnit==null)missing.push("contract-precision");
 if(input.feeSource==null||input.feeRate==null||input.executionType==null||input.liquidityRole==null)missing.push("fee-provenance");
 if(input.side==="close"){
  if(input.exitDepthFill==null)missing.push("visible-depth-exit");
  if(input.reduceOnly==null)missing.push("reduce-only");
  if(input.marginSettlement==null)missing.push("margin-settlement");
  if(input.fundingPnl==null)missing.push("funding-attribution")
 }else if(input.entryDepthFill==null)missing.push("visible-depth-entry");
 if(input.riskTier==null)missing.push("maintenance-tier");
 if(input.liquidationAudit==null)missing.push("liquidation-audit");
 if(input.marginAudit==null)missing.push("margin-support");
 return Object.freeze([...new Set(missing)].sort())
}

export function classifyManualPaperFill(value:unknown,source:ManualPaperSourceVersion):ManualPaperHistoryGeneration{
 const input=record(value);
 if(source===2)return "legacy-static-v2";
 if(input.riskTier!=null||input.liquidationAudit!=null||input.marginAudit!=null||input.marginSettlement!=null||input.entryDepthFill!=null||input.exitDepthFill!=null||input.reduceOnly!=null||input.feeSource!=null||input.fundingPnl!=null)return "fidelity-v2";
 return "v3-evidence-transition"
}

export function createManualPaperFillHistory(value:unknown,source:ManualPaperSourceVersion,migrated:boolean):ManualPaperFillHistory{
 return Object.freeze({
  schemaVersion:MANUAL_PAPER_HISTORY_SCHEMA_VERSION,
  generation:classifyManualPaperFill(value,source),
  sourceAccountVersion:source,
  migrated,
  preservationPolicy:MANUAL_PAPER_PRESERVATION_POLICY,
  economicRecordHash:manualPaperEconomicHash(value),
  unavailableEvidence:manualPaperUnavailableEvidence(value)
 })
}

const fundingRecord=(value:unknown)=>{
 const input=record(value);
 return Object.freeze(Object.fromEntries(Object.entries(input).filter(([key])=>key!=="history").sort(([left],[right])=>left.localeCompare(right))))
};
export function manualPaperHistoryContentHash(fills:readonly unknown[],fundingPayments:readonly unknown[]){
 return hash({
  fills:fills.map(item=>{const input=record(item),history=record(input.history);return {fillId:input.fillId,economicRecordHash:history.economicRecordHash}}),
  fundingPayments:fundingPayments.map(fundingRecord)
 })
}

export function normaliseManualPaperHistory(value:Record<string,unknown>,sourceInput:unknown,extraSteps:readonly string[]=[]){
 const source=sourceVersion(sourceInput),fills=Array.isArray(value.fills)?value.fills:[],fundingPayments=Array.isArray(value.fundingPayments)?value.fundingPayments:[],prior=value.migration&&typeof value.migration==="object"&&!Array.isArray(value.migration)?value.migration as Record<string,unknown>:null;
 let annotated=false;
 const normalisedFills=fills.map(item=>{
  const fill=record(item);
  if(fill.history!=null)return fill;
  annotated=true;
  return Object.freeze({...fill,history:createManualPaperFillHistory(fill,source,source!==4)})
 });
 const steps:string[]=[];
 if(prior&&Array.isArray(prior.appliedSteps))for(const item of prior.appliedSteps)if(typeof item==="string"&&item&&!steps.includes(item))steps.push(item);
 if(source===2)for(const item of ["upgrade-account-v2-to-v4","default-v3-risk-and-funding-fields","rebuild-active-risk-state-from-recorded-position"])if(!steps.includes(item))steps.push(item);
 if(source===3)for(const item of ["upgrade-account-v3-to-v4","rebuild-active-risk-state-from-recorded-position"])if(!steps.includes(item))steps.push(item);
 if(source!==4&&annotated&&!steps.includes("annotate-fill-history-provenance"))steps.push("annotate-fill-history-provenance");
 for(const item of extraSteps)if(item&&!steps.includes(item))steps.push(item);
 const ledgerSource=prior?.sourceAccountVersion===2||prior?.sourceAccountVersion===3||prior?.sourceAccountVersion===4?prior.sourceAccountVersion as ManualPaperSourceVersion:source;
 const ledger:ManualPaperMigrationLedger=Object.freeze({
  schemaVersion:MANUAL_PAPER_HISTORY_SCHEMA_VERSION,
  sourceAccountVersion:ledgerSource,
  targetAccountVersion:MANUAL_PAPER_ACCOUNT_VERSION,
  migrated:ledgerSource!==4||steps.length>0,
  preservationPolicy:MANUAL_PAPER_PRESERVATION_POLICY,
  appliedSteps:Object.freeze(steps),
  fillCount:normalisedFills.length,
  fundingPaymentCount:fundingPayments.length,
  historyContentHash:manualPaperHistoryContentHash(normalisedFills,fundingPayments)
 });
 return {...value,version:MANUAL_PAPER_ACCOUNT_VERSION,fills:normalisedFills,migration:ledger}
}

export function validateManualPaperFillHistory(value:unknown):ManualPaperFillHistory{
 const fill=record(value),input=record(fill.history),schema=input.schemaVersion;
 if(schema!==MANUAL_PAPER_HISTORY_SCHEMA_VERSION)throw new Error("Unsupported Manual Paper fill history schema.");
 const source=sourceVersion(input.sourceAccountVersion),generation=input.generation;
 if(generation!=="legacy-static-v2"&&generation!=="v3-evidence-transition"&&generation!=="fidelity-v2")throw new Error("Manual Paper fill history generation is invalid.");
 if(typeof input.migrated!=="boolean")throw new Error("Manual Paper fill migration state is invalid.");
 if(input.preservationPolicy!==MANUAL_PAPER_PRESERVATION_POLICY)throw new Error("Manual Paper fill preservation policy is invalid.");
 if(typeof input.economicRecordHash!=="string"||!/^[a-f0-9]{64}$/.test(input.economicRecordHash))throw new Error("Manual Paper fill economic hash is invalid.");
 const unavailable=stringArray(input.unavailableEvidence,"Manual Paper fill unavailable evidence"),expectedUnavailable=manualPaperUnavailableEvidence(fill),expectedHash=manualPaperEconomicHash(fill),expectedGeneration=classifyManualPaperFill(fill,source);
 if(input.economicRecordHash!==expectedHash)throw new Error("Manual Paper historical economic values changed after provenance was recorded.");
 if(generation!==expectedGeneration)throw new Error("Manual Paper fill history generation contradicts its evidence.");
 if(JSON.stringify(unavailable)!==JSON.stringify(expectedUnavailable))throw new Error("Manual Paper unavailable evidence does not reconcile.");
 if(input.migrated!==(source!==4))throw new Error("Manual Paper fill migration state contradicts its source version.");
 return Object.freeze({schemaVersion:MANUAL_PAPER_HISTORY_SCHEMA_VERSION,generation,sourceAccountVersion:source,migrated:input.migrated,preservationPolicy:MANUAL_PAPER_PRESERVATION_POLICY,economicRecordHash:input.economicRecordHash,unavailableEvidence:unavailable})
}

export function validateManualPaperMigrationLedger(value:unknown,fills:readonly unknown[],fundingPayments:readonly unknown[]):ManualPaperMigrationLedger{
 const input=record(value);
 if(input.schemaVersion!==MANUAL_PAPER_HISTORY_SCHEMA_VERSION)throw new Error("Unsupported Manual Paper migration ledger schema.");
 const source=sourceVersion(input.sourceAccountVersion);
 if(input.targetAccountVersion!==MANUAL_PAPER_ACCOUNT_VERSION)throw new Error("Manual Paper migration target version is invalid.");
 if(typeof input.migrated!=="boolean"||input.migrated!==(source!==4||Array.isArray(input.appliedSteps)&&input.appliedSteps.length>0))throw new Error("Manual Paper migration state does not reconcile.");
 if(input.preservationPolicy!==MANUAL_PAPER_PRESERVATION_POLICY)throw new Error("Manual Paper migration preservation policy is invalid.");
 const steps=stringArray(input.appliedSteps,"Manual Paper migration steps");
 if(input.fillCount!==fills.length||input.fundingPaymentCount!==fundingPayments.length)throw new Error("Manual Paper migration record counts do not reconcile.");
 if(typeof input.historyContentHash!=="string"||!/^[a-f0-9]{64}$/.test(input.historyContentHash))throw new Error("Manual Paper history content hash is invalid.");
 for(const fill of fills)validateManualPaperFillHistory(fill);
 const expected=manualPaperHistoryContentHash(fills,fundingPayments);
 if(input.historyContentHash!==expected)throw new Error("Manual Paper history content hash does not reconcile.");
 return Object.freeze({schemaVersion:MANUAL_PAPER_HISTORY_SCHEMA_VERSION,sourceAccountVersion:source,targetAccountVersion:MANUAL_PAPER_ACCOUNT_VERSION,migrated:input.migrated,preservationPolicy:MANUAL_PAPER_PRESERVATION_POLICY,appliedSteps:steps,fillCount:fills.length,fundingPaymentCount:fundingPayments.length,historyContentHash:expected})
}
