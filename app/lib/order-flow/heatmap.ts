import type {LiquidityObservation} from "./types.ts";

export type HeatmapSegment={price:number;fromMs:number;toMs:number;bidQuantity:number;askQuantity:number};
export type BookmapHeatmapCellRect={left:number;top:number;width:number;height:number};
export type HeatmapPalette="bookmap"|"thermal"|"ocean";
export type HeatmapPriceGrouping="auto"|"exchange"|"manual";
export type HeatmapTimeSliceMs=0|5000|15000|30000|60000;
export type HeatmapDisplayTuning={palette:HeatmapPalette;minimumTimePixels:number;minimumPricePixels:number;timeSliceMs:HeatmapTimeSliceMs;priceGrouping:HeatmapPriceGrouping;manualPriceStep:number};

export const HEATMAP_DISPLAY_STORAGE_KEY="dizytrades:heatmap-display:v1";
export const HEATMAP_DISPLAY_EVENT="dizytrades:heatmap-display-change";
export const DEFAULT_HEATMAP_DISPLAY_TUNING:HeatmapDisplayTuning={palette:"bookmap",minimumTimePixels:6,minimumPricePixels:7,timeSliceMs:15000,priceGrouping:"auto",manualPriceStep:1};

const clamp=(value:unknown,fallback:number,min:number,max:number)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Number(value))):fallback;
const choice=<T extends string|number>(value:unknown,values:readonly T[],fallback:T):T=>values.includes(value as T)?value as T:fallback;
export function sanitiseHeatmapDisplayTuning(value:unknown):HeatmapDisplayTuning{
 const input=value&&typeof value==="object"?value as Record<string,unknown>:{},d=DEFAULT_HEATMAP_DISPLAY_TUNING;
 return{palette:choice(input.palette,["bookmap","thermal","ocean"] as const,d.palette),minimumTimePixels:clamp(input.minimumTimePixels,d.minimumTimePixels,2.5,24),minimumPricePixels:clamp(input.minimumPricePixels,d.minimumPricePixels,3,24),timeSliceMs:choice(input.timeSliceMs,[0,5000,15000,30000,60000] as const,d.timeSliceMs),priceGrouping:choice(input.priceGrouping,["auto","exchange","manual"] as const,d.priceGrouping),manualPriceStep:clamp(input.manualPriceStep,d.manualPriceStep,.00000001,100000)};
}
export function readHeatmapDisplayTuning(storage?:Pick<Storage,"getItem">|null):HeatmapDisplayTuning{
 const source=storage??(typeof window!=="undefined"?window.localStorage:null);if(!source)return DEFAULT_HEATMAP_DISPLAY_TUNING;
 try{return sanitiseHeatmapDisplayTuning(JSON.parse(source.getItem(HEATMAP_DISPLAY_STORAGE_KEY)??"null"))}catch{return DEFAULT_HEATMAP_DISPLAY_TUNING}
}
export function writeHeatmapDisplayTuning(value:unknown,storage?:Pick<Storage,"setItem">|null):HeatmapDisplayTuning{
 const next=sanitiseHeatmapDisplayTuning(value),source=storage??(typeof window!=="undefined"?window.localStorage:null);try{source?.setItem(HEATMAP_DISPLAY_STORAGE_KEY,JSON.stringify(next))}catch{}
 if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(HEATMAP_DISPLAY_EVENT,{detail:next}));return next;
}

const blendHex=(from:string,to:string,ratio:number)=>{const a=parseInt(from.slice(1),16),b=parseInt(to.slice(1),16),mix=(shift:number)=>Math.round(((a>>shift)&255)*(1-ratio)+((b>>shift)&255)*ratio);return `rgb(${mix(16)},${mix(8)},${mix(0)})`};
const HEAT_PALETTES:Record<HeatmapPalette,readonly (readonly [number,string])[]>={
 bookmap:[[0,"#07152f"],[.2,"#064fb5"],[.42,"#00cde8"],[.65,"#ffe34d"],[.83,"#ff6a24"],[1,"#fffbd1"]],
 thermal:[[0,"#160922"],[.2,"#4b167a"],[.42,"#d22d83"],[.65,"#ff7a35"],[.83,"#ffd54a"],[1,"#fff8d4"]],
 ocean:[[0,"#061a25"],[.2,"#07546e"],[.42,"#00a6a6"],[.65,"#5ee6bd"],[.83,"#c9f36b"],[1,"#f7ffd6"]],
};
export function heatmapColour(value:number,palette:HeatmapPalette="bookmap"){
 const stops=HEAT_PALETTES[palette],n=Math.max(0,Math.min(1,value));let index=1;while(index<stops.length&&n>stops[index][0])index++;const [a,from]=stops[index-1],[b,to]=stops[Math.min(index,stops.length-1)];return blendHex(from,to,b===a?0:(n-a)/(b-a));
}

/** Generic callers retain the historical fallback; the production renderer always supplies the active display target. */
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
export function bookmapHeatmapCellRect(x1:number,x2:number,y1:number,y2:number,minimumTimePixels=DEFAULT_HEATMAP_DISPLAY_TUNING.minimumTimePixels,minimumPricePixels=DEFAULT_HEATMAP_DISPLAY_TUNING.minimumPricePixels):BookmapHeatmapCellRect|null{
  if(![x1,x2,y1,y2,minimumTimePixels,minimumPricePixels].every(Number.isFinite)||minimumTimePixels<=0||minimumPricePixels<=0)return null;
  const centreX=(x1+x2)/2,centreY=(y1+y2)/2,width=Math.max(minimumTimePixels,Math.abs(x2-x1)+.9),height=Math.max(minimumPricePixels,Math.abs(y2-y1)+.75);
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
