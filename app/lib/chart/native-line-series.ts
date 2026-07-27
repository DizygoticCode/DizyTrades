import type {Candle,Point} from "../strategy.ts";
import type {LineExtension} from "./chart-layout.ts";

/** Evaluate an immutable two-anchor equation at real candle timestamps. */
export function nativeLineData(candles:readonly Candle[],anchors:readonly Point[],extension:LineExtension){
 if(anchors.length<2)return [];
 const [start,end]=[anchors[0],anchors.at(-1)!],duration=end.time-start.time;
 if(!duration)return [];
 return candles.filter(candle=>{
  if(extension==="both")return true;
  if(extension==="left")return candle.time<=end.time;
  if(extension==="right")return candle.time>=start.time;
  return candle.time>=start.time&&candle.time<=end.time;
 }).map(candle=>({time:candle.time,value:start.value+(end.value-start.value)*(candle.time-start.time)/duration}));
}
