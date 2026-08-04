import type{RawTrade}from"../order-flow/types.ts";
import{buildDizyQuantResearchSnapshot,type DizyQuantMetricId,type DizyQuantResearchSnapshot,type DizyQuantSourceKind}from"./research.ts";

export const DIZYQUANT_AGGRESSIVE_FLOW_FORMULA_VERSION="dizyquant-aggressive-flow/1.0.0" as const;
export const DIZYQUANT_AGGRESSIVE_FLOW_WINDOW_MS=10_000 as const;
export const DIZYQUANT_MAX_TRADES_PER_WINDOW=100_000 as const;

export type DizyQuantAggressiveFlowValues=Readonly<Partial<Record<DizyQuantMetricId,number|null>>>;
export type DizyQuantAggressiveFlowInput=Readonly<{
 trades:readonly RawTrade[];
 windowFromMs:number;
 windowToMs:number;
 sequenceContinuous:boolean|null;
 hasGaps:boolean;
 openingMidpoint:number|null;
 closingMidpoint:number|null;
 openingBidDepth25Bps:number|null;
 openingAskDepth25Bps:number|null;
}>;
export type DizyQuantAggressiveFlowState=Readonly<{
 formulaVersion:typeof DIZYQUANT_AGGRESSIVE_FLOW_FORMULA_VERSION;
 valid:boolean;
 complete:boolean;
 windowFromMs:number|null;
 windowToMs:number|null;
 tradeCount:number;
 buyTradeCount:number;
 sellTradeCount:number;
 buyNotional:number|null;
 sellNotional:number|null;
 grossNotional:number|null;
 netNotional:number|null;
 flowImbalancePct:number|null;
 tradeCountImbalancePct:number|null;
 buyFlowVsOpeningAskDepth25BpsPct:number|null;
 sellFlowVsOpeningBidDepth25BpsPct:number|null;
 midpointChangeBps:number|null;
 flowAlignedResponseBps:number|null;
 flowEfficiencyBpsPerMillion:number|null;
 values:DizyQuantAggressiveFlowValues;
 limitations:readonly string[];
}>;

const finitePositive=(value:number)=>Number.isFinite(value)&&value>0;
const finiteNonNegative=(value:number)=>Number.isFinite(value)&&value>=0;
const validNullable=(value:number|null,allowZero:boolean)=>value===null||(allowZero?finiteNonNegative(value):finitePositive(value));
const normalisedTradeId=(value:string)=>{const clean=value.trim();return clean.length>0&&clean.length<=160&&!/[\u0000-\u001f]/.test(clean)?clean:null};
const frozenValues=(values:Partial<Record<DizyQuantMetricId,number|null>>)=>Object.freeze(values)as DizyQuantAggressiveFlowValues;

function unavailable(reason:string):DizyQuantAggressiveFlowState{
 return Object.freeze({formulaVersion:DIZYQUANT_AGGRESSIVE_FLOW_FORMULA_VERSION,valid:false,complete:false,windowFromMs:null,windowToMs:null,tradeCount:0,buyTradeCount:0,sellTradeCount:0,buyNotional:null,sellNotional:null,grossNotional:null,netNotional:null,flowImbalancePct:null,tradeCountImbalancePct:null,buyFlowVsOpeningAskDepth25BpsPct:null,sellFlowVsOpeningBidDepth25BpsPct:null,midpointChangeBps:null,flowAlignedResponseBps:null,flowEfficiencyBpsPerMillion:null,values:frozenValues({}),limitations:Object.freeze([reason])});
}

