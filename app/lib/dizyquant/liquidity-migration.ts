import{buildDizyQuantResearchSnapshot,type DizyQuantMetricId,type DizyQuantResearchSnapshot,type DizyQuantSourceKind}from"./research.ts";

export const DIZYQUANT_LIQUIDITY_MIGRATION_FORMULA_VERSION="dizyquant-liquidity-migration/1.0.0" as const;
export const DIZYQUANT_LIQUIDITY_MIGRATION_WINDOW_MS=30_000 as const;
export const DIZYQUANT_MAX_LIQUIDITY_FRAMES=128 as const;
export const DIZYQUANT_MAX_LEVELS_PER_FRAME=2_000 as const;

export type DizyQuantLiquidityLevel=Readonly<{priceTick:number;bidContracts:number;askContracts:number}>;
export type DizyQuantLiquidityFrame=Readonly<{timestampMs:number;midpoint:number;levels:readonly DizyQuantLiquidityLevel[]}>;
export type DizyQuantLiquidityMigrationInput=Readonly<{
 frames:readonly DizyQuantLiquidityFrame[];
 windowFromMs:number;
 windowToMs:number;
 priceStep:number;
 contractSize:number;
 sequenceContinuous:boolean|null;
 hasGaps:boolean;
 sourceKind:"depth-stream"|"retained-liquidity";
}>;
export type DizyQuantLiquidityMigrationValues=Readonly<Partial<Record<DizyQuantMetricId,number|null>>>;
export type DizyQuantLiquidityMigrationState=Readonly<{
 formulaVersion:typeof DIZYQUANT_LIQUIDITY_MIGRATION_FORMULA_VERSION;
 valid:boolean;
 complete:boolean;
 windowFromMs:number|null;
 windowToMs:number|null;
 frameCount:number;
 openingDepthNotional:number|null;
 closingDepthNotional:number|null;
 bidAddedNotional:number|null;
 askAddedNotional:number|null;
 bidRemovedNotional:number|null;
 askRemovedNotional:number|null;
 addedNotional:number|null;
 removedNotional:number|null;
 turnoverNotional:number|null;
 turnoverVsOpeningDepthPct:number|null;
 bidSamePricePersistencePct:number|null;
 askSamePricePersistencePct:number|null;
 samePricePersistencePct:number|null;
 openingClusterCount:number;
 survivingOpeningClusterCount:number;
 openingClusterSurvivalPct:number|null;
 signedCentreShiftBps:number|null;
 absoluteDistanceShiftBps:number|null;
 bidDistanceShiftBps:number|null;
 askDistanceShiftBps:number|null;
 nearDepthConcentrationShiftPctPoints:number|null;
 values:DizyQuantLiquidityMigrationValues;
 limitations:readonly string[];
}>;

type NormalisedLevel={price:number;bidNotional:number;askNotional:number};
type NormalisedFrame={timestampMs:number;midpoint:number;levels:Map<number,NormalisedLevel>};
type FrameStats={total:number;bid:number;ask:number;signedCentreBps:number;absoluteDistanceBps:number;bidDistanceBps:number;askDistanceBps:number;nearConcentrationPct:number};

