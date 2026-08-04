import type{BookView,DepthLevel}from"../order-flow/types.ts";
import{buildDizyQuantResearchSnapshot,type DizyQuantMetricId,type DizyQuantResearchSnapshot}from"./research.ts";

export const DIZYQUANT_LADDER_FORMULA_VERSION="dizyquant-ladder-state/1.0.0" as const;
export const DIZYQUANT_DEPTH_BANDS_BPS=Object.freeze([10,25,50,100] as const);
export type DizyQuantDepthBandBps=typeof DIZYQUANT_DEPTH_BANDS_BPS[number];
export type DizyQuantLadderValues=Readonly<Partial<Record<DizyQuantMetricId,number|null>>>;
export type DizyQuantLadderBand=Readonly<{bps:DizyQuantDepthBandBps;bidNotional:number;askNotional:number;imbalancePct:number|null}>;
export type DizyQuantLadderState=Readonly<{
 formulaVersion:typeof DIZYQUANT_LADDER_FORMULA_VERSION;
 valid:boolean;
 bestBid:number|null;
 bestAsk:number|null;
 midpoint:number|null;
 priceStep:number|null;
 spreadPrice:number|null;
 spreadTicks:number|null;
 spreadBps:number|null;
 bands:readonly DizyQuantLadderBand[];
 weightedDistanceBps100:number|null;
 nearDepthConcentrationPct:number|null;
 values:DizyQuantLadderValues;
 limitations:readonly string[];
}>;

const finitePositive=(value:number)=>Number.isFinite(value)&&value>0;
const validLevel=(level:DepthLevel)=>finitePositive(level.price)&&Number.isFinite(level.contractQuantity)&&level.contractQuantity>=0&&Number.isFinite(level.orderCount)&&level.orderCount>=0;
const ordered=(levels:readonly DepthLevel[],descending:boolean)=>levels.every((level,index)=>index===0||(descending?levels[index-1].price>level.price:levels[index-1].price<level.price));
const uniquePrices=(levels:readonly DepthLevel[])=>new Set(levels.map(level=>level.price)).size===levels.length;
const notional=(level:DepthLevel,contractSize:number)=>level.price*level.contractQuantity*contractSize;
const totalNotional=(levels:readonly DepthLevel[],contractSize:number)=>levels.reduce((sum,level)=>sum+notional(level,contractSize),0);
const frozenValues=(values:Partial<Record<DizyQuantMetricId,number|null>>)=>Object.freeze(values) as DizyQuantLadderValues;

function unavailable(reason:string):DizyQuantLadderState{
 return Object.freeze({formulaVersion:DIZYQUANT_LADDER_FORMULA_VERSION,valid:false,bestBid:null,bestAsk:null,midpoint:null,priceStep:null,spreadPrice:null,spreadTicks:null,spreadBps:null,bands:Object.freeze([]),weightedDistanceBps100:null,nearDepthConcentrationPct:null,values:frozenValues({}),limitations:Object.freeze([reason])});
}