export function calculateDizyQuantAggressiveFlow(input:DizyQuantAggressiveFlowInput):DizyQuantAggressiveFlowState{
 const{windowFromMs,windowToMs}=input;
 if(!Number.isSafeInteger(windowFromMs)||!Number.isSafeInteger(windowToMs)||windowFromMs<=0||windowToMs-windowFromMs!==DIZYQUANT_AGGRESSIVE_FLOW_WINDOW_MS)return unavailable("Aggressive-flow research requires one exact ten-second event window.");
 if(input.trades.length>DIZYQUANT_MAX_TRADES_PER_WINDOW)return unavailable("Aggressive-flow trade window exceeds the bounded research limit.");
 if(!validNullable(input.openingMidpoint,false)||!validNullable(input.closingMidpoint,false))return unavailable("Midpoint context is invalid.");
 if(!validNullable(input.openingBidDepth25Bps,true)||!validNullable(input.openingAskDepth25Bps,true))return unavailable("Opening visible-depth context is invalid.");
 let previousTime=-Infinity,buyNotional=0,sellNotional=0,buyTradeCount=0,sellTradeCount=0;
 const ids=new Set<string>();
 for(const trade of input.trades){
  const tradeId=normalisedTradeId(trade.tradeId);
  if(tradeId===null||ids.has(tradeId))return unavailable("Public trade identity is missing or duplicated.");
  ids.add(tradeId);
  if(!Number.isSafeInteger(trade.timestampMs)||trade.timestampMs<windowFromMs||trade.timestampMs>=windowToMs||trade.timestampMs<previousTime)return unavailable("Public trades are outside the half-open window or not event-time ordered.");
  previousTime=trade.timestampMs;
  if(!finitePositive(trade.price)||!finitePositive(trade.quantity)||!finitePositive(trade.notional)||(trade.side!=="buy"&&trade.side!=="sell"))return unavailable("Public trade contains invalid price, quantity, notional or aggressor side.");
  if(trade.side==="buy"){
   const next=buyNotional+trade.notional;if(!Number.isFinite(next))return unavailable("Aggressive buy notional overflowed the research boundary.");buyNotional=next;buyTradeCount++;
  }else{
   const next=sellNotional+trade.notional;if(!Number.isFinite(next))return unavailable("Aggressive sell notional overflowed the research boundary.");sellNotional=next;sellTradeCount++;
  }
 }
 const grossNotional=buyNotional+sellNotional,netNotional=buyNotional-sellNotional,tradeCount=buyTradeCount+sellTradeCount;
 if(!Number.isFinite(grossNotional)||!Number.isFinite(netNotional)||!Number.isSafeInteger(tradeCount))return unavailable("Aggressive-flow aggregation overflowed the research boundary.");
 const flowImbalancePct=grossNotional>0?netNotional/grossNotional*100:null;
 const tradeCountImbalancePct=tradeCount>0?(buyTradeCount-sellTradeCount)/tradeCount*100:null;
 const buyFlowVsOpeningAskDepth25BpsPct=input.openingAskDepth25Bps!==null&&input.openingAskDepth25Bps>0?buyNotional/input.openingAskDepth25Bps*100:null;
 const sellFlowVsOpeningBidDepth25BpsPct=input.openingBidDepth25Bps!==null&&input.openingBidDepth25Bps>0?sellNotional/input.openingBidDepth25Bps*100:null;
 const midpointChangeBps=input.openingMidpoint!==null&&input.closingMidpoint!==null?(input.closingMidpoint-input.openingMidpoint)/input.openingMidpoint*10_000:null;
 const flowAlignedResponseBps=midpointChangeBps!==null&&netNotional!==0?midpointChangeBps*Math.sign(netNotional):null;
 const flowEfficiencyBpsPerMillion=flowAlignedResponseBps!==null&&grossNotional>0?flowAlignedResponseBps/(grossNotional/1_000_000):null;
 const derived=[flowImbalancePct,tradeCountImbalancePct,buyFlowVsOpeningAskDepth25BpsPct,sellFlowVsOpeningBidDepth25BpsPct,midpointChangeBps,flowAlignedResponseBps,flowEfficiencyBpsPerMillion];
 if(derived.some(value=>value!==null&&!Number.isFinite(value)))return unavailable("Aggressive-flow derived arithmetic overflowed the research boundary.");
 const values:Partial<Record<DizyQuantMetricId,number|null>>={
  "aggressive-buy-notional-10s":buyNotional,
  "aggressive-sell-notional-10s":sellNotional,
  "aggressive-gross-notional-10s":grossNotional,
  "aggressive-net-notional-10s":netNotional,
  "aggressive-flow-imbalance-10s":flowImbalancePct,
  "aggressive-buy-trade-count-10s":buyTradeCount,
  "aggressive-sell-trade-count-10s":sellTradeCount,
  "aggressive-trade-count-imbalance-10s":tradeCountImbalancePct,
  "buy-flow-vs-opening-ask-depth-25bps":buyFlowVsOpeningAskDepth25BpsPct,
  "sell-flow-vs-opening-bid-depth-25bps":sellFlowVsOpeningBidDepth25BpsPct,
  "midpoint-change-10s-bps":midpointChangeBps,
  "flow-aligned-response-10s-bps":flowAlignedResponseBps,
  "flow-efficiency-bps-per-million-10s":flowEfficiencyBpsPerMillion,
 };
 const limitations=["Public aggressor-side labels follow provider semantics; private intent and hidden executions are unavailable."];
 if(input.sequenceContinuous!==true||input.hasGaps)limitations.push("Trade continuity is not proven; values remain gapped research only.");
 if(input.openingBidDepth25Bps===null||input.openingAskDepth25Bps===null||input.openingBidDepth25Bps===0||input.openingAskDepth25Bps===0)limitations.push("Opening 25-bps visible depth is incomplete; flow-to-depth pressure may be unavailable.");
 if(input.openingMidpoint===null||input.closingMidpoint===null)limitations.push("Opening or closing midpoint is unavailable; price-response metrics are unavailable.");
 return Object.freeze({formulaVersion:DIZYQUANT_AGGRESSIVE_FLOW_FORMULA_VERSION,valid:true,complete:input.sequenceContinuous===true&&!input.hasGaps,windowFromMs,windowToMs,tradeCount,buyTradeCount,sellTradeCount,buyNotional,sellNotional,grossNotional,netNotional,flowImbalancePct,tradeCountImbalancePct,buyFlowVsOpeningAskDepth25BpsPct,sellFlowVsOpeningBidDepth25BpsPct,midpointChangeBps,flowAlignedResponseBps,flowEfficiencyBpsPerMillion,values:frozenValues(values),limitations:Object.freeze(limitations)});
}

export type BuildDizyQuantAggressiveFlowSnapshotInput=DizyQuantAggressiveFlowInput&Readonly<{symbol:string;evaluatedAtMs:number;maxAgeMs:number}>;
export function buildDizyQuantAggressiveFlowSnapshot(input:BuildDizyQuantAggressiveFlowSnapshotInput):DizyQuantResearchSnapshot{
 const state=calculateDizyQuantAggressiveFlow(input);
 const sourceKinds:DizyQuantSourceKind[]=["public-trades"];
 if(input.openingMidpoint!==null||input.closingMidpoint!==null||input.openingBidDepth25Bps!==null||input.openingAskDepth25Bps!==null)sourceKinds.push("depth-snapshot");
 return buildDizyQuantResearchSnapshot({symbol:input.symbol,sourceTimeMs:input.windowToMs,evaluatedAtMs:input.evaluatedAtMs,maxAgeMs:input.maxAgeMs,evidenceGrade:"continuous-stream-grade",sequenceContinuous:input.sequenceContinuous,hasGaps:input.hasGaps,sourceKinds,coverage:{fromMs:input.windowFromMs,toMs:input.windowToMs},values:state.values,limitations:state.limitations});
}
