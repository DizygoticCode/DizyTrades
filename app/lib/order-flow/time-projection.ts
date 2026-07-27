import { MEXC_INTERVALS } from "../market/mexc-shared.ts";
import type { CandleTimeframe } from "../market/types.ts";
export function fractionalLogicalIndex(eventTimeMs:number,candleStartSeconds:number,candleIndex:number,timeframe:CandleTimeframe){const seconds=MEXC_INTERVALS[timeframe].seconds;return candleIndex+Math.max(0,Math.min(1,(eventTimeMs/1000-candleStartSeconds)/seconds));}
