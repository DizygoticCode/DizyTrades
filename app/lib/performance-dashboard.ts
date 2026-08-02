import type { JournalEntry } from "./journal-model";
import { journalSampleLevel, type JournalSampleLevel } from "./journal-statistics";

export type PerformanceCurvePoint = Readonly<{
  index: number;
  tradeId: string;
  symbol: string;
  closeTime: string;
  pnl: number;
  cumulativePnl: number;
  peakPnl: number;
  drawdown: number;
}>;

export type PerformanceBucket = Readonly<{
  key: string;
  label: string;
  trades: number;
  wins: number;
  losses: number;
  flat: number;
  winRatePct: number | null;
  netPnl: number;
  averagePnl: number | null;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  averageR: number | null;
  rSampleSize: number;
  sampleLevel: JournalSampleLevel;
}>;

export type PerformanceRBucket = Readonly<{
  key: string;
  label: string;
  trades: number;
  percentage: number;
}>;

export type PerformanceDashboard = Readonly<{
  generatedAt: string;
  includesArchived: boolean;
  currencyLabel: string;
  reviewedTrades: number;
  wins: number;
  losses: number;
  flat: number;
  winRatePct: number | null;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  averagePnl: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  payoffRatio: number | null;
  maximumDrawdown: number;
  maximumWinStreak: number;
  maximumLossStreak: number;
  totalFees: number;
  feeSampleSize: number;
  feeCoveragePct: number;
  averageR: number | null;
  medianR: number | null;
  rSampleSize: number;
  averageHoldingMinutes: number | null;
  holdingSampleSize: number;
  curve: readonly PerformanceCurvePoint[];
  rDistribution: readonly PerformanceRBucket[];
  bySymbol: readonly PerformanceBucket[];
  byTimeframe: readonly PerformanceBucket[];
  byDirection: readonly PerformanceBucket[];
  byCloseReason: readonly PerformanceBucket[];
  warnings: readonly Readonly<{code:string;message:string}>[];
}>;

type TradeFact = Readonly<{
  tradeId: string;
  symbol: string;
  timeframe: string;
  direction: "long" | "short";
  closeReason: string;
  openTime: string;
  closeTime: string;
  pnl: number;
  fees: number | null;
  rMultiple: number | null;
}>;

type Acc = {
  key: string;
  label: string;
  trades: number;
  wins: number;
  losses: number;
  flat: number;
  pnl: number;
  grossProfit: number;
  grossLoss: number;
  r: number;
  rN: number;
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const acc = (key:string,label:string):Acc=>({key,label,trades:0,wins:0,losses:0,flat:0,pnl:0,grossProfit:0,grossLoss:0,r:0,rN:0});
const add = (target:Acc,trade:TradeFact)=>{
  target.trades++;
  target.pnl+=trade.pnl;
  if(trade.pnl>0){target.wins++;target.grossProfit+=trade.pnl;}
  else if(trade.pnl<0){target.losses++;target.grossLoss+=Math.abs(trade.pnl);}
  else target.flat++;
  if(trade.rMultiple!==null){target.r+=trade.rMultiple;target.rN++;}
};
const bucket = (value:Acc):PerformanceBucket=>Object.freeze({
  key:value.key,label:value.label,trades:value.trades,wins:value.wins,losses:value.losses,flat:value.flat,
  winRatePct:value.trades?value.wins/value.trades*100:null,netPnl:value.pnl,averagePnl:value.trades?value.pnl/value.trades:null,
  grossProfit:value.grossProfit,grossLoss:value.grossLoss,profitFactor:value.grossLoss>0?value.grossProfit/value.grossLoss:null,
  averageR:value.rN?value.r/value.rN:null,rSampleSize:value.rN,sampleLevel:journalSampleLevel(value.trades),
});
const median=(values:readonly number[])=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;};
const coverage=(sample:number,total:number)=>total?sample/total*100:0;
const keyLabel=(value:string)=>value.trim()||"Unavailable";

export function journalPerformanceFacts(entries:readonly JournalEntry[],includeArchived=false):TradeFact[]{
  return entries.flatMap(entry=>{
    if(entry.type!=="trade-review"||!entry.trade||(!includeArchived&&entry.archived)||!finite(entry.trade.pnl))return [];
    const open=new Date(entry.trade.openTime),close=new Date(entry.trade.closeTime);
    if(!Number.isFinite(open.getTime())||!Number.isFinite(close.getTime()))return [];
    return [Object.freeze({
      tradeId:entry.trade.tradeId,symbol:keyLabel(entry.trade.symbol),timeframe:keyLabel(entry.trade.timeframe),direction:entry.trade.direction,
      closeReason:keyLabel(entry.trade.closeReason),openTime:open.toISOString(),closeTime:close.toISOString(),pnl:entry.trade.pnl,
      fees:finite(entry.trade.fees)?Math.max(0,entry.trade.fees):null,rMultiple:finite(entry.trade.rMultiple)?entry.trade.rMultiple:null,
    })];
  }).sort((a,b)=>a.closeTime.localeCompare(b.closeTime)||a.tradeId.localeCompare(b.tradeId));
}

function aggregateBy(trades:readonly TradeFact[],selector:(trade:TradeFact)=>readonly [string,string]):PerformanceBucket[]{
  const groups=new Map<string,Acc>();
  for(const trade of trades){const [key,label]=selector(trade);let value=groups.get(key);if(!value){value=acc(key,label);groups.set(key,value);}add(value,trade);}
  return [...groups.values()].map(bucket).sort((a,b)=>b.trades-a.trades||b.netPnl-a.netPnl||a.label.localeCompare(b.label));
}

