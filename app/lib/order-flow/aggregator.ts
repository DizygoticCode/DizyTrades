import type { BookView, LiquidityObservation, RawTrade, VolumeBubble } from "./types.ts";
import type { MexcDeal } from "../market/realtime.ts";
import { percentile } from "./normalisation.ts";

export type AggregatorOptions={historyMs:number;maxCells:number;maxBubbles:number;timeBucketMs:number;priceStep:number};
export function automaticPriceStep(metadata:{priceUnit?:string;priceScale?:number;pricePrecision?:number}){
  const unit=Number(metadata.priceUnit);if(Number.isFinite(unit)&&unit>0)return unit;
  const scale=metadata.priceScale??metadata.pricePrecision;return Number.isInteger(scale)&&scale!>=0?10**(-scale!):1;
}
export class FlowAggregator {
  heatmap:LiquidityObservation[]=[]; trades:RawTrade[]=[];
  captureStarted:number|null=null;captureEnded:number|null=null;
  private lastLevels=new Map<number,{bid:number;ask:number}>(); private ids=new Set<string>();
  private options:AggregatorOptions;
  constructor(options:Partial<AggregatorOptions>={}){this.options={historyMs:1_800_000,maxCells:50_000,maxBubbles:5_000,timeBucketMs:1_000,priceStep:.1,...options};}
  configure(options:Partial<AggregatorOptions>){this.options={...this.options,...options};}
  get priceStep(){return this.options.priceStep;}
  clear(){this.heatmap=[];this.trades=[];this.captureStarted=null;this.captureEnded=null;this.lastLevels.clear();this.ids.clear();}
  captureBook(book:BookView,contractSize:number,timeMs:number,rangeBps=50){
    if(!Number.isFinite(contractSize)||contractSize<=0)return;const bid=book.bids[0]?.price,ask=book.asks[0]?.price;if(!bid||!ask)return;
    this.captureStarted??=timeMs;this.captureEnded=timeMs;const mid=(bid+ask)/2,low=mid*(1-rangeBps/10_000),high=mid*(1+rangeBps/10_000),observation=new Map<number,{bid:number;ask:number}>();
    for(const [side,levels] of [["bid",book.bids],["ask",book.asks]] as const)for(const level of levels){if(level.price<low||level.price>high)continue;const tick=Math.round(level.price/this.options.priceStep),cell=observation.get(tick)??{bid:0,ask:0};cell[side]+=level.contractQuantity*contractSize;observation.set(tick,cell);}
    // Only levels inside this snapshot's transmitted active range may be removed.
    // This prevents a narrow update from erasing unrelated last-known depth.
    for(const [tick,previous] of this.lastLevels)if(tick*this.options.priceStep>=low&&tick*this.options.priceStep<=high&&!observation.has(tick))observation.set(tick,{bid:previous.bid?0:previous.bid,ask:previous.ask?0:previous.ask});
    for(const [priceTick,value] of observation){const previous=this.lastLevels.get(priceTick);if(!previous||previous.bid!==value.bid||previous.ask!==value.ask)this.heatmap.push({timestampMs:timeMs,priceTick,bidQuantity:value.bid,askQuantity:value.ask});this.lastLevels.set(priceTick,value);}
    this.prune(timeMs);
  }
  addDeal(deal:MexcDeal,bucketMs=this.options.timeBucketMs,priceStep=this.options.priceStep){
    void bucketMs;void priceStep;
    if(this.ids.has(deal.tradeId))return false;this.ids.add(deal.tradeId);if(this.ids.size>10_000)this.ids=new Set([...this.ids].slice(-5_000));
    const quantity=Number.isFinite(deal.baseQuantity)?deal.baseQuantity:deal.contractQuantity;this.trades.push({tradeId:deal.tradeId,timestampMs:deal.timeMs,price:deal.price,quantity,notional:deal.notional,side:deal.side});this.prune(deal.timeMs);return true;
  }
  private prune(now:number){const cutoff=now-this.options.historyMs,lastBefore=new Map<number,LiquidityObservation>();for(const value of this.heatmap)if(value.timestampMs<cutoff)lastBefore.set(value.priceTick,value);this.heatmap=[...[...lastBefore.values()].map(value=>({...value,timestampMs:cutoff})),...this.heatmap.filter(value=>value.timestampMs>=cutoff)];if(this.heatmap.length>this.options.maxCells){const excess=this.heatmap.length-this.options.maxCells,old=this.heatmap.slice(0,excess*2).filter((_,i)=>i%2===1);this.heatmap=[...old,...this.heatmap.slice(excess*2)].slice(-this.options.maxCells)}while(this.trades.length>this.options.maxBubbles)this.trades.shift();}
}
export function aggregateTrades(trades:readonly RawTrade[],projectX:(time:number)=>number|null,projectY:(price:number)=>number|null,neighbour=3){const groups:VolumeBubble[]=[];for(const trade of trades){const x=projectX(trade.timestampMs),y=projectY(trade.price);if(x==null||y==null)continue;let bubble=groups.find(v=>Math.abs((v as VolumeBubble&{x:number}).x-x)<=1&&Math.abs((v as VolumeBubble&{y:number}).y-y)<=neighbour) as (VolumeBubble&{x:number;y:number})|undefined;if(!bubble){bubble={x,y,timeMs:0,price:0,buyNotional:0,sellNotional:0,buyQuantity:0,sellQuantity:0,tradeCount:0};groups.push(bubble)}const old=bubble.buyNotional+bubble.sellNotional,total=old+trade.notional;bubble.timeMs=(bubble.timeMs*old+trade.timestampMs*trade.notional)/total;bubble.price=(bubble.price*old+trade.price*trade.notional)/total;bubble[trade.side==="buy"?"buyNotional":"sellNotional"]+=trade.notional;bubble[trade.side==="buy"?"buyQuantity":"sellQuantity"]+=trade.quantity;bubble.tradeCount++}return groups}
export function bubbleRadius(notional:number,threshold:number,min=3,max=24){if(notional<threshold)return 0;return Math.min(max,Math.max(min,min+Math.sqrt(notional-threshold)/Math.max(1,Math.sqrt(threshold))));}
export function bubbleThreshold(totals:readonly number[],settings:{adaptive:boolean;minimumSamples:number;percentile:number;minimumNotional:number}){const adaptiveThreshold=settings.adaptive&&totals.length>=settings.minimumSamples?percentile([...totals],settings.percentile):0;return Math.max(settings.minimumNotional,adaptiveThreshold)}
export function bubbleComposition(bubble:VolumeBubble){const total=bubble.buyNotional+bubble.sellNotional;return{total,buyRatio:total?bubble.buyNotional/total:0,sellRatio:total?bubble.sellNotional/total:0,delta:bubble.buyNotional-bubble.sellNotional,aggressorPercent:total?Math.max(bubble.buyNotional,bubble.sellNotional)/total:0,dominant:bubble.buyNotional>=bubble.sellNotional?"buy" as const:"sell" as const};}
export function mergePixelColumns<T extends {x:number;notional:number}>(items:T[]){const map=new Map<number,T>();for(const item of items){const x=Math.round(item.x),old=map.get(x);if(!old||item.notional>old.notional)map.set(x,{...item,x});}return [...map.values()];}
