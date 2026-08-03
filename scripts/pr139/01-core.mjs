import { mkdir } from "node:fs/promises";
import { replaceExact, replaceRegex, write } from "./utils.mjs";

await mkdir("app/lib", { recursive: true });
await mkdir("tests", { recursive: true });

await write(
  "app/lib/manual-paper-funding.ts",
  `export type MexcFundingRateSnapshot = Readonly<{
  symbol: string;
  fundingRate: number;
  minFundingRate: number;
  maxFundingRate: number;
  collectCycleHours: number;
  nextSettleTime: number;
  observedAt: number;
  source: "mexc-public-funding-rate";
}>;

export type MexcFundingSettlement = Readonly<{
  symbol: string;
  fundingRate: number;
  settleTime: number;
  source: "mexc-public-funding-history";
}>;

const finite = (value: unknown, field: string) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(\`Invalid MEXC funding \${field}.\`);
  return parsed;
};
const positive = (value: unknown, field: string) => {
  const parsed = finite(value, field);
  if (parsed <= 0) throw new Error(\`Invalid MEXC funding \${field}.\`);
  return parsed;
};
const timestamp = (value: unknown, field: string) => {
  const parsed = positive(value, field);
  if (!Number.isSafeInteger(parsed)) throw new Error(\`Invalid MEXC funding \${field}.\`);
  return parsed;
};
const symbol = (value: unknown, expected?: string) => {
  if (typeof value !== "string" || !/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(value))
    throw new Error("Invalid MEXC funding symbol.");
  if (expected && value !== expected) throw new Error("MEXC funding symbol mismatch.");
  return value;
};

export function parseMexcFundingRate(
  payload: unknown,
  expectedSymbol?: string,
  observedAt = Date.now(),
): MexcFundingRateSnapshot {
  if (!payload || typeof payload !== "object") throw new Error("Invalid MEXC funding response.");
  const response = payload as { success?: unknown; data?: unknown };
  if (response.success === false || !response.data || typeof response.data !== "object")
    throw new Error("MEXC funding rate is unavailable.");
  const input = response.data as Record<string, unknown>;
  const fundingRate = finite(input.fundingRate, "rate");
  const minFundingRate = finite(input.minFundingRate, "minimum rate");
  const maxFundingRate = finite(input.maxFundingRate, "maximum rate");
  if (maxFundingRate < minFundingRate || fundingRate < minFundingRate || fundingRate > maxFundingRate)
    throw new Error("Invalid MEXC funding rate range.");
  return Object.freeze({
    symbol: symbol(input.symbol, expectedSymbol),
    fundingRate,
    minFundingRate,
    maxFundingRate,
    collectCycleHours: positive(input.collectCycle, "collection cycle"),
    nextSettleTime: timestamp(input.nextSettleTime, "next settlement time"),
    observedAt: timestamp(observedAt, "observation time"),
    source: "mexc-public-funding-rate",
  });
}

export function parseMexcFundingHistory(
  payload: unknown,
  expectedSymbol?: string,
): readonly MexcFundingSettlement[] {
  if (!payload || typeof payload !== "object") throw new Error("Invalid MEXC funding history response.");
  const response = payload as { success?: unknown; data?: unknown };
  if (response.success === false || !response.data || typeof response.data !== "object")
    throw new Error("MEXC funding history is unavailable.");
  const resultList = (response.data as { resultList?: unknown }).resultList;
  if (!Array.isArray(resultList)) throw new Error("Invalid MEXC funding history.");
  return Object.freeze(resultList.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid MEXC funding settlement.");
    const input = item as Record<string, unknown>;
    return Object.freeze({
      symbol: symbol(input.symbol, expectedSymbol),
      fundingRate: finite(input.fundingRate, "history rate"),
      settleTime: timestamp(input.settleTime, "settlement time"),
      source: "mexc-public-funding-history" as const,
    });
  }).sort((a, b) => a.settleTime - b.settleTime));
}

export function dueMexcFundingSettlements(
  history: readonly MexcFundingSettlement[],
  openedAt: number,
  lastSettlementAt: number | null | undefined,
  observedAt = Date.now(),
) {
  const lowerBound = Math.max(openedAt, lastSettlementAt ?? openedAt);
  return history.filter((item) => item.settleTime > lowerBound && item.settleTime <= observedAt);
}

export function calculatePaperFundingPayment(input: {
  side: "long" | "short";
  quantity: number;
  observedPrice: number;
  fundingRate: number;
}) {
  const { side, quantity, observedPrice, fundingRate } = input;
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(observedPrice) || observedPrice <= 0 || !Number.isFinite(fundingRate))
    throw new Error("Invalid paper funding calculation.");
  const notional = quantity * observedPrice;
  const calculatedCashDelta = (side === "long" ? -1 : 1) * notional * fundingRate;
  return Object.freeze({ notional, calculatedCashDelta });
}
`
);

