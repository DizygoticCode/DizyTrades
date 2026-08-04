import type{DizyQuantLiquidityFrame}from"./liquidity-migration.ts";
import{buildDizyQuantResearchSnapshot,type DizyQuantMetricId,type DizyQuantResearchSnapshot,type DizyQuantSourceKind}from"./research.ts";

export const DIZYQUANT_RESILIENCE_FORMULA_VERSION="dizyquant-resilience/1.0.0" as const;
export const DIZYQUANT_RESILIENCE_WINDOW_MS=60_000 as const;
export const DIZYQUANT_MAX_RESILIENCE_FRAMES=256 as const;
export const DIZYQUANT_MAX_RESILIENCE_LEVELS=2_000 as const;
export const DIZYQUANT_SHOCK_DEPTH_LOSS_PCT=40 as const;
export const DIZYQUANT_SHOCK_SPREAD_WIDENING_PCT=50 as const;
export const DIZYQUANT_DEPTH_RECOVERY_PCT=90 as const;
export const DIZYQUANT_SPREAD_RECOVERY_PCT=110 as const;
export const DIZYQUANT_OUTCOME_MOVE_BPS=2 as const;
export const DIZYQUANT_ABSORPTION_REPLENISHMENT_PCT=50 as const;
export const DIZYQUANT_EXHAUSTION_MAX_REPLENISHMENT_PCT=25 as const;

export type DizyQuantResilienceInput=Readonly<{
 frames:readonly DizyQuantLiquidityFrame[];
 windowFromMs:number;
 windowToMs:number;
 shockTimestampMs:number;
 priceStep:number;
 contractSize:number;
 sequenceContinuous:boolean|null;
 hasGaps:boolean;
 sourceKind:"depth-stream"|"retained-liquidity";
}>;
export type DizyQuantResilienceValues=Readonly<Partial<Record<DizyQuantMetricId,number|null>>>;
export type DizyQuantCandidateLabel="absorption"|"exhaustion"|"none"|"unavailable";
export type DizyQuantResilienceState=Readonly<{
 formulaVersion:typeof DIZYQUANT_RESILIENCE_FORMULA_VERSION;
 valid:boolean;
 complete:boolean;
 windowFromMs:number|null;
 windowToMs:number|null;
 shockTimestampMs:number|null;
 frameCount:number;
 spreadShock:boolean;
 bidDepthShock:boolean;
 askDepthShock:boolean;
 shockComponentCount:number;
 recoveredComponentCount:number;
 spreadWideningPct:number|null;
 bidDepthLossPct:number|null;
 askDepthLossPct:number|null;
 spreadRecoveryMs:number|null;
 bidDepthRecoveryMs:number|null;
 askDepthRecoveryMs:number|null;
 resilienceRecoveryMs:number|null;
 shockLossNotional:number|null;
 samePriceReplenishmentNotional:number|null;
 migratedPriceReplenishmentNotional:number|null;
 replenishmentVsShockLossPct:number|null;
 samePriceReplenishmentSharePct:number|null;
 postShockMidpointChangeBps:number|null;
 continuationFlag:number|null;
 reversalFlag:number|null;
 noMovementFlag:number|null;
 absorptionCandidateFlag:number|null;
 exhaustionCandidateFlag:number|null;
 candidateLabel:DizyQuantCandidateLabel;
 values:DizyQuantResilienceValues;
 limitations:readonly string[];
}>;

type Side="bid"|"ask";
type NormalisedLevel={price:number;bidNotional:number;askNotional:number};
type NormalisedFrame=Readonly<{
 timestampMs:number;
 midpoint:number;
 levels:Map<number,NormalisedLevel>;
 spreadBps:number;
 bidDepth25Bps:number;
 askDepth25Bps:number;
}>;

const finitePositive=(value:number)=>Number.isFinite(value)&&value>0;
const finiteNonNegative=(value:number)=>Number.isFinite(value)&&value>=0;
const frozenValues=(values:Partial<Record<DizyQuantMetricId,number|null>>)=>Object.freeze(values)as DizyQuantResilienceValues;
const sideNotional=(level:NormalisedLevel|undefined,side:Side)=>level?.[side==="bid"?"bidNotional":"askNotional"]??0;

