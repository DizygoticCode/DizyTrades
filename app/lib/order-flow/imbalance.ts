import type { BookView } from "./types.ts";
export type ImbalanceDepth = { kind: "levels"; value: 10 | 25 | 50 | 100 } | { kind: "bps"; value: 10 | 25 | 50 | 100 };
export function calculateImbalance(book: BookView, contractSize: number, depth: ImbalanceDepth) {
  if (!book.valid) return null;
  const bestBid = book.bids[0]?.price ?? 0, bestAsk = book.asks[0]?.price ?? 0, mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0;
  const choose = (levels: BookView["bids"], bid: boolean) => depth.kind === "levels" ? levels.slice(0, depth.value) : levels.filter((level) => mid > 0 && (bid ? level.price >= mid * (1-depth.value/10_000) : level.price <= mid * (1+depth.value/10_000)));
  const total = (levels: BookView["bids"]) => levels.reduce((sum, level) => sum + level.price * level.contractQuantity * contractSize, 0);
  const bidNotional = total(choose(book.bids, true)), askNotional = total(choose(book.asks, false)), denominator = bidNotional + askNotional;
  return { imbalance: denominator ? (bidNotional-askNotional)/denominator*100 : 0, bidNotional, askNotional, bestBid, bestAsk, spread: bestAsk && bestBid ? bestAsk-bestBid : 0 };
}
export function formatOrderImbalance(value:number|null|undefined,digits=0){if(value===null||value===undefined||!Number.isFinite(value))return "—";const rounded=Number(value.toFixed(digits));return `${rounded>0?"+":""}${rounded.toFixed(digits)}%`}
export class ImbalanceSmoother { private values: {time:number;value:number}[]=[]; add(value:number,time:number,windowMs:number){ this.values.push({time,value}); this.values=this.values.filter(v=>v.time>=time-windowMs).slice(-200); return windowMs ? this.values.reduce((s,v)=>s+v.value,0)/this.values.length : value; } clear(){this.values=[];} }
