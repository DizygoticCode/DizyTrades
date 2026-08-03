import {readFile,writeFile} from "node:fs/promises";

const replaceOnce=(source,from,to,label)=>{const index=source.indexOf(from);if(index<0)throw new Error("Missing "+label);if(source.indexOf(from,index+from.length)>=0)throw new Error("Ambiguous "+label);return source.slice(0,index)+to+source.slice(index+from.length)};
let source=await readFile("app/lib/manual-paper.ts","utf8");

source=replaceOnce(source,
 'import {buildPaperMarginAccountSnapshot,buildPaperPositionMarginAudit,settlePaperMarginCash,type PaperMarginAccountSnapshot,type PaperMarginPositionInput,type PaperMarginSettlementAudit,type PaperPositionMarginAudit} from "./manual-paper-margin-model";\n',
 'import {buildPaperMarginAccountSnapshot,buildPaperPositionMarginAudit,settlePaperMarginCash,type PaperMarginAccountSnapshot,type PaperMarginPositionInput,type PaperMarginSettlementAudit,type PaperPositionMarginAudit} from "./manual-paper-margin-model";\nimport {MANUAL_PAPER_ACCOUNT_VERSION,normaliseManualPaperHistory,type ManualPaperFillHistory,type ManualPaperMigrationLedger} from "./manual-paper-history";\n',
 "history import");
source=replaceOnce(source,
 'export type ManualFill={orderId:string;fillId:string;tradeId?:string;marketKey?:string;marketType?:"futures";historicalDizyFlow?:HistoricalDizyFlowReference;idempotencyKey:string;userId:string;symbol:string;side:ManualSide|"close";marginMode?:MarginMode;leverage?:number;price:number;entryPrice?:number;quantity:number;contractVolume?:number;contractSize?:number;priceUnit?:number;volUnit?:number;minContractVolume?:number;maxContractVolume?:number;entryDepthFill?:PaperDepthFillEvidence;exitDepthFill?:PaperDepthFillEvidence;reduceOnly?:ManualReduceOnlyEvidence;notional:number;marginUsed?:number;stopLoss?:number|null;takeProfit?:number|null;estimatedLiquidation?:number;bankruptcyPrice?:number;riskTier?:PaperRiskTierSnapshot;liquidationAudit?:PaperLiquidationAudit;marginAudit?:PaperPositionMarginAudit;marginSettlement?:PaperMarginSettlementAudit;riskPriceSource?:RiskPriceSource;entryFee?:number;exitFee?:number;executionType?:PaperExecutionType;liquidityRole?:PaperLiquidityRole;feeRate?:number;feeSource?:PaperFeeSource;makerFeeRate?:number;takerFeeRate?:number;tradingFee?:number;liquidationPenalty?:number;fundingPnl?:number;fee:number;timestamp:string;openedAt?:string;riskExitTrigger?:ManualRiskExitTrigger;closeReason?:CloseReason;grossPnl?:number;netPnl?:number;realisedPnl:number;resultingBalance:number};',
 'export type ManualFill={orderId:string;fillId:string;tradeId?:string;marketKey?:string;marketType?:"futures";historicalDizyFlow?:HistoricalDizyFlowReference;idempotencyKey:string;userId:string;symbol:string;side:ManualSide|"close";marginMode?:MarginMode;leverage?:number;price:number;entryPrice?:number;quantity:number;contractVolume?:number;contractSize?:number;priceUnit?:number;volUnit?:number;minContractVolume?:number;maxContractVolume?:number;entryDepthFill?:PaperDepthFillEvidence;exitDepthFill?:PaperDepthFillEvidence;reduceOnly?:ManualReduceOnlyEvidence;notional:number;marginUsed?:number;stopLoss?:number|null;takeProfit?:number|null;estimatedLiquidation?:number;bankruptcyPrice?:number;riskTier?:PaperRiskTierSnapshot;liquidationAudit?:PaperLiquidationAudit;marginAudit?:PaperPositionMarginAudit;marginSettlement?:PaperMarginSettlementAudit;riskPriceSource?:RiskPriceSource;entryFee?:number;exitFee?:number;executionType?:PaperExecutionType;liquidityRole?:PaperLiquidityRole;feeRate?:number;feeSource?:PaperFeeSource;makerFeeRate?:number;takerFeeRate?:number;tradingFee?:number;liquidationPenalty?:number;fundingPnl?:number;fee:number;timestamp:string;openedAt?:string;riskExitTrigger?:ManualRiskExitTrigger;closeReason?:CloseReason;grossPnl?:number;netPnl?:number;realisedPnl:number;resultingBalance:number;history?:ManualPaperFillHistory};',
 "fill history type");
