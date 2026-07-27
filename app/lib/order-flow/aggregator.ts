import type { BookView, HeatmapCell, VolumeBubble } from "./types.ts";
import type { MexcDeal } from "../market/realtime.ts";

export type AggregatorOptions={historyMs:number;maxCells:number;maxBubbles:number;timeBucketMs:number;priceStep:number};
export class FlowAggregator {
  heatmap:HeatmapCell[]=[]; bubbles:VolumeBubble[]=[];
  private heatmapBuckets=new Map<string,HeatmapCell>(); private bubbleBuckets=new Map<string,VolumeBubble>(); private ids=new Set<string>();
  private options:AggregatorOptions;
  constructor(options:Partial<AggregatorOptions>={}){this.options={historyMs:1_800_000,maxCells:50_000,maxBubbles:5_000,timeBucketMs:1_000,priceStep:.1,...options};}
  configure(options:Partial<AggregatorOptions>){this.options={...this.options,...options};}
  clear(){this.heatmap=[];this.bubbles=[];this.heatmapBuckets.clear();this.bubbleBuckets.clear();this.ids.clear();}
  captureBook(book:BookView,contractSize:number,timeMs:number,rangeBps=50){
    if(!book.valid)return;const bid=book.bids[0]?.price,ask=book.asks[0]?.price;if(!bid||!ask)return;
    const mid=(bid+ask)/2,low=mid*(1-rangeBps/10_000),high=mid*(1+rangeBps/10_000),timeBucket=Math.floor(timeMs/this.options.timeBucketMs)*this.options.timeBucketMs;
    const observation=new Map<number,HeatmapCell>();
    for(const [side,levels] of [["bid",book.bids],["ask",book.asks]] as const)for(const level of levels){if(level.price<low||level.price>high)continue;const price=Math.round(level.price/this.options.priceStep)*this.options.priceStep,cell=observation.get(price)??{timeMs:timeBucket,price,bidNotional:0,askNotional:0,mid,spread:ask-bid};cell[side==="bid"?"bidNotional":"askNotional"]+=level.price*level.contractQuantity*contractSize;observation.set(price,cell);}
    // Resting book snapshots are observations, not volume: the newest observation
    // replaces the same time/price bucket instead of being appended or accumulated.
    for(const cell of observation.values())this.heatmapBuckets.set(`${cell.timeMs}:${cell.price}`,cell);
    this.prune(timeMs);
  }
  addDeal(deal:MexcDeal,bucketMs=this.options.timeBucketMs,priceStep=this.options.priceStep){
    if(this.ids.has(deal.tradeId))return false;this.ids.add(deal.tradeId);if(this.ids.size>10_000)this.ids=new Set([...this.ids].slice(-5_000));
    const timeMs=Math.floor(deal.timeMs/bucketMs)*bucketMs,price=Math.round(deal.price/priceStep)*priceStep,key=`${timeMs}:${price}`,bubble=this.bubbleBuckets.get(key)??{timeMs,price,buyNotional:0,sellNotional:0,tradeCount:0};bubble[deal.side==="buy"?"buyNotional":"sellNotional"]+=deal.notional;bubble.tradeCount++;this.bubbleBuckets.set(key,bubble);this.prune(deal.timeMs);return true;
  }
  private prune(now:number){const cutoff=now-this.options.historyMs;for(const [key,value] of this.heatmapBuckets)if(value.timeMs<cutoff)this.heatmapBuckets.delete(key);for(const [key,value] of this.bubbleBuckets)if(value.timeMs<cutoff)this.bubbleBuckets.delete(key);while(this.heatmapBuckets.size>this.options.maxCells)this.heatmapBuckets.delete(this.heatmapBuckets.keys().next().value!);while(this.bubbleBuckets.size>this.options.maxBubbles)this.bubbleBuckets.delete(this.bubbleBuckets.keys().next().value!);this.heatmap=[...this.heatmapBuckets.values()];this.bubbles=[...this.bubbleBuckets.values()];}
}
export function bubbleRadius(notional:number,threshold:number,min=3,max=24){if(notional<threshold)return 0;return Math.min(max,Math.max(min,min+Math.sqrt(notional-threshold)/Math.max(1,Math.sqrt(threshold))));}
export function bubbleComposition(bubble:VolumeBubble){const total=bubble.buyNotional+bubble.sellNotional;return{total,buyRatio:total?bubble.buyNotional/total:0,sellRatio:total?bubble.sellNotional/total:0,dominant:bubble.buyNotional>=bubble.sellNotional?"buy" as const:"sell" as const};}
export function mergePixelColumns<T extends {x:number;notional:number}>(items:T[]){const map=new Map<number,T>();for(const item of items){const x=Math.round(item.x),old=map.get(x);if(!old||item.notional>old.notional)map.set(x,{...item,x});}return [...map.values()];}
