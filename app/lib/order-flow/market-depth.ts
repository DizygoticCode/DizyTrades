import type { BookView,DepthLevel,DepthSide } from "./types.ts";

export type DepthScaling="linear"|"logarithmic";
export type DepthDisplayMode="absolute"|"side-percentage"|"total-percentage";
export type MarketDepthOptions={levels:number;scaling:DepthScaling;displayMode:DepthDisplayMode;clusterMultiple:number;clusterMinimumSamples:number;highlightClusters:boolean};
export type MarketDepthBar={side:DepthSide;price:number;rawSize:number;displayValue:number;scaledWidth:number;best:boolean;largeCluster:boolean};
export type DepthImbalance={bidTotal:number;askTotal:number;total:number;bidPercentage:number;askPercentage:number;signedImbalance:number;ratio:number|null};
export type MarketDepthModel={bids:MarketDepthBar[];asks:MarketDepthBar[];imbalance:DepthImbalance;maximumSize:number;clusterCount:number};

const finiteNonNegative=(value:number)=>Number.isFinite(value)&&value>=0?value:null;
export function sanitiseDepthLevels(levels:readonly DepthLevel[]):DepthLevel[]{
 return levels.flatMap(level=>{const price=Number(level.price),size=finiteNonNegative(Number(level.contractQuantity)),orders=finiteNonNegative(Number(level.orderCount));return Number.isFinite(price)&&price>0&&size!==null&&orders!==null?[{price,contractQuantity:size,orderCount:orders}]:[]});
}
export function selectVisibleDepth(book:BookView,levels:number,priceRange?:{min:number;max:number}|null){
 const count=Math.max(1,Math.min(200,Math.floor(Number.isFinite(levels)?levels:25))),within=(level:DepthLevel)=>!priceRange||level.price>=priceRange.min&&level.price<=priceRange.max;
 return {bids:sanitiseDepthLevels(book.bids).filter(within).sort((a,b)=>b.price-a.price).slice(0,count),asks:sanitiseDepthLevels(book.asks).filter(within).sort((a,b)=>a.price-b.price).slice(0,count)};
}
export function aggregateDepthBins(levels:readonly DepthLevel[],step:number,side:DepthSide):DepthLevel[]{
 if(!Number.isFinite(step)||step<=0)return sanitiseDepthLevels(levels);
 const bins=new Map<number,DepthLevel>();for(const level of sanitiseDepthLevels(levels)){const ratio=level.price/step,tick=side==="bid"?Math.floor(ratio+1e-10):Math.ceil(ratio-1e-10),price=Number((tick*step).toPrecision(12)),current=bins.get(tick);if(current){current.contractQuantity+=level.contractQuantity;current.orderCount+=level.orderCount}else bins.set(tick,{price,contractQuantity:level.contractQuantity,orderCount:level.orderCount})}return [...bins.values()].sort((a,b)=>side==="bid"?b.price-a.price:a.price-b.price);
}
export function linearScale(size:number,maximum:number){const value=finiteNonNegative(size),max=finiteNonNegative(maximum);return value===null||max===null||max<=0?0:Math.min(1,value/max)}
export function logarithmicScale(size:number,maximum:number){const value=finiteNonNegative(size),max=finiteNonNegative(maximum);return value===null||max===null||max<=0?0:Math.min(1,Math.log1p(value)/Math.log1p(max))}
export function percentage(value:number,total:number){return Number.isFinite(value)&&value>0&&Number.isFinite(total)&&total>0?value/total*100:0}
export function calculateDepthImbalance(bids:readonly DepthLevel[],asks:readonly DepthLevel[]):DepthImbalance{
 const sum=(levels:readonly DepthLevel[])=>sanitiseDepthLevels(levels).reduce((total,level)=>total+level.contractQuantity,0),bidTotal=sum(bids),askTotal=sum(asks),total=bidTotal+askTotal;
 return {bidTotal,askTotal,total,bidPercentage:percentage(bidTotal,total),askPercentage:percentage(askTotal,total),signedImbalance:total?((bidTotal-askTotal)/total)*100:0,ratio:askTotal>0?bidTotal/askTotal:bidTotal>0?null:0};
}
export function median(values:readonly number[]){const sorted=values.filter(value=>Number.isFinite(value)&&value>=0).sort((a,b)=>a-b);if(!sorted.length)return 0;const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2}
export function detectLargeLiquidityClusters(levels:readonly DepthLevel[],multiple=4,minimumSamples=5):Set<number>{
 const clean=sanitiseDepthLevels(levels);if(clean.length<Math.max(2,minimumSamples)||!Number.isFinite(multiple)||multiple<1)return new Set();const baseline=median(clean.map(level=>level.contractQuantity));if(baseline<=0)return new Set();return new Set(clean.filter(level=>level.contractQuantity>=baseline*multiple).map(level=>level.price));
}
export function createMarketDepthModel(book:BookView,options:MarketDepthOptions,priceRange?:{min:number;max:number}|null):MarketDepthModel{
 const visible=selectVisibleDepth(book,options.levels,priceRange),all=[...visible.bids,...visible.asks],maximumSize=all.reduce((max,level)=>Math.max(max,level.contractQuantity),0),imbalance=calculateDepthImbalance(visible.bids,visible.asks),bidClusters=options.highlightClusters?detectLargeLiquidityClusters(visible.bids,options.clusterMultiple,options.clusterMinimumSamples):new Set<number>(),askClusters=options.highlightClusters?detectLargeLiquidityClusters(visible.asks,options.clusterMultiple,options.clusterMinimumSamples):new Set<number>(),scale=options.scaling==="logarithmic"?logarithmicScale:linearScale;
 const display=(level:DepthLevel,side:DepthSide)=>options.displayMode==="absolute"?level.contractQuantity:percentage(level.contractQuantity,options.displayMode==="side-percentage"?(side==="bid"?imbalance.bidTotal:imbalance.askTotal):imbalance.total),displayMaximum=options.displayMode==="side-percentage"?null:all.reduce((max,level)=>Math.max(max,display(level,visible.bids.includes(level)?"bid":"ask")),0);
 const bars=(levels:DepthLevel[],side:DepthSide,clusters:Set<number>)=>{const sideMaximum=displayMaximum??levels.reduce((max,level)=>Math.max(max,display(level,side)),0);return levels.map((level,index)=>{const displayValue=display(level,side);return {side,price:level.price,rawSize:level.contractQuantity,displayValue,scaledWidth:scale(displayValue,sideMaximum),best:index===0,largeCluster:clusters.has(level.price)}})};
 const bids=bars(visible.bids,"bid",bidClusters),asks=bars(visible.asks,"ask",askClusters);return {bids,asks,imbalance,maximumSize,clusterCount:bids.filter(v=>v.largeCluster).length+asks.filter(v=>v.largeCluster).length};
}
