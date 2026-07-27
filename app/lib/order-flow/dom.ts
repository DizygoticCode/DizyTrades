import type { BookView,DepthLevel } from "./types.ts";
export type DomRow=DepthLevel&{notional:number;cumulativeNotional:number};
export function buildDomRows(book:BookView,contractSize:number,levels:number){const map=(source:DepthLevel[])=>{let cumulative=0;return source.slice(0,levels).map(level=>{const notional=level.price*level.contractQuantity*contractSize;cumulative+=notional;return{...level,notional,cumulativeNotional:cumulative}})};return{asks:map([...book.asks].sort((a,b)=>a.price-b.price)).reverse(),bids:map([...book.bids].sort((a,b)=>b.price-a.price))};}
