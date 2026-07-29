import type { BookView, LiquidityObservation, RawTrade, VolumeBubble } from "./types.ts";
import type { MexcDeal } from "../market/realtime.ts";
import { percentile } from "./normalisation.ts";

export type AggregatorOptions={historyMs:number;maxCells:number;maxBubbles:number;timeBucketMs:number;priceStep:number};
const LOW_MEMORY_MODE=process.env.DIZYFLOW_LOW_MEMORY_MODE!=="false";
const MAX_LEVELS_PER_SIDE=Math.max(1,Math.floor(Number(process.env.DIZYFLOW_MAX_LEVELS_PER_SIDE)||(LOW_MEMORY_MODE?100:500)));
const MAX_HEATMAP_RECORDS=Math.max(100,Math.floor(Number(process.env.DIZYFLOW_MAX_HEATMAP_RECORDS)||(LOW_MEMORY_MODE?5_000:50_000)));
const MAX_HISTORY_MS=Math.max(60_000,(Number(process.env.DIZYFLOW_HISTORY_MINUTES)||(LOW_MEMORY_MODE?5:30))*60_000);
export function automaticPriceStep(metadata:{priceUnit?:string;priceScale?:number;pricePrecision?:number}){
  const unit=Number(metadata.priceUnit);if(Number.isFinite(unit)&&unit>0)return unit;
  const scale=metadata.priceScale??metadata.pricePrecision;return Number.isInteger(scale)&&scale!>=0?10**(-scale!):1;
}
export class FlowAggregator {
  heatmap:LiquidityObservation[]=[]; trades:RawTrade[]=[];
  captureStarted:number|null=null;captureEnded:number|null=null;
  private lastLevels=new Map<number,{price:number;bid:number;ask:number}>(); private ids=new Set<string>();
  private options:AggregatorOptions;
  constructor(options:Partial<AggregatorOptions>={}){this.options=this.bounded({historyMs:MAX_HISTORY_MS,maxCells:MAX_HEATMAP_RECORDS,maxBubbles:5_000,timeBucketMs:1_000,priceStep:.1,...options});}
  configure(options:Partial<AggregatorOptions>){this.options=this.bounded({...this.options,...options});}
  private bounded(options:AggregatorOptions){return{...options,historyMs:Math.min(options.historyMs,MAX_HISTORY_MS),maxCells:Math.min(options.maxCells,MAX_HEATMAP_RECORDS)};}
  get priceStep(){return this.options.priceStep;}
  clear(){this.heatmap=[];this.trades=[];this.captureStarted=null;this.captureEnded=null;this.lastLevels.clear();this.ids.clear();}
  captureBook(book:BookView,contractSize:number,timeMs:number,rangeBps=50){
    if(!Number.isFinite(contractSize)||contractSize<=0||!book.bids.length||!book.asks.length)return;
    this.captureStarted??=timeMs;this.captureEnded=timeMs;const midpoint=(book.bids[0].price+book.asks[0].price)/2,span=midpoint*Math.max(0,rangeBps)/10_000,low=midpoint-span,high=midpoint+span,observation=new Map<number,{bid:number;ask:number}>();
    for(const [side,levels] of [["bid",book.bids],["ask",book.asks]] as const)for(const level of levels.slice(0,MAX_LEVELS_PER_SIDE)){if(level.price<low||level.price>high)continue;const tick=Math.round(level.price/this.options.priceStep),cell=observation.get(tick)??{bid:0,ask:0};cell[side]+=level.contractQuantity*contractSize;observation.set(tick,cell);}
    // Only levels inside this snapshot's transmitted active range may be removed.
    // This prevents a narrow update from erasing unrelated last-known depth.
    for(const [tick,previous] of this.lastLevels)if(previous.price>=low&&previous.price<=high&&!observation.has(tick))observation.set(tick,{bid:previous.bid?0:previous.bid,ask:previous.ask?0:previous.ask});
    for(const [priceTick,value] of observation){const previous=this.lastLevels.get(priceTick),price=priceTick*this.options.priceStep;if(!previous||previous.bid!==value.bid||previous.ask!==value.ask)this.heatmap.push({timestampMs:timeMs,price,priceTick,capturedPriceStep:this.options.priceStep,bidQuantity:value.bid,askQuantity:value.ask});this.lastLevels.set(priceTick,{price,...value});}
    this.prune(timeMs);globalThis.__dizyFlowHeatmapRecords=this.heatmap.length;
  }
  addDeal(deal:MexcDeal,bucketMs=this.options.timeBucketMs,priceStep=this.options.priceStep){
    void bucketMs;void priceStep;
    if(this.ids.has(deal.tradeId))return false;this.ids.add(deal.tradeId);if(this.ids.size>10_000)this.ids=new Set([...this.ids].slice(-5_000));
    const quantity=Number.isFinite(deal.baseQuantity)?deal.baseQuantity:deal.contractQuantity;this.trades.push({tradeId:deal.tradeId,timestampMs:deal.timeMs,price:deal.price,quantity,notional:deal.notional,side:deal.side});this.prune(deal.timeMs);return true;
  }
  private prune(now:number){const cutoff=now-this.options.historyMs,lastBefore=new Map<number,LiquidityObservation>();for(const value of this.heatmap)if(value.timestampMs<cutoff)lastBefore.set(value.priceTick,value);this.heatmap=[...[...lastBefore.values()].map(value=>({...value,timestampMs:cutoff})),...this.heatmap.filter(value=>value.timestampMs>=cutoff)];if(this.heatmap.length>this.options.maxCells){const excess=this.heatmap.length-this.options.maxCells,old=this.heatmap.slice(0,excess*2).filter((_,i)=>i%2===1);this.heatmap=[...old,...this.heatmap.slice(excess*2)].slice(-this.options.maxCells)}while(this.trades.length>this.options.maxBubbles)this.trades.shift();}
}
/** Aggregate exclusively in exchange time/price space; viewport projection is deliberately absent. */
export function aggregateTrades(trades:readonly RawTrade[],symbol="UNKNOWN",timeBucketMs=1000,priceStep=.1){const groups=new Map<string,VolumeBubble>();for(const trade of trades){const timeBucket=Math.floor(trade.timestampMs/timeBucketMs),priceBucket=Math.round(trade.price/priceStep),id=`${symbol}:${timeBucket}:${priceBucket}`;let bubble=groups.get(id);if(!bubble){bubble={id,timeBucket,priceBucket,timeMs:0,price:0,buyNotional:0,sellNotional:0,buyQuantity:0,sellQuantity:0,tradeCount:0};groups.set(id,bubble)}const old=bubble.buyNotional+bubble.sellNotional,total=old+trade.notional;bubble.timeMs=(bubble.timeMs*old+trade.timestampMs*trade.notional)/total;bubble.price=(bubble.price*old+trade.price*trade.notional)/total;bubble[trade.side==="buy"?"buyNotional":"sellNotional"]+=trade.notional;bubble[trade.side==="buy"?"buyQuantity":"sellQuantity"]+=trade.quantity;bubble.tradeCount++}return [...groups.values()]}
export function bubbleRadius(notional:number,threshold:number,min=3,max=24){if(notional<threshold)return 0;return Math.min(max,Math.max(min,min+Math.sqrt(notional-threshold)/Math.max(1,Math.sqrt(threshold))));}
export function bubbleThreshold(totals:readonly number[],settings:{adaptive:boolean;minimumSamples:number;percentile:number;minimumNotional:number}){const adaptiveThreshold=settings.adaptive&&totals.length>=settings.minimumSamples?percentile([...totals],settings.percentile):0;return Math.max(settings.minimumNotional,adaptiveThreshold)}
export function bubbleComposition(bubble:VolumeBubble){const total=bubble.buyNotional+bubble.sellNotional;return{total,buyRatio:total?bubble.buyNotional/total:0,sellRatio:total?bubble.sellNotional/total:0,delta:bubble.buyNotional-bubble.sellNotional,aggressorPercent:total?Math.max(bubble.buyNotional,bubble.sellNotional)/total:0,dominant:bubble.buyNotional>=bubble.sellNotional?"buy" as const:"sell" as const};}
export function mergePixelColumns<T extends {x:number;notional:number}>(items:T[]){const map=new Map<number,T>();for(const item of items){const x=Math.round(item.x),old=map.get(x);if(!old||item.notional>old.notional)map.set(x,{...item,x});}return [...map.values()];}
