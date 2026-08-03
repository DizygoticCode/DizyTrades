import { replaceExact, write } from "./utils.mjs";

await write(
  "app/api/manual-paper/route.ts",
  `import {NextResponse} from "next/server";
import {requireApiUser} from "../../lib/auth";
import {appendAudit} from "../../lib/store";
import {closeManualPosition,flattenManualPositions,latestPublicContractMetadata,latestPublicFundingHistory,latestPublicFundingRate,latestPublicPrice,latestPublicRiskPrice,ManualPaperError,markManualPosition,partialCloseManualPosition,readManualAccount,resetManualAccount,reverseManualPosition,submitManualOrder,syncManualFunding,updateManualSettings} from "../../lib/manual-paper";
export const runtime="nodejs";export const dynamic="force-dynamic";
const attempts=new Map<string,{at:number;count:number}>();function limited(id:string){const now=Date.now(),old=attempts.get(id),value=!old||now-old.at>60_000?{at:now,count:1}:{at:old.at,count:old.count+1};attempts.set(id,value);return value.count>20}
const apiError=(code:string,field:string,message:string,status=400)=>NextResponse.json({error:{code,field,message}},{status});
async function publicFunding(symbol:string){let current:Awaited<ReturnType<typeof latestPublicFundingRate>>|null=null,history:Awaited<ReturnType<typeof latestPublicFundingHistory>>=[];try{current=await latestPublicFundingRate(symbol)}catch{/* Funding preview remains explicitly unavailable. */}try{history=await latestPublicFundingHistory(symbol)}catch{/* Funding catch-up remains explicitly unavailable. */}return {current,history}}
export async function GET(request:Request){const user=await requireApiUser();if(!user)return apiError("UNAUTHORISED","session","Unauthorised",401);let account=await readManualAccount(user.id),riskPrice=null,contract=null,funding=null;const symbol=new URL(request.url).searchParams.get("symbol");if(symbol){try{contract=await latestPublicContractMetadata(symbol)}catch{/* Contract metadata remains explicitly unavailable. */}const fundingData=await publicFunding(symbol);funding=fundingData.current;if(account.positions[symbol]){try{const selected=await latestPublicRiskPrice(symbol,account.positions[symbol].lastRiskPrice);riskPrice=selected;if(user.role!=="viewer")account=await markManualPosition(user.id,symbol,selected.price,selected.source,fundingData.current??undefined,fundingData.history)}catch{/* Preserve the last valid risk mark and funding state. */}}}return NextResponse.json({account,readOnly:user.role==="viewer",riskPrice,contract,funding})}
export async function POST(request:Request){const user=await requireApiUser();if(!user)return apiError("UNAUTHORISED","session","Unauthorised",401);if(user.role==="viewer")return apiError("VIEWER_READ_ONLY","session","Viewer sessions are read-only.",403);if(limited(user.id))return apiError("RATE_LIMITED","request","Rate limit exceeded.",429);try{const body=await request.json() as Record<string,unknown>;let account;if(body.action==="reset")account=await resetManualAccount(user.id,String(body.confirmation));else if(body.action==="settings")account=await updateManualSettings(user.id,body.settings as never);else if(body.action==="flatten-all"){const current=await readManualAccount(user.id),entries=await Promise.all(Object.keys(current.positions).map(async symbol=>{const risk=await latestPublicRiskPrice(symbol,current.positions[symbol].lastRiskPrice),fundingData=await publicFunding(symbol);await syncManualFunding(user.id,symbol,risk.price,risk.source,fundingData.current??undefined,fundingData.history);return [symbol,risk.price] as const}));account=await flattenManualPositions(user.id,String(body.idempotencyKey),Object.fromEntries(entries))}else{const symbol=String(body.symbol??""),risk=await latestPublicRiskPrice(symbol),fundingData=await publicFunding(symbol),before=await readManualAccount(user.id);if(before.positions[symbol])await syncManualFunding(user.id,symbol,risk.price,risk.source,fundingData.current??undefined,fundingData.history);account=body.action==="close"||body.action==="flash-close"?await closeManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price):body.action==="partial-close"?await partialCloseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,body):body.action==="reverse"?await reverseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price):await submitManualOrder(user.id,body as never,risk.price,risk.source,await latestPublicContractMetadata(symbol),fundingData.current??undefined)}await appendAudit(user.id,"manual-paper."+String(body.action??"order"),{symbol:body.symbol});return NextResponse.json({account})}catch(error){if(error instanceof ManualPaperError)return apiError(error.code,error.field,error.message);return apiError("INVALID_REQUEST","request","Invalid request.")}}
`
);