export function calculateDizyQuantLadderState(book:BookView,contractSize:number,priceStep:number):DizyQuantLadderState{
 if(!book.valid)return unavailable("Depth snapshot is marked invalid.");
 if(!finitePositive(contractSize))return unavailable("Contract size is unavailable or invalid.");
 if(!finitePositive(priceStep))return unavailable("Public price step is unavailable or invalid.");
 if(!book.bids.length||!book.asks.length)return unavailable("Both bid and ask depth are required.");
 if(!book.bids.every(validLevel)||!book.asks.every(validLevel))return unavailable("Depth contains an invalid level.");
 if(!ordered(book.bids,true)||!ordered(book.asks,false))return unavailable("Depth levels are not strictly sorted.");
 if(!uniquePrices(book.bids)||!uniquePrices(book.asks))return unavailable("Depth contains duplicate price levels.");
 const bestBid=book.bids[0].price,bestAsk=book.asks[0].price;
 if(bestBid>=bestAsk)return unavailable("Locked or crossed depth is unavailable for ladder research.");
 const midpoint=(bestBid+bestAsk)/2,spreadPrice=bestAsk-bestBid,spreadTicks=spreadPrice/priceStep,spreadBps=spreadPrice/midpoint*10_000;
 const values:Partial<Record<DizyQuantMetricId,number|null>>={"spread-price":spreadPrice,"spread-ticks":spreadTicks,"spread-bps":spreadBps};
 const bands:DizyQuantLadderBand[]=[];
 for(const bps of DIZYQUANT_DEPTH_BANDS_BPS){
  const bidFloor=midpoint*(1-bps/10_000),askCeiling=midpoint*(1+bps/10_000);
  const bidNotional=totalNotional(book.bids.filter(level=>level.price>=bidFloor),contractSize);
  const askNotional=totalNotional(book.asks.filter(level=>level.price<=askCeiling),contractSize);
  const denominator=bidNotional+askNotional,imbalancePct=denominator>0?(bidNotional-askNotional)/denominator*100:null;
  values[`bid-depth-${bps}bps` as DizyQuantMetricId]=bidNotional;
  values[`ask-depth-${bps}bps` as DizyQuantMetricId]=askNotional;
  values[`depth-imbalance-${bps}bps` as DizyQuantMetricId]=imbalancePct;
  bands.push(Object.freeze({bps,bidNotional,askNotional,imbalancePct}));
 }
 const within100=[...book.bids.filter(level=>level.price>=midpoint*.99),...book.asks.filter(level=>level.price<=midpoint*1.01)];
 const total100=totalNotional(within100,contractSize);
 const weightedDistanceBps100=total100>0?within100.reduce((sum,level)=>sum+notional(level,contractSize)*Math.abs(level.price-midpoint)/midpoint*10_000,0)/total100:null;
 const band25=bands.find(value=>value.bps===25)!,band100=bands.find(value=>value.bps===100)!;
 const near25=band25.bidNotional+band25.askNotional,all100=band100.bidNotional+band100.askNotional;
 const nearDepthConcentrationPct=all100>0?near25/all100*100:null;
 values["depth-weighted-distance-100bps"]=weightedDistanceBps100;
 values["near-depth-concentration-25-of-100bps"]=nearDepthConcentrationPct;
 const limitations=total100>0?Object.freeze(["Public displayed depth only; hidden liquidity and true queue priority are unavailable."]):Object.freeze(["No visible depth was observed inside one hundred basis points of midpoint."]);
 return Object.freeze({formulaVersion:DIZYQUANT_LADDER_FORMULA_VERSION,valid:true,bestBid,bestAsk,midpoint,priceStep,spreadPrice,spreadTicks,spreadBps,bands:Object.freeze(bands),weightedDistanceBps100,nearDepthConcentrationPct,values:frozenValues(values),limitations});
}

export type BuildDizyQuantLadderSnapshotInput=Readonly<{
 symbol:string;book:BookView;contractSize:number;priceStep:number;sourceTimeMs:number;evaluatedAtMs:number;maxAgeMs:number;
}>;
export function buildDizyQuantLadderSnapshot(input:BuildDizyQuantLadderSnapshotInput):DizyQuantResearchSnapshot{
 const state=calculateDizyQuantLadderState(input.book,input.contractSize,input.priceStep);
 return buildDizyQuantResearchSnapshot({symbol:input.symbol,sourceTimeMs:input.sourceTimeMs,evaluatedAtMs:input.evaluatedAtMs,maxAgeMs:input.maxAgeMs,evidenceGrade:"snapshot-grade",sequenceContinuous:null,hasGaps:false,sourceKinds:["depth-snapshot"],coverage:{fromMs:input.sourceTimeMs,toMs:input.sourceTimeMs},values:state.values,limitations:state.limitations});
}
