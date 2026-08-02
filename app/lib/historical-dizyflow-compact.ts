import type { DizyFlowIntelligenceSnapshot } from "./order-flow/intelligence";
import type { HistoricalDizyFlowSample, HistoricalFlowWallSummary } from "./historical-dizyflow";

/** Converts PR #117 validated intelligence only. Raw depth levels and trade arrays are never copied. */
export function compactDizyFlowSample(snapshot:DizyFlowIntelligenceSnapshot):HistoricalDizyFlowSample {
  const wall=(side:"bid"|"ask")=>snapshot.walls.candidates.filter(candidate=>candidate.side===side).sort((a,b)=>a.distancePct-b.distancePct||a.price-b.price)[0];
  const summary=(candidate:ReturnType<typeof wall>):HistoricalFlowWallSummary|null=>candidate?Object.freeze({price:candidate.price,distancePct:candidate.distancePct,classification:candidate.classification,status:candidate.status,confidence:candidate.confidence}):null;
  return Object.freeze({timeMs:snapshot.receivedTimeMs,inputHash:snapshot.inputHash,referencePrice:snapshot.referencePrice,referencePriceSource:snapshot.referencePriceSource,availability:snapshot.availability,intelligenceConfidence:snapshot.intelligenceConfidence,confidenceBand:snapshot.confidenceBand,spreadPct:snapshot.spread.percentage,depthBands:Object.freeze(snapshot.depth.bands.map((band,index)=>Object.freeze({bandPct:band.bandPct,bidNotional:band.bidNotional,askNotional:band.askNotional,centredImbalance:snapshot.imbalance.bands[index]?.value??null}))),nearestBidWall:summary(wall("bid")),nearestAskWall:summary(wall("ask")),tradeFlowImbalance:snapshot.trades.aggressorImbalance,findingCodes:Object.freeze(snapshot.findings.map(finding=>finding.code).slice(0,20)),limitationCodes:Object.freeze(snapshot.limitations.map(limitation=>limitation.code).slice(0,20))});
}