function unavailable(reason:string):DizyQuantResilienceState{
 return Object.freeze({formulaVersion:DIZYQUANT_RESILIENCE_FORMULA_VERSION,valid:false,complete:false,windowFromMs:null,windowToMs:null,shockTimestampMs:null,frameCount:0,spreadShock:false,bidDepthShock:false,askDepthShock:false,shockComponentCount:0,recoveredComponentCount:0,spreadWideningPct:null,bidDepthLossPct:null,askDepthLossPct:null,spreadRecoveryMs:null,bidDepthRecoveryMs:null,askDepthRecoveryMs:null,resilienceRecoveryMs:null,shockLossNotional:null,samePriceReplenishmentNotional:null,migratedPriceReplenishmentNotional:null,replenishmentVsShockLossPct:null,samePriceReplenishmentSharePct:null,postShockMidpointChangeBps:null,continuationFlag:null,reversalFlag:null,noMovementFlag:null,absorptionCandidateFlag:null,exhaustionCandidateFlag:null,candidateLabel:"unavailable",values:frozenValues({}),limitations:Object.freeze([reason])});
}

function normaliseFrame(frame:DizyQuantLiquidityFrame,priceStep:number,contractSize:number):NormalisedFrame|null{
 if(!frame||typeof frame!=="object"||!Number.isSafeInteger(frame.timestampMs)||!finitePositive(frame.midpoint)||!Array.isArray(frame.levels)||!frame.levels.length||frame.levels.length>DIZYQUANT_MAX_RESILIENCE_LEVELS)return null;
 const levels=new Map<number,NormalisedLevel>();let bestBid=-Infinity,bestAsk=Infinity,bidDepth25Bps=0,askDepth25Bps=0;
 for(const level of frame.levels){
  if(!level||typeof level!=="object"||!Number.isSafeInteger(level.priceTick)||level.priceTick<=0||!finiteNonNegative(level.bidContracts)||!finiteNonNegative(level.askContracts)||level.bidContracts>0&&level.askContracts>0||levels.has(level.priceTick))return null;
  const price=level.priceTick*priceStep;if(!finitePositive(price))return null;
  if(level.bidContracts>0&&price>=frame.midpoint||level.askContracts>0&&price<=frame.midpoint)return null;
  const bidNotional=price*level.bidContracts*contractSize,askNotional=price*level.askContracts*contractSize;
  if(!finiteNonNegative(bidNotional)||!finiteNonNegative(askNotional))return null;
  if(bidNotional>0){bestBid=Math.max(bestBid,price);const distance=(frame.midpoint-price)/frame.midpoint*10_000;if(!Number.isFinite(distance))return null;if(distance<=25+1e-9)bidDepth25Bps+=bidNotional}
  if(askNotional>0){bestAsk=Math.min(bestAsk,price);const distance=(price-frame.midpoint)/frame.midpoint*10_000;if(!Number.isFinite(distance))return null;if(distance<=25+1e-9)askDepth25Bps+=askNotional}
  levels.set(level.priceTick,{price,bidNotional,askNotional});
 }
 if(!finitePositive(bestBid)||!finitePositive(bestAsk)||bestBid>=bestAsk||!finitePositive(bidDepth25Bps)||!finitePositive(askDepth25Bps))return null;
 const spreadBps=(bestAsk-bestBid)/frame.midpoint*10_000;
 if(!finitePositive(spreadBps)||![bidDepth25Bps,askDepth25Bps].every(Number.isFinite))return null;
 return Object.freeze({timestampMs:frame.timestampMs,midpoint:frame.midpoint,levels,spreadBps,bidDepth25Bps,askDepth25Bps});
}

function firstRecoveryMs(frames:readonly NormalisedFrame[],shockIndex:number,predicate:(frame:NormalisedFrame)=>boolean):number|null{
 const shockTime=frames[shockIndex].timestampMs;
 for(let index=shockIndex+1;index<frames.length;index++)if(predicate(frames[index]))return frames[index].timestampMs-shockTime;
 return null;
}

