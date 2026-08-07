import type { BookView, DepthEnvelope } from "./types.ts";
import type { NormalizedOrderFlowInput, NormalizedPublicTrade, ReferencePriceSource } from "./intelligence.ts";
import { observeDizyQuantOrderFlowRuntime } from "../dizyquant/order-flow-runtime.ts";

export type AuthoritativeReference = Readonly<{ price:number;source:Exclude<ReferencePriceSource,"midpoint"> }>;

/** Converts typed public feed state into Intelligence input. No rendered DOM state is read. */
export function adaptLiveOrderFlow(input:{envelope:DepthEnvelope;book:BookView;marketKey:string;marketType:"spot"|"futures";contractSize:number;tickSize:number|null;recentTrades:readonly NormalizedPublicTrade[];reference?:AuthoritativeReference}):NormalizedOrderFlowInput{
 const {envelope,book}=input,bestBid=book.bids[0]?.price,bestAsk=book.asks[0]?.price;
 const midpoint=bestBid!==undefined&&bestAsk!==undefined?(bestBid+bestAsk)/2:null;
 const reference=input.reference??(midpoint===null?null:{price:midpoint,source:"midpoint" as const});
 if(!reference)throw new TypeError("A reference price or two-sided midpoint is required");
 const diagnostic=envelope.diagnostic,sourceMode=diagnostic.sourceMode;
 const connected=sourceMode!=="NO VALID BOOK"&&sourceMode!=="RECONNECTING — LAST BOOK RETAINED";
 const recovering=diagnostic.recovering===true||sourceMode==="RECONNECTING — LAST BOOK RETAINED";
 const sequenceContinuous=recovering?null:(diagnostic.sequenceContinuous??null);
 const adapted:NormalizedOrderFlowInput={marketKey:input.marketKey,symbol:envelope.snapshot.symbol,marketType:input.marketType,exchange:"mexc",exchangeTimeMs:diagnostic.sourceTimestampKnown===false?null:envelope.snapshot.engineTimeMs,receivedTimeMs:envelope.receivedAt,referencePrice:reference.price,referencePriceSource:reference.source,tickSize:input.tickSize,quantityStep:null,bids:book.bids.map(level=>({price:level.price,quantity:level.contractQuantity*input.contractSize})),asks:book.asks.map(level=>({price:level.price,quantity:level.contractQuantity*input.contractSize})),recentTrades:input.recentTrades,feed:{connected,snapshotComplete:diagnostic.snapshotComplete??false,sequenceKnown:diagnostic.sequenceKnown??false,sequenceContinuous,sourceTimestampKnown:diagnostic.sourceTimestampKnown??false,ageMs:Math.max(0,diagnostic.snapshotAgeMs),stale:diagnostic.snapshotAgeMs>5_000,bidLevelCount:book.bids.length,askLevelCount:book.asks.length,recentTradeCount:input.recentTrades.length,warnings:[...(recovering?["Depth feed is recovering; continuity is unconfirmed."]:[]),...(sequenceContinuous===null?["Depth sequence continuity is unknown."]:[]),...(diagnostic.lastError?[diagnostic.lastError]:[])]}};
 if(typeof window!=="undefined"){
  try{observeDizyQuantOrderFlowRuntime(input)}catch{}
 }
 return adapted;
}
