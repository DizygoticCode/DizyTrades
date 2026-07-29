import type {LiquidityObservation} from "./types.ts";

export type HeatmapSegment={price:number;fromMs:number;toMs:number;bidQuantity:number;askQuantity:number};

export function effectiveHeatmapPriceStep(pricePerPixel:number,exchangeTick:number,targetPixels=4.5){
  if(!Number.isFinite(exchangeTick)||exchangeTick<=0)return 1;
  const desired=Math.max(exchangeTick,Math.abs(pricePerPixel)*targetPixels);
  return exchangeTick*Math.max(1,Math.round(desired/exchangeTick));
}

/** Replays sparse raw-level transitions into stable display bins and terminates at the last depth receipt. */
export function buildHeatmapSegments(observations:readonly LiquidityObservation[],displayStep:number,visibleFrom:number,visibleTo:number,latestDepthMs:number){
  const bins=new Map<number,LiquidityObservation[]>();
  for(const observation of observations){const bin=Math.round(observation.price/displayStep),items=bins.get(bin)??[];items.push(observation);bins.set(bin,items)}
  const result:HeatmapSegment[]=[];
  for(const [bin,items] of bins){items.sort((a,b)=>a.timestampMs-b.timestampMs);const levels=new Map<number,{bid:number;ask:number}>();let stateAt=items[0]?.timestampMs??0,index=0;
    while(index<items.length){const timestamp=items[index].timestampMs;if(timestamp>stateAt){const bid=[...levels.values()].reduce((sum,v)=>sum+v.bid,0),ask=[...levels.values()].reduce((sum,v)=>sum+v.ask,0),from=Math.max(stateAt,visibleFrom),to=Math.min(timestamp,visibleTo,latestDepthMs);if(to>from&&(bid>0||ask>0))result.push({price:bin*displayStep,fromMs:from,toMs:to,bidQuantity:bid,askQuantity:ask})}while(index<items.length&&items[index].timestampMs===timestamp){const item=items[index++];levels.set(item.price,{bid:item.bidQuantity,ask:item.askQuantity})}stateAt=timestamp}
    const bid=[...levels.values()].reduce((sum,v)=>sum+v.bid,0),ask=[...levels.values()].reduce((sum,v)=>sum+v.ask,0),from=Math.max(stateAt,visibleFrom),to=Math.min(visibleTo,latestDepthMs);if(to>from&&(bid>0||ask>0))result.push({price:bin*displayStep,fromMs:from,toMs:to,bidQuantity:bid,askQuantity:ask});
  }
  return result;
}
