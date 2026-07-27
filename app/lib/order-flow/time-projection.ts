import { MEXC_INTERVALS } from "../market/mexc-shared.ts";
import type { CandleTimeframe } from "../market/types.ts";

const EARLIEST = Date.UTC(2015, 0, 1);
export function normalizeExchangeTimestamp(value: unknown, now=Date.now()): number | null {
  const numeric=Number(value); if(!Number.isFinite(numeric)||numeric<=0)return null;
  const ms=numeric<1e12?numeric*1000:numeric;
  return Number.isInteger(ms)&&ms>=EARLIEST&&ms<=now+5*60_000?ms:null;
}
export function candleCloseMs(openSeconds:number,timeframe:CandleTimeframe){
  if(timeframe==="1M"){const date=new Date(openSeconds*1000);return Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1);}
  return (openSeconds+MEXC_INTERVALS[timeframe].seconds)*1000;
}
export function containingCandleIndex(candles:readonly {time:number}[],eventTimeMs:number,timeframe:CandleTimeframe){
  if(!normalizeExchangeTimestamp(eventTimeMs,eventTimeMs))return -1;
  let low=0,high=candles.length-1,best=-1;while(low<=high){const mid=(low+high)>>1;if(candles[mid].time*1000<=eventTimeMs){best=mid;low=mid+1}else high=mid-1;}
  return best>=0&&eventTimeMs<candleCloseMs(candles[best].time,timeframe)?best:-1;
}
export function fractionalLogicalIndex(eventTimeMs:number,candleStartSeconds:number,candleIndex:number,timeframe:CandleTimeframe){
  const start=candleStartSeconds*1000,close=candleCloseMs(candleStartSeconds,timeframe);
  const fraction=Math.max(0,Math.min(.999999,(eventTimeMs-start)/(close-start)));
  return candleIndex-.5+fraction;
}