const finitePositive=(value:number)=>Number.isFinite(value)&&value>0;
const finiteNonNegative=(value:number)=>Number.isFinite(value)&&value>=0;
const frozenValues=(values:Partial<Record<DizyQuantMetricId,number|null>>)=>Object.freeze(values)as DizyQuantLiquidityMigrationValues;
function unavailable(reason:string):DizyQuantLiquidityMigrationState{
 return Object.freeze({formulaVersion:DIZYQUANT_LIQUIDITY_MIGRATION_FORMULA_VERSION,valid:false,complete:false,windowFromMs:null,windowToMs:null,frameCount:0,openingDepthNotional:null,closingDepthNotional:null,bidAddedNotional:null,askAddedNotional:null,bidRemovedNotional:null,askRemovedNotional:null,addedNotional:null,removedNotional:null,turnoverNotional:null,turnoverVsOpeningDepthPct:null,bidSamePricePersistencePct:null,askSamePricePersistencePct:null,samePricePersistencePct:null,openingClusterCount:0,survivingOpeningClusterCount:0,openingClusterSurvivalPct:null,signedCentreShiftBps:null,absoluteDistanceShiftBps:null,bidDistanceShiftBps:null,askDistanceShiftBps:null,nearDepthConcentrationShiftPctPoints:null,values:frozenValues({}),limitations:Object.freeze([reason])});
}
function normaliseFrame(frame:DizyQuantLiquidityFrame,priceStep:number,contractSize:number):NormalisedFrame|null{
 if(!Number.isSafeInteger(frame.timestampMs)||!finitePositive(frame.midpoint)||!frame.levels.length||frame.levels.length>DIZYQUANT_MAX_LEVELS_PER_FRAME)return null;
 const levels=new Map<number,NormalisedLevel>();let positiveBid=false,positiveAsk=false;
 for(const level of frame.levels){
  if(!Number.isSafeInteger(level.priceTick)||level.priceTick<=0||!finiteNonNegative(level.bidContracts)||!finiteNonNegative(level.askContracts)||level.bidContracts>0&&level.askContracts>0||levels.has(level.priceTick))return null;
  const price=level.priceTick*priceStep;if(!finitePositive(price))return null;
  if(level.bidContracts>0&&price>=frame.midpoint||level.askContracts>0&&price<=frame.midpoint)return null;
  const bidNotional=price*level.bidContracts*contractSize,askNotional=price*level.askContracts*contractSize;
  if(!finiteNonNegative(bidNotional)||!finiteNonNegative(askNotional))return null;
  positiveBid ||= bidNotional>0;positiveAsk ||= askNotional>0;
  levels.set(level.priceTick,{price,bidNotional,askNotional});
 }
 return positiveBid&&positiveAsk?{timestampMs:frame.timestampMs,midpoint:frame.midpoint,levels}:null;
}
function frameStats(frame:NormalisedFrame):FrameStats|null{
 let total=0,bid=0,ask=0,signed=0,absolute=0,bidDistance=0,askDistance=0,near25=0,within100=0;
 for(const level of frame.levels.values())for(const[notional,side]of[[level.bidNotional,"bid"],[level.askNotional,"ask"]]as const){
  if(notional<=0)continue;const offset=(level.price-frame.midpoint)/frame.midpoint*10_000;if(!Number.isFinite(offset))return null;
  total+=notional;signed+=notional*offset;absolute+=notional*Math.abs(offset);
  if(side==="bid"){bid+=notional;bidDistance+=notional*Math.abs(offset)}else{ask+=notional;askDistance+=notional*Math.abs(offset)}
  if(Math.abs(offset)<=100+1e-9)within100+=notional;if(Math.abs(offset)<=25+1e-9)near25+=notional;
 }
 const derived=[total,bid,ask,signed,absolute,bidDistance,askDistance,near25,within100];if(derived.some(value=>!Number.isFinite(value))||total<=0||bid<=0||ask<=0)return null;
 return{total,bid,ask,signedCentreBps:signed/total,absoluteDistanceBps:absolute/total,bidDistanceBps:bidDistance/bid,askDistanceBps:askDistance/ask,nearConcentrationPct:within100>0?near25/within100*100:0};
}
const sideNotional=(level:NormalisedLevel|undefined,side:"bid"|"ask")=>level?.[side==="bid"?"bidNotional":"askNotional"]??0;
function persistence(opening:NormalisedFrame,closing:NormalisedFrame,side:"bid"|"ask"){
 let opened=0,retained=0;for(const[tick,level]of opening.levels){const value=sideNotional(level,side);if(value<=0)continue;opened+=value;retained+=Math.min(value,sideNotional(closing.levels.get(tick),side))}return{opened,retained,pct:opened>0?retained/opened*100:null};
}
function openingClusters(opening:NormalisedFrame,side:"bid"|"ask"){
 const levels=[...opening.levels].map(([tick,level])=>({tick,notional:sideNotional(level,side)})).filter(value=>value.notional>0).sort((a,b)=>a.notional-b.notional);
 if(!levels.length)return[];const threshold=levels[Math.max(0,Math.ceil(levels.length*.75)-1)].notional;return levels.filter(value=>value.notional>=threshold);
}
export function calculateDizyQuantLiquidityMigration(input:DizyQuantLiquidityMigrationInput):DizyQuantLiquidityMigrationState{
 const{windowFromMs,windowToMs}=input;
 if(!Number.isSafeInteger(windowFromMs)||!Number.isSafeInteger(windowToMs)||windowFromMs<=0||windowToMs-windowFromMs!==DIZYQUANT_LIQUIDITY_MIGRATION_WINDOW_MS)return unavailable("Liquidity migration research requires one exact thirty-second event window.");
 if(!finitePositive(input.priceStep)||!finitePositive(input.contractSize))return unavailable("Price step or contract size is unavailable or invalid.");
 if(input.sourceKind!=="depth-stream"&&input.sourceKind!=="retained-liquidity")return unavailable("Liquidity migration source kind is invalid.");
 if(input.frames.length<2||input.frames.length>DIZYQUANT_MAX_LIQUIDITY_FRAMES)return unavailable("Liquidity migration requires a bounded sequence with opening and closing states.");
 const frames:NormalisedFrame[]=[];let prior=-Infinity;
 for(const frame of input.frames){const value=normaliseFrame(frame,input.priceStep,input.contractSize);if(!value||value.timestampMs<=prior||value.timestampMs<windowFromMs||value.timestampMs>windowToMs)return unavailable("Liquidity frames are invalid, outside coverage or not strictly event-time ordered.");prior=value.timestampMs;frames.push(value)}
 if(frames[0].timestampMs!==windowFromMs||frames.at(-1)!.timestampMs!==windowToMs)return unavailable("Opening and closing liquidity states must match the exact coverage endpoints.");
 const opening=frames[0],closing=frames.at(-1)!,openingStats=frameStats(opening),closingStats=frameStats(closing);if(!openingStats||!closingStats)return unavailable("Liquidity frame statistics are unavailable or overflowed.");
 let bidAdded=0,askAdded=0,bidRemoved=0,askRemoved=0;
 for(let index=1;index<frames.length;index++){
  const before=frames[index-1],after=frames[index];for(const tick of new Set([...before.levels.keys(),...after.levels.keys()]))for(const side of["bid","ask"]as const){
   const delta=sideNotional(after.levels.get(tick),side)-sideNotional(before.levels.get(tick),side);if(!Number.isFinite(delta))return unavailable("Liquidity transition arithmetic overflowed.");
   if(delta>=0){if(side==="bid")bidAdded+=delta;else askAdded+=delta}else if(side==="bid")bidRemoved-=delta;else askRemoved-=delta;
  }
 }
 const added=bidAdded+askAdded,removed=bidRemoved+askRemoved,turnover=added+removed;const aggregates=[bidAdded,askAdded,bidRemoved,askRemoved,added,removed,turnover];if(aggregates.some(value=>!Number.isFinite(value)))return unavailable("Liquidity turnover aggregation overflowed.");
 const bidPersistence=persistence(opening,closing,"bid"),askPersistence=persistence(opening,closing,"ask"),openingTotal=bidPersistence.opened+askPersistence.opened,retainedTotal=bidPersistence.retained+askPersistence.retained;
 const clusters=[...openingClusters(opening,"bid").map(value=>({...value,side:"bid"as const})),...openingClusters(opening,"ask").map(value=>({...value,side:"ask"as const}))];
 const survivingClusters=clusters.filter(cluster=>sideNotional(closing.levels.get(cluster.tick),cluster.side)>=cluster.notional*.5).length;
 const turnoverVsOpening=openingTotal>0?turnover/openingTotal*100:null,samePricePersistence=openingTotal>0?retainedTotal/openingTotal*100:null,clusterSurvival=clusters.length?survivingClusters/clusters.length*100:null;
 const signedCentreShift=closingStats.signedCentreBps-openingStats.signedCentreBps,absoluteDistanceShift=closingStats.absoluteDistanceBps-openingStats.absoluteDistanceBps,bidDistanceShift=closingStats.bidDistanceBps-openingStats.bidDistanceBps,askDistanceShift=closingStats.askDistanceBps-openingStats.askDistanceBps,nearConcentrationShift=closingStats.nearConcentrationPct-openingStats.nearConcentrationPct;
 const derived=[turnoverVsOpening,bidPersistence.pct,askPersistence.pct,samePricePersistence,clusterSurvival,signedCentreShift,absoluteDistanceShift,bidDistanceShift,askDistanceShift,nearConcentrationShift];if(derived.some(value=>value!==null&&!Number.isFinite(value)))return unavailable("Liquidity migration derived arithmetic overflowed.");
 const values:Partial<Record<DizyQuantMetricId,number|null>>={
  "liquidity-added-30s":added,"liquidity-removed-30s":removed,"bid-liquidity-added-30s":bidAdded,"ask-liquidity-added-30s":askAdded,"bid-liquidity-removed-30s":bidRemoved,"ask-liquidity-removed-30s":askRemoved,"liquidity-turnover-30s":turnover,"liquidity-turnover-vs-opening-depth-30s":turnoverVsOpening,"bid-same-price-persistence-30s":bidPersistence.pct,"ask-same-price-persistence-30s":askPersistence.pct,"same-price-liquidity-persistence-30s":samePricePersistence,"opening-cluster-survival-30s":clusterSurvival,"liquidity-centre-shift-bps":signedCentreShift,"liquidity-absolute-distance-shift-30s-bps":absoluteDistanceShift,"bid-centre-distance-shift-30s-bps":bidDistanceShift,"ask-centre-distance-shift-30s-bps":askDistanceShift,"near-depth-concentration-shift-25-of-100bps-30s":nearConcentrationShift,
 };
 const limitations=["Displayed price-level depth only; individual orders, hidden liquidity and participant identity are unavailable.","Same-price persistence and cluster survival do not prove that the same underlying orders remained displayed."];
 if(input.sequenceContinuous!==true||input.hasGaps)limitations.push("Depth continuity is not proven; values remain gapped research only.");
 return Object.freeze({formulaVersion:DIZYQUANT_LIQUIDITY_MIGRATION_FORMULA_VERSION,valid:true,complete:input.sequenceContinuous===true&&!input.hasGaps,windowFromMs,windowToMs,frameCount:frames.length,openingDepthNotional:openingStats.total,closingDepthNotional:closingStats.total,bidAddedNotional:bidAdded,askAddedNotional:askAdded,bidRemovedNotional:bidRemoved,askRemovedNotional:askRemoved,addedNotional:added,removedNotional:removed,turnoverNotional:turnover,turnoverVsOpeningDepthPct:turnoverVsOpening,bidSamePricePersistencePct:bidPersistence.pct,askSamePricePersistencePct:askPersistence.pct,samePricePersistencePct:samePricePersistence,openingClusterCount:clusters.length,survivingOpeningClusterCount:survivingClusters,openingClusterSurvivalPct:clusterSurvival,signedCentreShiftBps:signedCentreShift,absoluteDistanceShiftBps:absoluteDistanceShift,bidDistanceShiftBps:bidDistanceShift,askDistanceShiftBps:askDistanceShift,nearDepthConcentrationShiftPctPoints:nearConcentrationShift,values:frozenValues(values),limitations:Object.freeze(limitations)});
}
export type BuildDizyQuantLiquidityMigrationSnapshotInput=DizyQuantLiquidityMigrationInput&Readonly<{symbol:string;evaluatedAtMs:number;maxAgeMs:number}>;
export function buildDizyQuantLiquidityMigrationSnapshot(input:BuildDizyQuantLiquidityMigrationSnapshotInput):DizyQuantResearchSnapshot{
 const state=calculateDizyQuantLiquidityMigration(input),sourceKinds:DizyQuantSourceKind[]=[input.sourceKind];
 return buildDizyQuantResearchSnapshot({symbol:input.symbol,sourceTimeMs:input.windowToMs,evaluatedAtMs:input.evaluatedAtMs,maxAgeMs:input.maxAgeMs,evidenceGrade:"continuous-stream-grade",sequenceContinuous:input.sequenceContinuous,hasGaps:input.hasGaps,sourceKinds,coverage:{fromMs:input.windowFromMs,toMs:input.windowToMs},values:state.values,limitations:state.limitations});
}
