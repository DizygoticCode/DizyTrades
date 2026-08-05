import type {LiquidityObservation} from "./types.ts";

export type HeatmapSegment={price:number;fromMs:number;toMs:number;bidQuantity:number;askQuantity:number};
export type BookmapHeatmapCellRect={left:number;top:number;width:number;height:number};

export function effectiveHeatmapPriceStep(pricePerPixel:number,exchangeTick:number,targetPixels=4.5){
  if(!Number.isFinite(exchangeTick)||exchangeTick<=0)return 1;
  const desired=Math.max(exchangeTick,Math.abs(pricePerPixel)*targetPixels);
  return exchangeTick*Math.max(1,Math.round(desired/exchangeTick));
}

/**
 * Turns projected exchange-time / price-bin coordinates into a visible screen cell.
 * Very short depth slices can be fractions of a CSS pixel on 15m+ candles. Bookmap-style
 * rendering keeps their centre accurate while giving them enough screen area to read as
 * continuous resting-liquidity bands rather than one-pixel ticks.
 */
export function bookmapHeatmapCellRect(x1:number,x2:number,y1:number,y2:number,minimumTimePixels=2.5,minimumPricePixels=3):BookmapHeatmapCellRect|null{
  if(![x1,x2,y1,y2,minimumTimePixels,minimumPricePixels].every(Number.isFinite)||minimumTimePixels<=0||minimumPricePixels<=0)return null;
  const centreX=(x1+x2)/2,centreY=(y1+y2)/2,width=Math.max(minimumTimePixels,Math.abs(x2-x1)+.75),height=Math.max(minimumPricePixels,Math.abs(y2-y1)+.5);
  return{left:centreX-width/2,top:centreY-height/2,width,height};
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