source=replaceOnce(source,
 'export type ManualAccount={version:3;cashBalance:number;startingBalance:number;realisedPnl:number;fees:number;fundingPnl:number;fundingPayments:ManualFundingPayment[];positions:Record<string,ManualPosition>;fills:ManualFill[];idempotencyKeys:string[];settings:ManualSettings;marginSnapshot?:PaperMarginAccountSnapshot;updatedAt:string};',
 'export type ManualAccount={version:typeof MANUAL_PAPER_ACCOUNT_VERSION;cashBalance:number;startingBalance:number;realisedPnl:number;fees:number;fundingPnl:number;fundingPayments:ManualFundingPayment[];positions:Record<string,ManualPosition>;fills:ManualFill[];idempotencyKeys:string[];settings:ManualSettings;marginSnapshot?:PaperMarginAccountSnapshot;migration:ManualPaperMigrationLedger;updatedAt:string};',
 "account version type");
source=replaceOnce(source,
 'export const newManualAccount=():ManualAccount=>({version:3,cashBalance:10_000,startingBalance:10_000,realisedPnl:0,fees:0,fundingPnl:0,fundingPayments:[],positions:{},fills:[],idempotencyKeys:[],settings:{...DEFAULT_MANUAL_SETTINGS},marginSnapshot:buildPaperMarginAccountSnapshot(10_000,[],0),updatedAt:new Date(0).toISOString()});',
 'export const newManualAccount=():ManualAccount=>normaliseManualPaperHistory({version:MANUAL_PAPER_ACCOUNT_VERSION,cashBalance:10_000,startingBalance:10_000,realisedPnl:0,fees:0,fundingPnl:0,fundingPayments:[],positions:{},fills:[],idempotencyKeys:[],settings:{...DEFAULT_MANUAL_SETTINGS},marginSnapshot:buildPaperMarginAccountSnapshot(10_000,[],0),updatedAt:new Date(0).toISOString()},MANUAL_PAPER_ACCOUNT_VERSION) as ManualAccount;',
 "new account");

