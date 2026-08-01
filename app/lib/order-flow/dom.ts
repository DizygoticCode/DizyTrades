import type {BookView,DepthLevel,DepthSide,RawTrade} from "./types.ts";
import {aggregateDepthBins,detectLargeLiquidityClusters,linearScale,logarithmicScale,sanitiseDepthLevels} from "./market-depth.ts";

export type DomRow=DepthLevel&{side:DepthSide;baseQuantity:number;notional:number;cumulativeNotional:number;cumulativeContractQuantity:number;key:string;largeCluster:boolean};
export type BookMarketState={kind:"valid"|"crossed"|"one-sided"|"empty"|"invalid";bestBid:number|null;bestAsk:number|null;midpoint:number|null;spread:number|null};
export type DomFlash={key:string;price:number;side:"buy"|"sell";quantity:number;count:number;lastTimestampMs:number};
export type VirtualWindow={start:number;end:number;offset:number;visible:number;overscan:number};

export function domGroupingOptions(depthStepList:string[]|undefined,priceUnit:string|undefined){
 const fallback=Number(priceUnit)>0?[1,10,100,1000].map(n=>String(Number(priceUnit)*n)):[];
 return [...new Set((depthStepList?.length?depthStepList:fallback).filter(step=>Number.isFinite(Number(step))&&Number(step)>0))].sort((a,b)=>Number(a)-Number(b));
}
export function calculateBookMarketState(book:BookView):BookMarketState{
 if(!book.valid)return{kind:"invalid",bestBid:null,bestAsk:null,midpoint:null,spread:null};
 const bids=sanitiseDepthLevels(book.bids).sort((a,b)=>b.price-a.price),asks=sanitiseDepthLevels(book.asks).sort((a,b)=>a.price-b.price),bestBid=bids[0]?.price??null,bestAsk=asks[0]?.price??null;
 if(bestBid===null&&bestAsk===null)return{kind:"empty",bestBid,bestAsk,midpoint:null,spread:null};
 if(bestBid===null||bestAsk===null)return{kind:"one-sided",bestBid,bestAsk,midpoint:null,spread:null};
 const spread=bestAsk-bestBid;return{kind:spread<=0?"crossed":"valid",bestBid,bestAsk,midpoint:spread>0?(bestBid+bestAsk)/2:null,spread};
}
const finish=(source:DepthLevel[],side:DepthSide,contractSize:number,levels:number,clusters:Set<number>)=>{let cumulativeNotional=0,cumulativeContractQuantity=0;return source.slice(0,levels).map(level=>{const baseQuantity=level.contractQuantity*contractSize,notional=level.price*baseQuantity;cumulativeNotional+=notional;cumulativeContractQuantity+=level.contractQuantity;return{...level,side,baseQuantity,notional,cumulativeNotional,cumulativeContractQuantity,key:`${side}:${level.price}`,largeCluster:clusters.has(level.price)}})};
export function buildDomRows(book:BookView,contractSize:number,levels:number,stepText?:string,cluster={enabled:false,multiple:4,minimumSamples:5}){
 const step=Number(stepText),bids=step>0?aggregateDepthBins(book.bids,step,"bid"):sanitiseDepthLevels(book.bids).sort((a,b)=>b.price-a.price),asks=step>0?aggregateDepthBins(book.asks,step,"ask"):sanitiseDepthLevels(book.asks).sort((a,b)=>a.price-b.price);
 const bidClusters=cluster.enabled?detectLargeLiquidityClusters(bids.slice(0,levels),cluster.multiple,cluster.minimumSamples):new Set<number>(),askClusters=cluster.enabled?detectLargeLiquidityClusters(asks.slice(0,levels),cluster.multiple,cluster.minimumSamples):new Set<number>();
 return{asks:finish(asks,"ask",contractSize,levels,askClusters),bids:finish(bids,"bid",contractSize,levels,bidClusters)};
}
export function liquidityWidths(bids:readonly DomRow[],asks:readonly DomRow[],scaling:"linear"|"logarithmic",comparison:"per-side"|"total",cumulative:boolean){
 const value=(r:DomRow)=>cumulative?r.cumulativeNotional:r.notional,scale=scaling==="logarithmic"?logarithmicScale:linearScale,bidMax=Math.max(0,...bids.map(value)),askMax=Math.max(0,...asks.map(value)),totalMax=Math.max(bidMax,askMax);
 return new Map([...bids,...asks].map(row=>[row.key,scale(value(row),comparison==="per-side"?(row.side==="bid"?bidMax:askMax):totalMax)]));
}
export function virtualWindow(rowCount:number,scrollTop:number,viewportHeight:number,rowHeight:number,overscan=4):VirtualWindow{const safeHeight=Math.max(1,rowHeight),visible=Math.max(1,Math.ceil(viewportHeight/safeHeight)),first=Math.max(0,Math.floor(Math.max(0,scrollTop)/safeHeight)),start=Math.max(0,first+1-Math.max(0,overscan)),end=Math.min(rowCount,start+visible+Math.max(0,overscan)*2);return{start,end,offset:start*safeHeight,visible,overscan};}
export function navigationIndex(index:number,key:string,rowCount:number,pageSize:number){const last=Math.max(0,rowCount-1);if(key==="ArrowUp")return Math.max(0,index-1);if(key==="ArrowDown")return Math.min(last,index+1);if(key==="PageUp")return Math.max(0,index-pageSize);if(key==="PageDown")return Math.min(last,index+pageSize);if(key==="Home")return 0;if(key==="End")return last;return index;}
export function queueAhead(row:Pick<DomRow,"price"|"contractQuantity"|"baseQuantity"|"notional">|undefined,units:"contracts"|"base"|"usdt"){if(!row||!Number.isFinite(row.price)||row.price<=0||!Number.isFinite(row.contractQuantity)||row.contractQuantity<0)return null;return units==="contracts"?row.contractQuantity:units==="base"?row.baseQuantity:row.notional;}
export function aggregateRecentTrades(trades:readonly RawTrade[],step:number,now:number,durationMs:number,limit=32){const map=new Map<string,DomFlash>();for(const trade of trades){if(!Number.isFinite(trade.price)||!Number.isFinite(trade.quantity)||trade.quantity<0||now-trade.timestampMs>durationMs||trade.timestampMs>now+1000)continue;const price=step>0?Number((Math.round(trade.price/step)*step).toPrecision(12)):trade.price,key=`${trade.side}:${price}`,old=map.get(key);map.set(key,{key,price,side:trade.side,quantity:trade.quantity+(old?.quantity??0),count:1+(old?.count??0),lastTimestampMs:Math.max(trade.timestampMs,old?.lastTimestampMs??0)})}return[...map.values()].sort((a,b)=>b.lastTimestampMs-a.lastTimestampMs).slice(0,limit)}
export function flashStrength(flash:DomFlash,now:number,durationMs:number,reducedMotion=false){if(reducedMotion||durationMs<=0)return 0;const age=Math.max(0,now-flash.lastTimestampMs);return age>=durationMs?0:Math.min(1,Math.log1p(flash.quantity)/5)*(1-age/durationMs);}