await replaceExact(
  "app/lib/manual-paper.ts",
  `import {mexcPublicMarketTakerFeeSnapshot,paperExecutionFee,positionMarketTakerFeeSnapshot,type PaperExecutionType,type PaperFeeSource,type PaperLiquidityRole} from "./manual-paper-fees";`,
  `import {mexcPublicMarketTakerFeeSnapshot,paperExecutionFee,positionMarketTakerFeeSnapshot,type PaperExecutionType,type PaperFeeSource,type PaperLiquidityRole} from "./manual-paper-fees";\nimport {calculatePaperFundingPayment,dueMexcFundingSettlements,parseMexcFundingHistory,parseMexcFundingRate,type MexcFundingRateSnapshot,type MexcFundingSettlement} from "./manual-paper-funding";`
);

await replaceRegex(
  "app/lib/manual-paper.ts",
  /export type ManualPosition=\{.*?\};/s,
  `export type ManualFundingPayment={paymentId:string;tradeId:string;userId:string;symbol:string;side:ManualSide;settleTime:number;observedAt:number;price:number;priceSource:RiskPriceSource;quantity:number;notional:number;fundingRate:number;calculatedCashDelta:number;cashDelta:number;balanceCapped:boolean;source:"mexc-public-funding-history";calculationMethod:"observed-risk-price-notional";resultingBalance:number};\nexport type ManualPosition={tradeId:string;marketKey:string;marketType:"futures";symbol:string;side:ManualSide;quantity:number;contractVolume?:number;contractSize?:number;priceUnit?:number;volUnit?:number;minContractVolume?:number;maxContractVolume?:number;entryPrice:number;leverage:number;margin:number;marginMode:MarginMode;stopLoss:number|null;takeProfit:number|null;estimatedLiquidation:number;entryFee:number;executionType?:PaperExecutionType;liquidityRole?:PaperLiquidityRole;feeRate?:number;feeSource?:PaperFeeSource;makerFeeRate?:number;takerFeeRate?:number;fundingRate?:number;fundingMinRate?:number;fundingMaxRate?:number;fundingCollectCycleHours?:number;nextFundingTime?:number;fundingSource?:"mexc-public-funding-rate";fundingObservedAt?:number;fundingPnl?:number;lastFundingSettlementAt?:number;riskPriceSource:RiskPriceSource;lastRiskPrice:number;openedAt:string};`
);
await replaceRegex(
  "app/lib/manual-paper.ts",
  /export type ManualFill=\{.*?\};/s,
  `export type ManualFill={orderId:string;fillId:string;tradeId?:string;marketKey?:string;marketType?:"futures";historicalDizyFlow?:HistoricalDizyFlowReference;idempotencyKey:string;userId:string;symbol:string;side:ManualSide|"close";marginMode?:MarginMode;leverage?:number;price:number;entryPrice?:number;quantity:number;contractVolume?:number;contractSize?:number;priceUnit?:number;volUnit?:number;minContractVolume?:number;maxContractVolume?:number;notional:number;marginUsed?:number;stopLoss?:number|null;takeProfit?:number|null;estimatedLiquidation?:number;riskPriceSource?:RiskPriceSource;entryFee?:number;exitFee?:number;executionType?:PaperExecutionType;liquidityRole?:PaperLiquidityRole;feeRate?:number;feeSource?:PaperFeeSource;makerFeeRate?:number;takerFeeRate?:number;tradingFee?:number;liquidationPenalty?:number;fundingPnl?:number;fee:number;timestamp:string;openedAt?:string;closeReason?:CloseReason;grossPnl?:number;netPnl?:number;realisedPnl:number;resultingBalance:number};`
);
await replaceRegex(
  "app/lib/manual-paper.ts",
  /export type ManualAccount=\{.*?\};/s,
  `export type ManualAccount={version:3;cashBalance:number;startingBalance:number;realisedPnl:number;fees:number;fundingPnl:number;fundingPayments:ManualFundingPayment[];positions:Record<string,ManualPosition>;fills:ManualFill[];idempotencyKeys:string[];settings:ManualSettings;updatedAt:string};`
);

await replaceExact(
  "app/lib/manual-paper.ts",
  `export const newManualAccount=():ManualAccount=>({version:3,cashBalance:10_000,startingBalance:10_000,realisedPnl:0,fees:0,positions:{},fills:[],idempotencyKeys:[],settings:{...DEFAULT_MANUAL_SETTINGS},updatedAt:new Date(0).toISOString()});`,
  `export const newManualAccount=():ManualAccount=>({version:3,cashBalance:10_000,startingBalance:10_000,realisedPnl:0,fees:0,fundingPnl:0,fundingPayments:[],positions:{},fills:[],idempotencyKeys:[],settings:{...DEFAULT_MANUAL_SETTINGS},updatedAt:new Date(0).toISOString()});`
);
await replaceExact(
  "app/lib/manual-paper.ts",
  `return {...base,...raw,positions,version:3,settings:{...DEFAULT_MANUAL_SETTINGS,...raw.settings}} as ManualAccount`,
  `return {...base,...raw,positions,fundingPnl:raw.fundingPnl??0,fundingPayments:Array.isArray(raw.fundingPayments)?raw.fundingPayments:[],version:3,settings:{...DEFAULT_MANUAL_SETTINGS,...raw.settings}} as ManualAccount`
);