const oldRead='export async function readManualAccount(userId:string){try{const raw=JSON.parse(await readFile(path(userId),"utf8")) as Partial<ManualAccount>&{version?:number;settings?:Partial<ManualSettings>};const base=newManualAccount(),positions=Object.fromEntries(Object.entries(raw.positions??{}).map(([symbol,p])=>{const old=p as Partial<ManualPosition>;const margin=old.margin??Number(old.quantity)*Number(old.entryPrice)/Math.max(1,Number(old.leverage));return [symbol,{...old,tradeId:old.tradeId??`legacy-${String(old.openedAt??"").replace(/\\W/g,"")}-${symbol}`,marketKey:old.marketKey??`mexc:futures:${symbol}`,marketType:"futures",symbol,margin,marginMode:old.marginMode??"isolated",entryFee:old.entryFee??0,riskPriceSource:old.riskPriceSource??"last",lastRiskPrice:old.lastRiskPrice??old.entryPrice,estimatedLiquidation:old.estimatedLiquidation??estimateLiquidation({side:old.side!,entryPrice:old.entryPrice!,quantity:old.quantity!,marginMode:"isolated",assignedMargin:margin,crossCollateral:Number(raw.cashBalance??base.cashBalance),entryFee:0})}] }));return refreshAccountRisk({...base,...raw,positions,fundingPnl:raw.fundingPnl??0,fundingPayments:Array.isArray(raw.fundingPayments)?raw.fundingPayments:[],version:3,settings:{...DEFAULT_MANUAL_SETTINGS,...raw.settings}} as ManualAccount)}catch{return newManualAccount()}}\nasync function writeManualAccount(userId:string,value:ManualAccount){await mkdir(join(root(),"manual-paper"),{recursive:true});const target=path(userId),temp=`${target}.${process.pid}.${Date.now()}.tmp`;await writeFile(temp,JSON.stringify(value,null,2)+"\\n",{mode:0o600});await rename(temp,target)}';
const newRead=String.raw`export function normaliseManualAccount(value:unknown):ManualAccount{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new ManualPaperError("ACCOUNT_MIGRATION_FAILED","account","Manual Paper account must be an object.");
 const raw=value as Partial<ManualAccount>&{version?:number;settings?:Partial<ManualSettings>},sourceVersion=raw.version;
 if(sourceVersion!==2&&sourceVersion!==3&&sourceVersion!==4)throw new ManualPaperError("ACCOUNT_MIGRATION_FAILED","account.version","Unsupported Manual Paper account version.");
 if(!raw.positions||typeof raw.positions!=="object"||Array.isArray(raw.positions))throw new ManualPaperError("ACCOUNT_MIGRATION_FAILED","account.positions","Manual Paper positions are invalid.");
 if(!Array.isArray(raw.fills)||!Array.isArray(raw.idempotencyKeys))throw new ManualPaperError("ACCOUNT_MIGRATION_FAILED","account.history","Manual Paper history is invalid.");
 const base=newManualAccount(),positions=Object.fromEntries(Object.entries(raw.positions).map(([symbol,p])=>{
  if(!p||typeof p!=="object"||Array.isArray(p))throw new ManualPaperError("ACCOUNT_MIGRATION_FAILED","account.positions","Manual Paper position is invalid.");
  const old=p as Partial<ManualPosition>,margin=old.margin??Number(old.quantity)*Number(old.entryPrice)/Math.max(1,Number(old.leverage));
  return [symbol,{...old,tradeId:old.tradeId??("legacy-"+String(old.openedAt??"").replace(/\W/g,"")+"-"+symbol),marketKey:old.marketKey??("mexc:futures:"+symbol),marketType:"futures",symbol,margin,marginMode:old.marginMode??"isolated",entryFee:old.entryFee??0,riskPriceSource:old.riskPriceSource??"last",lastRiskPrice:old.lastRiskPrice??old.entryPrice,estimatedLiquidation:old.estimatedLiquidation??estimateLiquidation({side:old.side!,entryPrice:old.entryPrice!,quantity:old.quantity!,marginMode:"isolated",assignedMargin:margin,crossCollateral:Number(raw.cashBalance??base.cashBalance),entryFee:0})}]
 })),steps:string[]=[];
 if(sourceVersion===2)steps.push("default-v3-settings","preserve-v2-fill-economics");
 if(sourceVersion===3)steps.push("preserve-v3-fill-economics");
 const account={...base,...raw,positions,fundingPnl:raw.fundingPnl??0,fundingPayments:Array.isArray(raw.fundingPayments)?raw.fundingPayments:[],version:MANUAL_PAPER_ACCOUNT_VERSION,settings:{...DEFAULT_MANUAL_SETTINGS,...raw.settings}} as ManualAccount;
 const capturedAt=typeof raw.marginSnapshot?.capturedAt==="number"&&Number.isFinite(raw.marginSnapshot.capturedAt)?raw.marginSnapshot.capturedAt:Number.isFinite(Date.parse(String(raw.updatedAt??"")))?Date.parse(String(raw.updatedAt)):0;
 refreshAccountRisk(account,capturedAt);
 return normaliseManualPaperHistory(account,sourceVersion,steps) as ManualAccount
}
export async function readManualAccount(userId:string){
 try{return normaliseManualAccount(JSON.parse(await readFile(path(userId),"utf8")))}catch(reason){
  if((reason as NodeJS.ErrnoException).code==="ENOENT")return newManualAccount();
  if(reason instanceof ManualPaperError)throw reason;
  throw new ManualPaperError("ACCOUNT_MIGRATION_FAILED","account",reason instanceof Error?reason.message:"Manual Paper account could not be migrated.")
 }
}
async function writeManualAccount(userId:string,value:ManualAccount){
 const normalised=normaliseManualAccount(value);Object.assign(value,normalised);
 await mkdir(join(root(),"manual-paper"),{recursive:true});const target=path(userId),temp=target+"."+process.pid+"."+Date.now()+".tmp";await writeFile(temp,JSON.stringify(normalised,null,2)+"\n",{mode:0o600});await rename(temp,target)
}`;
source=replaceOnce(source,oldRead,newRead,"account read/write migration");
source=replaceOnce(source,
 'function refreshAccountRisk(account:ManualAccount){const tiered=',
 'function refreshAccountRisk(account:ManualAccount,capturedAt=Date.now()){const tiered=',
 "risk refresh signature");
source=replaceOnce(source,
 'snapshot=buildPaperMarginAccountSnapshot(account.cashBalance,inputs);account.marginSnapshot=snapshot;',
 'snapshot=buildPaperMarginAccountSnapshot(account.cashBalance,inputs,capturedAt);account.marginSnapshot=snapshot;',
 "deterministic margin snapshot");

await writeFile("app/lib/manual-paper.ts",source,"utf8");