function replenishmentForSide(opening:NormalisedFrame,shock:NormalisedFrame,closing:NormalisedFrame,side:Side){
 const openingDepth=side==="bid"?opening.bidDepth25Bps:opening.askDepth25Bps;
 const shockDepth=side==="bid"?shock.bidDepth25Bps:shock.askDepth25Bps;
 const closingDepth=side==="bid"?closing.bidDepth25Bps:closing.askDepth25Bps;
 const loss=Math.max(0,openingDepth-shockDepth);
 let samePrice=0;
 for(const[tick,level]of opening.levels){
  const openValue=sideNotional(level,side);if(openValue<=0)continue;
  const distance=Math.abs((level.price-opening.midpoint)/opening.midpoint*10_000);if(!Number.isFinite(distance)||distance>25+1e-9)continue;
  const shockValue=sideNotional(shock.levels.get(tick),side),closingValue=sideNotional(closing.levels.get(tick),side);
  const lost=Math.max(0,openValue-shockValue),refilled=Math.max(0,closingValue-shockValue);
  samePrice+=Math.min(lost,refilled);
 }
 const totalRecovered=Math.min(loss,Math.max(0,closingDepth-shockDepth));
 samePrice=Math.min(totalRecovered,samePrice);
 return{loss,samePrice,migrated:Math.max(0,totalRecovered-samePrice)};
}

