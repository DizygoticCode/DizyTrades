import type { BookView,DepthLevel } from "./types.ts";
export type DomRow=DepthLevel&{baseQuantity:number;notional:number;cumulativeNotional:number;cumulativeContractQuantity:number};
const decimals=(value:string)=>{const plain=value.toLowerCase().split("e")[0],fraction=plain.split(".")[1]??"";return fraction.length};
export function domGroupingOptions(depthStepList:string[]|undefined,priceUnit:string|undefined){
 const fallback=Number(priceUnit)>0?[1,10,100,1000].map(multiplier=>String(Number(priceUnit)*multiplier)):[];
 return [...new Set((depthStepList?.length?depthStepList:fallback).filter(step=>Number.isFinite(Number(step))&&Number(step)>0))].sort((a,b)=>Number(a)-Number(b));
}
const finish=(source:DepthLevel[],contractSize:number,levels:number)=>{let cumulativeNotional=0,cumulativeContractQuantity=0;return source.slice(0,levels).map(level=>{const baseQuantity=level.contractQuantity*contractSize,notional=level.price*baseQuantity;cumulativeNotional+=notional;cumulativeContractQuantity+=level.contractQuantity;return{...level,baseQuantity,notional,cumulativeNotional,cumulativeContractQuantity}})};
export function buildDomRows(book:BookView,contractSize:number,levels:number,stepText?:string){
 const step=Number(stepText);
 if(!(step>0))return{asks:finish([...book.asks].sort((a,b)=>a.price-b.price),contractSize,levels),bids:finish([...book.bids].sort((a,b)=>b.price-a.price),contractSize,levels)};
 const precision=decimals(stepText!),tickPrecision=Math.max(precision,...book.bids.map(level=>decimals(String(level.price))),...book.asks.map(level=>decimals(String(level.price)))),scale=10**tickPrecision,stepTicks=Math.round(step*scale);
 const group=(source:DepthLevel[],side:"ask"|"bid")=>{const buckets=new Map<number,DepthLevel>();for(const level of source){const priceTicks=Math.round(level.price*scale),bucketTicks=(side==="bid"?Math.floor(priceTicks/stepTicks):Math.ceil(priceTicks/stepTicks))*stepTicks,current=buckets.get(bucketTicks);if(current){current.contractQuantity+=level.contractQuantity;current.orderCount+=level.orderCount}else buckets.set(bucketTicks,{price:bucketTicks/scale,contractQuantity:level.contractQuantity,orderCount:level.orderCount})}return finish([...buckets.values()].sort((a,b)=>side==="ask"?a.price-b.price:b.price-a.price),contractSize,levels)};
 return{asks:group(book.asks,"ask"),bids:group(book.bids,"bid")};
}