await replaceExact(
  "app/lib/manual-paper.ts",
  `function validatedContractOrder`,
  `const fundingRateCache=new Map<string,{at:number;value:MexcFundingRateSnapshot}>();\nexport async function latestPublicFundingRate(symbol:string){if(!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol))fail("INVALID_SYMBOL","symbol","Invalid market symbol.");const cached=fundingRateCache.get(symbol),now=Date.now();if(cached&&now-cached.at<30_000)return cached.value;const response=await fetch(\`https://contract.mexc.com/api/v1/contract/funding_rate/\${encodeURIComponent(symbol)}\`,{signal:AbortSignal.timeout(5000),cache:"no-store"});if(!response.ok)fail("FUNDING_UNAVAILABLE","funding","Current public MEXC funding rate is unavailable.");try{const value=parseMexcFundingRate(await response.json(),symbol,now);fundingRateCache.set(symbol,{at:now,value});return value}catch{return fail("FUNDING_UNAVAILABLE","funding","Current public MEXC funding rate is unavailable.")}}\nexport async function latestPublicFundingHistory(symbol:string){if(!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol))fail("INVALID_SYMBOL","symbol","Invalid market symbol.");const response=await fetch(\`https://contract.mexc.com/api/v1/contract/funding_rate/history?symbol=\${encodeURIComponent(symbol)}&page_num=1&page_size=100\`,{signal:AbortSignal.timeout(5000),cache:"no-store"});if(!response.ok)fail("FUNDING_HISTORY_UNAVAILABLE","funding","Public MEXC funding history is unavailable.");try{return parseMexcFundingHistory(await response.json(),symbol)}catch{return fail("FUNDING_HISTORY_UNAVAILABLE","funding","Public MEXC funding history is unavailable.")}}\nfunction fundingPositionSnapshot(funding?:MexcFundingRateSnapshot){return funding?{fundingRate:funding.fundingRate,fundingMinRate:funding.minFundingRate,fundingMaxRate:funding.maxFundingRate,fundingCollectCycleHours:funding.collectCycleHours,nextFundingTime:funding.nextSettleTime,fundingSource:funding.source,fundingObservedAt:funding.observedAt}:{} as const}\nfunction applyFundingHistory(account:ManualAccount,userId:string,position:ManualPosition,riskPrice:number,priceSource:RiskPriceSource,current?:MexcFundingRateSnapshot,history:readonly MexcFundingSettlement[]=[]){const observedAt=Date.now(),due=dueMexcFundingSettlements(history,Date.parse(position.openedAt),position.lastFundingSettlementAt,observedAt);for(const settlement of due){const paymentId=\`\${position.tradeId}:\${settlement.settleTime}\`;if(account.fundingPayments.some(payment=>payment.paymentId===paymentId))continue;const calculated=calculatePaperFundingPayment({side:position.side,quantity:position.quantity,observedPrice:riskPrice,fundingRate:settlement.fundingRate}),before=account.cashBalance,after=Math.max(0,before+calculated.calculatedCashDelta),cashDelta=after-before;account.cashBalance=after;account.fundingPnl+=cashDelta;account.realisedPnl+=cashDelta;position.fundingPnl=(position.fundingPnl??0)+cashDelta;position.lastFundingSettlementAt=settlement.settleTime;account.fundingPayments.push({paymentId,tradeId:position.tradeId,userId,symbol:position.symbol,side:position.side,settleTime:settlement.settleTime,observedAt,price:riskPrice,priceSource,quantity:position.quantity,notional:calculated.notional,fundingRate:settlement.fundingRate,calculatedCashDelta:calculated.calculatedCashDelta,cashDelta,balanceCapped:Math.abs(cashDelta-calculated.calculatedCashDelta)>1e-12,source:settlement.source,calculationMethod:"observed-risk-price-notional",resultingBalance:account.cashBalance})}if(current?.symbol===position.symbol)Object.assign(position,fundingPositionSnapshot(current));account.fundingPayments=account.fundingPayments.slice(-1000)}\nfunction validatedContractOrder`
);

await replaceExact(
  "app/lib/manual-paper.ts",
  `contract?:MexcContractMetadata){return serial`,
  `contract?:MexcContractMetadata,funding?:MexcFundingRateSnapshot){return serial`
);