export function calculateDizyQuantResilience(input:DizyQuantResilienceInput):DizyQuantResilienceState{
 const{windowFromMs,windowToMs,shockTimestampMs}=input;
 if(!Number.isSafeInteger(windowFromMs)||!Number.isSafeInteger(windowToMs)||!Number.isSafeInteger(shockTimestampMs)||windowFromMs<=0||windowToMs-windowFromMs!==DIZYQUANT_RESILIENCE_WINDOW_MS||shockTimestampMs<=windowFromMs||shockTimestampMs>=windowToMs)return unavailable("Resilience research requires one exact sixty-second window and an interior shock timestamp.");
 if(!finitePositive(input.priceStep)||!finitePositive(input.contractSize))return unavailable("Price step or contract size is unavailable or invalid.");
 if(input.sourceKind!=="depth-stream"&&input.sourceKind!=="retained-liquidity")return unavailable("Resilience source kind is invalid.");
 if(!Array.isArray(input.frames)||input.frames.length<3||input.frames.length>DIZYQUANT_MAX_RESILIENCE_FRAMES)return unavailable("Resilience research requires a bounded sequence with opening, shock and closing states.");
 const frames:NormalisedFrame[]=[];let prior=-Infinity,shockIndex=-1;
 for(const frame of input.frames){
  const value=normaliseFrame(frame,input.priceStep,input.contractSize);
  if(!value||value.timestampMs<=prior||value.timestampMs<windowFromMs||value.timestampMs>windowToMs)return unavailable("Resilience frames are invalid, outside coverage or not strictly event-time ordered.");
  prior=value.timestampMs;if(value.timestampMs===shockTimestampMs)shockIndex=frames.length;frames.push(value);
 }
 if(frames[0].timestampMs!==windowFromMs||frames.at(-1)!.timestampMs!==windowToMs||shockIndex<=0||shockIndex>=frames.length-1)return unavailable("Opening, shock and closing states must match the exact requested timestamps.");
 const opening=frames[0],shock=frames[shockIndex],closing=frames.at(-1)!;
 const spreadWideningPct=(shock.spreadBps/opening.spreadBps-1)*100;
 const bidDepthLossPct=(opening.bidDepth25Bps-shock.bidDepth25Bps)/opening.bidDepth25Bps*100;
 const askDepthLossPct=(opening.askDepth25Bps-shock.askDepth25Bps)/opening.askDepth25Bps*100;
 const shockDerived=[spreadWideningPct,bidDepthLossPct,askDepthLossPct];if(shockDerived.some(value=>!Number.isFinite(value)))return unavailable("Shock arithmetic overflowed the research boundary.");
 const spreadShock=spreadWideningPct+1e-9>=DIZYQUANT_SHOCK_SPREAD_WIDENING_PCT,bidDepthShock=bidDepthLossPct+1e-9>=DIZYQUANT_SHOCK_DEPTH_LOSS_PCT,askDepthShock=askDepthLossPct+1e-9>=DIZYQUANT_SHOCK_DEPTH_LOSS_PCT;
 const shockComponentCount=Number(spreadShock)+Number(bidDepthShock)+Number(askDepthShock);
 if(shockComponentCount===0)return unavailable("The nominated frame does not meet a versioned spread or nearby-depth shock threshold.");
 const spreadRecoveryMs=spreadShock?firstRecoveryMs(frames,shockIndex,frame=>frame.spreadBps<=opening.spreadBps*DIZYQUANT_SPREAD_RECOVERY_PCT/100):null;
 const bidDepthRecoveryMs=bidDepthShock?firstRecoveryMs(frames,shockIndex,frame=>frame.bidDepth25Bps>=opening.bidDepth25Bps*DIZYQUANT_DEPTH_RECOVERY_PCT/100):null;
 const askDepthRecoveryMs=askDepthShock?firstRecoveryMs(frames,shockIndex,frame=>frame.askDepth25Bps>=opening.askDepth25Bps*DIZYQUANT_DEPTH_RECOVERY_PCT/100):null;
 const recoveryValues=[spreadShock?spreadRecoveryMs:undefined,bidDepthShock?bidDepthRecoveryMs:undefined,askDepthShock?askDepthRecoveryMs:undefined];
 const recoveredComponentCount=recoveryValues.filter(value=>typeof value==="number").length;
 const resilienceRecoveryMs=recoveredComponentCount===shockComponentCount?Math.max(...recoveryValues.filter((value):value is number=>typeof value==="number")):null;
 const bidReplenishment=bidDepthShock?replenishmentForSide(opening,shock,closing,"bid"):{loss:0,samePrice:0,migrated:0};
 const askReplenishment=askDepthShock?replenishmentForSide(opening,shock,closing,"ask"):{loss:0,samePrice:0,migrated:0};
 const shockLossNotional=bidReplenishment.loss+askReplenishment.loss,samePriceReplenishmentNotional=bidReplenishment.samePrice+askReplenishment.samePrice,migratedPriceReplenishmentNotional=bidReplenishment.migrated+askReplenishment.migrated;
 const replenishedNotional=samePriceReplenishmentNotional+migratedPriceReplenishmentNotional;
 const replenishmentVsShockLossPct=shockLossNotional>0?replenishedNotional/shockLossNotional*100:null;
 const samePriceReplenishmentSharePct=replenishedNotional>0?samePriceReplenishmentNotional/replenishedNotional*100:null;
 const postShockMidpointChangeBps=(closing.midpoint-shock.midpoint)/shock.midpoint*10_000;
 const vulnerabilityDirection=bidDepthShock&&!askDepthShock?-1:askDepthShock&&!bidDepthShock?1:null;
 const directionalMove=vulnerabilityDirection===null?null:postShockMidpointChangeBps*vulnerabilityDirection;
 const continuationFlag=directionalMove===null?null:Number(directionalMove>=DIZYQUANT_OUTCOME_MOVE_BPS);
 const reversalFlag=directionalMove===null?null:Number(directionalMove<=-DIZYQUANT_OUTCOME_MOVE_BPS);
 const noMovementFlag=directionalMove===null?null:Number(Math.abs(directionalMove)<DIZYQUANT_OUTCOME_MOVE_BPS);
 const absorptionCandidateFlag=directionalMove===null||replenishmentVsShockLossPct===null?null:Number(replenishmentVsShockLossPct>=DIZYQUANT_ABSORPTION_REPLENISHMENT_PCT&&(samePriceReplenishmentSharePct??0)>=50&&directionalMove<DIZYQUANT_OUTCOME_MOVE_BPS);
 const exhaustionCandidateFlag=directionalMove===null||replenishmentVsShockLossPct===null?null:Number(replenishmentVsShockLossPct<DIZYQUANT_EXHAUSTION_MAX_REPLENISHMENT_PCT&&directionalMove>=DIZYQUANT_OUTCOME_MOVE_BPS);
 const candidateLabel:DizyQuantCandidateLabel=absorptionCandidateFlag===1?"absorption":exhaustionCandidateFlag===1?"exhaustion":"none";
 const derived=[resilienceRecoveryMs,shockLossNotional,samePriceReplenishmentNotional,migratedPriceReplenishmentNotional,replenishmentVsShockLossPct,samePriceReplenishmentSharePct,postShockMidpointChangeBps,directionalMove];if(derived.some(value=>value!==null&&!Number.isFinite(value)))return unavailable("Resilience or replenishment arithmetic overflowed the research boundary.");
 const values:Partial<Record<DizyQuantMetricId,number|null>>={
  "shock-spread-widening-pct":spreadWideningPct,
  "shock-bid-depth-loss-25bps-pct":bidDepthLossPct,
  "shock-ask-depth-loss-25bps-pct":askDepthLossPct,
  "spread-recovery-ms":spreadRecoveryMs,
  "bid-depth-recovery-25bps-ms":bidDepthRecoveryMs,
  "ask-depth-recovery-25bps-ms":askDepthRecoveryMs,
  "resilience-recovery-ms":resilienceRecoveryMs,
  "resilience-shocked-component-count":shockComponentCount,
  "resilience-recovered-component-count":recoveredComponentCount,
  "shock-depth-loss-notional":shockLossNotional,
  "same-price-replenishment-post-shock":samePriceReplenishmentNotional,
  "migrated-price-replenishment-post-shock":migratedPriceReplenishmentNotional,
  "replenishment-vs-shock-loss-pct":replenishmentVsShockLossPct,
  "same-price-replenishment-share-pct":samePriceReplenishmentSharePct,
  "post-shock-midpoint-change-bps":postShockMidpointChangeBps,
  "post-shock-continuation-flag":continuationFlag,
  "post-shock-reversal-flag":reversalFlag,
  "post-shock-no-movement-flag":noMovementFlag,
  "absorption-candidate-flag":absorptionCandidateFlag,
  "exhaustion-candidate-flag":exhaustionCandidateFlag,
 };
 const limitations=["Displayed price-level evidence only; individual orders, hidden liquidity and participant identity are unavailable.","Recovery thresholds and candidate labels are versioned descriptive research rules, not causal findings or trading signals."];
 if(vulnerabilityDirection===null)limitations.push("The shock is not directionally unique; continuation, reversal and candidate flags are unavailable.");
 if(resilienceRecoveryMs===null)limitations.push("Not every shocked component recovered before the end of the observed window.");
 if(input.sequenceContinuous!==true||input.hasGaps)limitations.push("Depth continuity is not proven; values remain gapped research only.");
 return Object.freeze({formulaVersion:DIZYQUANT_RESILIENCE_FORMULA_VERSION,valid:true,complete:input.sequenceContinuous===true&&!input.hasGaps,windowFromMs,windowToMs,shockTimestampMs,frameCount:frames.length,spreadShock,bidDepthShock,askDepthShock,shockComponentCount,recoveredComponentCount,spreadWideningPct,bidDepthLossPct,askDepthLossPct,spreadRecoveryMs,bidDepthRecoveryMs,askDepthRecoveryMs,resilienceRecoveryMs,shockLossNotional,samePriceReplenishmentNotional,migratedPriceReplenishmentNotional,replenishmentVsShockLossPct,samePriceReplenishmentSharePct,postShockMidpointChangeBps,continuationFlag,reversalFlag,noMovementFlag,absorptionCandidateFlag,exhaustionCandidateFlag,candidateLabel,values:frozenValues(values),limitations:Object.freeze(limitations)});
}

export type BuildDizyQuantResilienceSnapshotInput=DizyQuantResilienceInput&Readonly<{symbol:string;evaluatedAtMs:number;maxAgeMs:number}>;
export function buildDizyQuantResilienceSnapshot(input:BuildDizyQuantResilienceSnapshotInput):DizyQuantResearchSnapshot{
 const state=calculateDizyQuantResilience(input),sourceKinds:DizyQuantSourceKind[]=[input.sourceKind];
 return buildDizyQuantResearchSnapshot({symbol:input.symbol,sourceTimeMs:input.windowToMs,evaluatedAtMs:input.evaluatedAtMs,maxAgeMs:input.maxAgeMs,evidenceGrade:"continuous-stream-grade",sequenceContinuous:input.sequenceContinuous,hasGaps:input.hasGaps,sourceKinds,coverage:{fromMs:input.windowFromMs,toMs:input.windowToMs},values:state.values,limitations:state.limitations});
}