await replaceExact(
  "app/lib/manual-paper-backup.ts",
  `  type ManualFill,\n  type ManualPosition,`,
  `  type ManualFill,\n  type ManualFundingPayment,\n  type ManualPosition,`
);
await replaceExact(
  "app/lib/manual-paper-backup.ts",
  `    takerFeeRate: input.takerFeeRate == null ? undefined : number(input.takerFeeRate, "manualPaper.position.takerFeeRate", 0, 1),`,
  `    takerFeeRate: input.takerFeeRate == null ? undefined : number(input.takerFeeRate, "manualPaper.position.takerFeeRate", 0, 1),\n    fundingRate: input.fundingRate == null ? undefined : number(input.fundingRate, "manualPaper.position.fundingRate", -1, 1),\n    fundingMinRate: input.fundingMinRate == null ? undefined : number(input.fundingMinRate, "manualPaper.position.fundingMinRate", -1, 1),\n    fundingMaxRate: input.fundingMaxRate == null ? undefined : number(input.fundingMaxRate, "manualPaper.position.fundingMaxRate", -1, 1),\n    fundingCollectCycleHours: input.fundingCollectCycleHours == null ? undefined : number(input.fundingCollectCycleHours, "manualPaper.position.fundingCollectCycleHours", 0.01, 168),\n    nextFundingTime: input.nextFundingTime == null ? undefined : number(input.nextFundingTime, "manualPaper.position.nextFundingTime", 1),\n    fundingSource: input.fundingSource == null ? undefined : oneOf(input.fundingSource, "manualPaper.position.fundingSource", ["mexc-public-funding-rate"] as const),\n    fundingObservedAt: input.fundingObservedAt == null ? undefined : number(input.fundingObservedAt, "manualPaper.position.fundingObservedAt", 1),\n    fundingPnl: input.fundingPnl == null ? undefined : number(input.fundingPnl, "manualPaper.position.fundingPnl"),\n    lastFundingSettlementAt: input.lastFundingSettlementAt == null ? undefined : number(input.lastFundingSettlementAt, "manualPaper.position.lastFundingSettlementAt", 1),`
);
await replaceExact(
  "app/lib/manual-paper-backup.ts",
  `    liquidationPenalty: input.liquidationPenalty == null ? undefined : number(input.liquidationPenalty, "manualPaper.fill.liquidationPenalty", 0),`,
  `    liquidationPenalty: input.liquidationPenalty == null ? undefined : number(input.liquidationPenalty, "manualPaper.fill.liquidationPenalty", 0),\n    fundingPnl: input.fundingPnl == null ? undefined : number(input.fundingPnl, "manualPaper.fill.fundingPnl"),`
);
await replaceExact(
  "app/lib/manual-paper-backup.ts",
  `export function validateManualPaperBackup(value: unknown, ownerId: string): ManualAccount {`,
  `function fundingPayment(value:unknown,index:number):ManualFundingPayment{const input=object(value,\`manualPaper.fundingPayments.\${index}\`);return Object.freeze({paymentId:string(input.paymentId,"manualPaper.fundingPayment.paymentId",300),tradeId:string(input.tradeId,"manualPaper.fundingPayment.tradeId",300),userId:string(input.userId,"manualPaper.fundingPayment.userId",120),symbol:symbol(input.symbol,"manualPaper.fundingPayment.symbol"),side:oneOf(input.side,"manualPaper.fundingPayment.side",["long","short"] as const),settleTime:number(input.settleTime,"manualPaper.fundingPayment.settleTime",1),observedAt:number(input.observedAt,"manualPaper.fundingPayment.observedAt",1),price:number(input.price,"manualPaper.fundingPayment.price",0.000000000001),priceSource:oneOf(input.priceSource,"manualPaper.fundingPayment.priceSource",["fair","last"] as const),quantity:number(input.quantity,"manualPaper.fundingPayment.quantity",0.000000000001),notional:number(input.notional,"manualPaper.fundingPayment.notional",0),fundingRate:number(input.fundingRate,"manualPaper.fundingPayment.fundingRate",-1,1),calculatedCashDelta:number(input.calculatedCashDelta,"manualPaper.fundingPayment.calculatedCashDelta"),cashDelta:number(input.cashDelta,"manualPaper.fundingPayment.cashDelta"),balanceCapped:boolean(input.balanceCapped,"manualPaper.fundingPayment.balanceCapped"),source:oneOf(input.source,"manualPaper.fundingPayment.source",["mexc-public-funding-history"] as const),calculationMethod:oneOf(input.calculationMethod,"manualPaper.fundingPayment.calculationMethod",["observed-risk-price-notional"] as const),resultingBalance:number(input.resultingBalance,"manualPaper.fundingPayment.resultingBalance",0)})}\n\nexport function validateManualPaperBackup(value: unknown, ownerId: string): ManualAccount {`
);
await replaceExact(
  "app/lib/manual-paper-backup.ts",
  `  const fills = input.fills.map(fill);`,
  `  const fills = input.fills.map(fill);\n  const fundingInput=input.fundingPayments??[];\n  if(!Array.isArray(fundingInput)||fundingInput.length>1_000)throw new Error("Manual Paper funding history is invalid.");\n  const fundingPayments=fundingInput.map(fundingPayment);\n  if(fundingPayments.some(item=>item.userId!==ownerId))throw new Error("Manual Paper funding owner mismatch.");`
);
await replaceExact(
  "app/lib/manual-paper-backup.ts",
  `    fees: number(input.fees, "manualPaper.fees", 0),`,
  `    fees: number(input.fees, "manualPaper.fees", 0),\n    fundingPnl: input.fundingPnl==null?0:number(input.fundingPnl, "manualPaper.fundingPnl"),\n    fundingPayments: Object.freeze(fundingPayments) as unknown as ManualFundingPayment[],`
);
await replaceExact(
  "app/lib/manual-paper-backup.ts",
  `    account.fills.length === 0 &&`,
  `    account.fills.length === 0 &&\n    account.fundingPayments.length === 0 &&\n    account.fundingPnl === 0 &&`
);
