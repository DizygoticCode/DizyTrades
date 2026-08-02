import { replace, replaceAllChecked } from './utils.mjs';

await replace(
  'app/lib/manual-paper.ts',
  'import type {HistoricalDizyFlowReference} from "./journal-model";\n',
  'import type {HistoricalDizyFlowReference} from "./journal-model";\nimport {parseMexcContractMetadata,type MexcContractMetadata} from "./mexc-contract-metadata";\n',
);
await replace(
  'app/lib/manual-paper.ts',
  'export function calculateManualSizing(input:{sizeMode:ManualSizeMode;amount:unknown;leverage:unknown;side?:ManualSide;stopLoss?:unknown},equity:number,price:number){\n const leverageValue=number(input.leverage);if(leverageValue===null||leverageValue<1||leverageValue>20)fail("INVALID_LEVERAGE","leverage","Leverage must be between 1× and 20×.");',
  'export function calculateManualSizing(input:{sizeMode:ManualSizeMode;amount:unknown;leverage:unknown;side?:ManualSide;stopLoss?:unknown;maxLeverage?:unknown},equity:number,price:number){\n const maxLeverage=number(input.maxLeverage)??20,leverageValue=number(input.leverage);if(leverageValue===null||leverageValue<1||leverageValue>maxLeverage)fail("INVALID_LEVERAGE","leverage",`Leverage must be between 1× and ${maxLeverage}× for this contract.`);',
);
await replace(
  'app/lib/manual-paper.ts',
  'try{const result=sizePaperPosition({mode:input.sizeMode,amount,leverage,equity,price,side:input.side??"long",stopLoss:number(input.stopLoss)});',
  'try{const result=sizePaperPosition({mode:input.sizeMode,amount,leverage,equity,price,side:input.side??"long",stopLoss:number(input.stopLoss),maxLeverage});',
);
await replace(
  'app/lib/manual-paper.ts',
  'export async function latestPublicPrice(symbol:string){return (await latestPublicRiskPrice(symbol)).price}\n',
  `export async function latestPublicPrice(symbol:string){return (await latestPublicRiskPrice(symbol)).price}\nconst contractMetadataCache=new Map<string,{at:number;value:MexcContractMetadata}>();\nexport async function latestPublicContractMetadata(symbol:string){if(!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol))fail("INVALID_SYMBOL","symbol","Invalid market symbol.");const cached=contractMetadataCache.get(symbol),now=Date.now();if(cached&&now-cached.at<300_000)return cached.value;const response=await fetch(\`https://api.mexc.com/api/v1/contract/detail?symbol=\${encodeURIComponent(symbol)}\`,{signal:AbortSignal.timeout(5000),cache:"no-store"});if(!response.ok)fail("CONTRACT_METADATA_UNAVAILABLE","symbol","Current public MEXC contract rules are unavailable.");try{const value=parseMexcContractMetadata(await response.json(),symbol);contractMetadataCache.set(symbol,{at:now,value});return value}catch{return fail("CONTRACT_METADATA_UNAVAILABLE","symbol","Current public MEXC contract rules are unavailable.")}}\n`,
);
await replace(
  'app/lib/manual-paper.ts',
  'export async function submitManualOrder(userId:string,input:{idempotencyKey:string;symbol:string;side:ManualSide;sizeMode:ManualSizeMode;amount:unknown;leverage?:unknown;marginMode?:MarginMode;stopLoss?:unknown;takeProfit?:unknown;confirmReverse?:boolean},marketPrice:number,riskPriceSource:RiskPriceSource="last"){return serial(userId,async()=>{',
  'export async function submitManualOrder(userId:string,input:{idempotencyKey:string;symbol:string;side:ManualSide;sizeMode:ManualSizeMode;amount:unknown;leverage?:unknown;marginMode?:MarginMode;stopLoss?:unknown;takeProfit?:unknown;confirmReverse?:boolean},marketPrice:number,riskPriceSource:RiskPriceSource="last",contract?:MexcContractMetadata){return serial(userId,async()=>{',
);
await replace(
  'app/lib/manual-paper.ts',
  'const equity=manualEquity(account,{[input.symbol]:marketPrice}),sizing=calculateManualSizing({...input,leverage:input.leverage??1,side:input.side},equity,marketPrice),available=equity-usedManualMargin(account);',
  'const equity=manualEquity(account,{[input.symbol]:marketPrice}),sizing=calculateManualSizing({...input,leverage:input.leverage??1,side:input.side,maxLeverage:contract?.maxLeverage??20},equity,marketPrice),available=equity-usedManualMargin(account);',
);
await replace(
  'app/lib/manual-paper.ts',
  'maintenanceMarginRate:account.settings.maintenanceMarginPct/100,liquidationPenaltyRate:',
  'maintenanceMarginRate:contract?.maintenanceMarginRate??account.settings.maintenanceMarginPct/100,liquidationPenaltyRate:',
);