function rDistribution(values:readonly number[]):PerformanceRBucket[]{
  const definitions=[
    ["lt-minus-2","≤ -2R",(value:number)=>value<=-2],
    ["minus-2-minus-1","-2R to -1R",(value:number)=>value>-2&&value<=-1],
    ["minus-1-zero","-1R to 0R",(value:number)=>value>-1&&value<0],
    ["zero","0R",(value:number)=>value===0],
    ["zero-one","0R to 1R",(value:number)=>value>0&&value<1],
    ["one-two","1R to 2R",(value:number)=>value>=1&&value<2],
    ["gte-two","≥ 2R",(value:number)=>value>=2],
  ] as const;
  return definitions.map(([key,label,match])=>{const trades=values.filter(match).length;return Object.freeze({key,label,trades,percentage:values.length?trades/values.length*100:0});});
}

export function aggregatePerformanceDashboard(entries:readonly JournalEntry[],options:Readonly<{includeArchived?:boolean;generatedAt?:string}>={}):PerformanceDashboard{
  const includeArchived=options.includeArchived===true,trades=journalPerformanceFacts(entries,includeArchived),overall=acc("overall","Overall");
  let cumulative=0,peak=0,maximumDrawdown=0,winStreak=0,lossStreak=0,maximumWinStreak=0,maximumLossStreak=0,fees=0,feeN=0,holding=0,holdingN=0;
  const rValues:number[]=[],curve:PerformanceCurvePoint[]=[];
  for(const [index,trade] of trades.entries()){
    add(overall,trade);
    cumulative+=trade.pnl;peak=Math.max(peak,cumulative);const drawdown=Math.max(0,peak-cumulative);maximumDrawdown=Math.max(maximumDrawdown,drawdown);
    if(trade.pnl>0){winStreak++;lossStreak=0;maximumWinStreak=Math.max(maximumWinStreak,winStreak);}else if(trade.pnl<0){lossStreak++;winStreak=0;maximumLossStreak=Math.max(maximumLossStreak,lossStreak);}else{winStreak=0;lossStreak=0;}
    if(trade.fees!==null){fees+=trade.fees;feeN++;}if(trade.rMultiple!==null)rValues.push(trade.rMultiple);
    const duration=(new Date(trade.closeTime).getTime()-new Date(trade.openTime).getTime())/60000;if(Number.isFinite(duration)&&duration>=0){holding+=duration;holdingN++;}
    curve.push(Object.freeze({index:index+1,tradeId:trade.tradeId,symbol:trade.symbol,closeTime:trade.closeTime,pnl:trade.pnl,cumulativePnl:cumulative,peakPnl:peak,drawdown}));
  }
  const value=bucket(overall),averageWin=overall.wins?overall.grossProfit/overall.wins:null,averageLoss=overall.losses?-overall.grossLoss/overall.losses:null;
  const warnings:Readonly<{code:string;message:string}>[]=[];
  if(!trades.length)warnings.push({code:"NO_DATA",message:"No completed Journal Trade Reviews are available for performance analysis."});
  else if(trades.length<5)warnings.push({code:"VERY_SMALL_SAMPLE",message:"Very small sample: metrics may change materially after only a few additional trades."});
  else if(trades.length<20)warnings.push({code:"LIMITED_SAMPLE",message:"Limited sample: use these results for review, not prediction."});
  if(feeN<trades.length)warnings.push({code:"PARTIAL_FEES",message:`Fees are recorded for ${feeN} of ${trades.length} reviewed trades; fee totals are incomplete.`});
  if(rValues.length<trades.length)warnings.push({code:"PARTIAL_R",message:`R-multiple is recorded for ${rValues.length} of ${trades.length} reviewed trades.`});
  warnings.push({code:"CURVE_BOUNDARY",message:"The curve is cumulative realised PnL across reviewed trades, not account equity, and excludes unjournalled activity, deposits and withdrawals."});
  return Object.freeze({
    generatedAt:options.generatedAt??"1970-01-01T00:00:00.000Z",includesArchived:includeArchived,currencyLabel:"USDT simulation",
    reviewedTrades:value.trades,wins:value.wins,losses:value.losses,flat:value.flat,winRatePct:value.winRatePct,netPnl:value.netPnl,
    grossProfit:value.grossProfit,grossLoss:value.grossLoss,averagePnl:value.averagePnl,averageWin,averageLoss,expectancy:value.averagePnl,
    profitFactor:value.profitFactor,payoffRatio:averageWin!==null&&averageLoss!==null&&averageLoss!==0?averageWin/Math.abs(averageLoss):null,
    maximumDrawdown,maximumWinStreak,maximumLossStreak,totalFees:fees,feeSampleSize:feeN,feeCoveragePct:coverage(feeN,trades.length),
    averageR:rValues.length?rValues.reduce((sum,item)=>sum+item,0)/rValues.length:null,medianR:median(rValues),rSampleSize:rValues.length,
    averageHoldingMinutes:holdingN?holding/holdingN:null,holdingSampleSize:holdingN,curve:Object.freeze(curve),rDistribution:Object.freeze(rDistribution(rValues)),
    bySymbol:Object.freeze(aggregateBy(trades,trade=>[trade.symbol,trade.symbol])),byTimeframe:Object.freeze(aggregateBy(trades,trade=>[trade.timeframe,trade.timeframe])),
    byDirection:Object.freeze(aggregateBy(trades,trade=>[trade.direction,trade.direction==="long"?"Long":"Short"])),
    byCloseReason:Object.freeze(aggregateBy(trades,trade=>[trade.closeReason.toLocaleLowerCase(),trade.closeReason])),warnings:Object.freeze(warnings),
  });
}