await replace(
  'app/api/manual-paper/route.ts',
  'import {closeManualPosition,flattenManualPositions,latestPublicPrice,latestPublicRiskPrice,ManualPaperError,markManualPosition,partialCloseManualPosition,readManualAccount,resetManualAccount,reverseManualPosition,submitManualOrder,updateManualSettings} from "../../lib/manual-paper";',
  'import {closeManualPosition,flattenManualPositions,latestPublicContractMetadata,latestPublicPrice,latestPublicRiskPrice,ManualPaperError,markManualPosition,partialCloseManualPosition,readManualAccount,resetManualAccount,reverseManualPosition,submitManualOrder,updateManualSettings} from "../../lib/manual-paper";',
);
await replace(
  'app/api/manual-paper/route.ts',
  'export async function GET(request:Request){const user=await requireApiUser();if(!user)return apiError("UNAUTHORISED","session","Unauthorised",401);let account=await readManualAccount(user.id),riskPrice=null;const symbol=new URL(request.url).searchParams.get("symbol");if(symbol&&account.positions[symbol]){try{{const selected=await latestPublicRiskPrice(symbol,account.positions[symbol].lastRiskPrice);riskPrice=selected;if(user.role!=="viewer")account=await markManualPosition(user.id,symbol,selected.price,selected.source)}}catch{/* Preserve the last valid risk mark; the UI labels it stale. */}}return NextResponse.json({account,readOnly:user.role==="viewer",riskPrice})}',
  'export async function GET(request:Request){const user=await requireApiUser();if(!user)return apiError("UNAUTHORISED","session","Unauthorised",401);let account=await readManualAccount(user.id),riskPrice=null,contract=null;const symbol=new URL(request.url).searchParams.get("symbol");if(symbol){try{contract=await latestPublicContractMetadata(symbol)}catch{/* Contract metadata remains explicitly unavailable. */}if(account.positions[symbol]){try{{const selected=await latestPublicRiskPrice(symbol,account.positions[symbol].lastRiskPrice);riskPrice=selected;if(user.role!=="viewer")account=await markManualPosition(user.id,symbol,selected.price,selected.source)}}catch{/* Preserve the last valid risk mark; the UI labels it stale. */}}}return NextResponse.json({account,readOnly:user.role==="viewer",riskPrice,contract})}',
);
await replace(
  'app/api/manual-paper/route.ts',
  'else{const symbol=String(body.symbol??""),risk=await latestPublicRiskPrice(symbol);account=body.action==="close"||body.action==="flash-close"?await closeManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price):body.action==="partial-close"?await partialCloseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,body):body.action==="reverse"?await reverseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price):await submitManualOrder(user.id,body as never,risk.price,risk.source)}',
  'else{const symbol=String(body.symbol??""),risk=await latestPublicRiskPrice(symbol);account=body.action==="close"||body.action==="flash-close"?await closeManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price):body.action==="partial-close"?await partialCloseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,body):body.action==="reverse"?await reverseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price):await submitManualOrder(user.id,body as never,risk.price,risk.source,await latestPublicContractMetadata(symbol))}',
);

await replaceAllChecked('app/lib/manual-paper-backup.ts', '1, 20', '1, 1_000', 3);
