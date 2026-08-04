export const DIZYQUANT_RESEARCH_SCHEMA_VERSION=1 as const;
export const DIZYQUANT_METRIC_SET_VERSION="dizyquant-candidates/1.4.0" as const;

export type DizyQuantEvidenceGrade="snapshot-grade"|"continuous-stream-grade";
export type DizyQuantAvailability="fresh"|"stale"|"gapped"|"unavailable";
export type DizyQuantReplayAvailability="fresh"|"gapped"|"unavailable";
export type DizyQuantPromotionStatus="informational"|"experimental"|"validated"|"rejected";
export type DizyQuantSourceKind="depth-snapshot"|"depth-stream"|"public-trades"|"retained-liquidity"|"replay";
export type DizyQuantUnit="price"|"ticks"|"basis-points"|"percent"|"percentage-points"|"quote-notional"|"base-quantity"|"milliseconds"|"count"|"flag"|"basis-points-per-million-quote";

const candidateRows=[
 ["spread-price","Quoted spread price","price","snapshot-grade","informational","Best ask minus best bid in provider price units."],
 ["spread-ticks","Quoted spread ticks","ticks","snapshot-grade","informational","Quoted spread divided by the reviewed public price step."],
 ["spread-bps","Quoted spread","basis-points","snapshot-grade","informational","Best ask minus best bid expressed relative to midpoint."],
 ["bid-depth-10bps","Bid depth within 10 bps","quote-notional","snapshot-grade","informational","Visible bid notional inside ten basis points of midpoint."],
 ["ask-depth-10bps","Ask depth within 10 bps","quote-notional","snapshot-grade","informational","Visible ask notional inside ten basis points of midpoint."],
 ["depth-imbalance-10bps","Depth imbalance within 10 bps","percent","snapshot-grade","informational","Bid-versus-ask visible notional imbalance inside ten basis points of midpoint."],
 ["bid-depth-25bps","Bid depth within 25 bps","quote-notional","snapshot-grade","informational","Visible bid notional inside twenty-five basis points of midpoint."],
 ["ask-depth-25bps","Ask depth within 25 bps","quote-notional","snapshot-grade","informational","Visible ask notional inside twenty-five basis points of midpoint."],
 ["depth-imbalance-25bps","Depth imbalance within 25 bps","percent","snapshot-grade","informational","Bid-versus-ask visible notional imbalance inside twenty-five basis points of midpoint."],
 ["bid-depth-50bps","Bid depth within 50 bps","quote-notional","snapshot-grade","informational","Visible bid notional inside fifty basis points of midpoint."],
 ["ask-depth-50bps","Ask depth within 50 bps","quote-notional","snapshot-grade","informational","Visible ask notional inside fifty basis points of midpoint."],
 ["depth-imbalance-50bps","Depth imbalance within 50 bps","percent","snapshot-grade","informational","Bid-versus-ask visible notional imbalance inside fifty basis points of midpoint."],
 ["bid-depth-100bps","Bid depth within 100 bps","quote-notional","snapshot-grade","informational","Visible bid notional inside one hundred basis points of midpoint."],
 ["ask-depth-100bps","Ask depth within 100 bps","quote-notional","snapshot-grade","informational","Visible ask notional inside one hundred basis points of midpoint."],
 ["depth-imbalance-100bps","Depth imbalance within 100 bps","percent","snapshot-grade","informational","Bid-versus-ask visible notional imbalance inside one hundred basis points of midpoint."],
 ["depth-weighted-distance-100bps","Depth-weighted distance within 100 bps","basis-points","snapshot-grade","informational","Visible-notional-weighted absolute distance from midpoint inside one hundred basis points."],
 ["near-depth-concentration-25-of-100bps","Near-depth concentration","percent","snapshot-grade","informational","Visible notional inside twenty-five basis points divided by visible notional inside one hundred basis points."],
 ["aggressive-buy-notional-10s","Aggressive buy notional over 10 seconds","quote-notional","continuous-stream-grade","informational","Provider-labelled public buy-aggressor notional in the ten-second event window."],
 ["aggressive-sell-notional-10s","Aggressive sell notional over 10 seconds","quote-notional","continuous-stream-grade","informational","Provider-labelled public sell-aggressor notional in the ten-second event window."],
 ["aggressive-gross-notional-10s","Gross aggressive notional over 10 seconds","quote-notional","continuous-stream-grade","informational","Public buy-aggressor plus sell-aggressor notional in the ten-second event window."],
 ["aggressive-net-notional-10s","Net aggressive notional over 10 seconds","quote-notional","continuous-stream-grade","informational","Public buy-aggressor minus sell-aggressor notional in the ten-second event window."],
 ["aggressive-flow-imbalance-10s","Aggressive flow imbalance over 10 seconds","percent","continuous-stream-grade","informational","Net public aggressor notional divided by gross public aggressor notional."],
 ["aggressive-buy-trade-count-10s","Aggressive buy trade count over 10 seconds","count","continuous-stream-grade","informational","Count of provider-labelled public buy-aggressor executions in the event window."],
 ["aggressive-sell-trade-count-10s","Aggressive sell trade count over 10 seconds","count","continuous-stream-grade","informational","Count of provider-labelled public sell-aggressor executions in the event window."],
 ["aggressive-trade-count-imbalance-10s","Aggressive trade-count imbalance over 10 seconds","percent","continuous-stream-grade","informational","Buy-aggressor count minus sell-aggressor count divided by total public trade count."],
 ["buy-flow-vs-opening-ask-depth-25bps","Buy flow versus opening ask depth","percent","continuous-stream-grade","informational","Buy-aggressor notional divided by opening displayed ask notional inside twenty-five basis points."],
 ["sell-flow-vs-opening-bid-depth-25bps","Sell flow versus opening bid depth","percent","continuous-stream-grade","informational","Sell-aggressor notional divided by opening displayed bid notional inside twenty-five basis points."],
 ["midpoint-change-10s-bps","Midpoint change over 10 seconds","basis-points","continuous-stream-grade","informational","Closing midpoint minus opening midpoint expressed in basis points of the opening midpoint."],
 ["flow-aligned-response-10s-bps","Flow-aligned midpoint response","basis-points","continuous-stream-grade","informational","Midpoint change signed so positive values align with net public aggressor flow."],
 ["flow-efficiency-bps-per-million-10s","Flow-aligned response per million","basis-points-per-million-quote","continuous-stream-grade","informational","Flow-aligned midpoint response divided by gross public aggressor notional in millions."],
 ["liquidity-added-30s","Displayed liquidity added over 30 seconds","quote-notional","continuous-stream-grade","informational","Cumulative positive displayed-depth changes across consecutive price-level states."],
 ["liquidity-removed-30s","Displayed liquidity removed over 30 seconds","quote-notional","continuous-stream-grade","informational","Cumulative negative displayed-depth changes across consecutive price-level states."],
 ["bid-liquidity-added-30s","Bid liquidity added over 30 seconds","quote-notional","continuous-stream-grade","informational","Cumulative positive displayed bid-depth changes across the event window."],
 ["ask-liquidity-added-30s","Ask liquidity added over 30 seconds","quote-notional","continuous-stream-grade","informational","Cumulative positive displayed ask-depth changes across the event window."],
 ["bid-liquidity-removed-30s","Bid liquidity removed over 30 seconds","quote-notional","continuous-stream-grade","informational","Cumulative negative displayed bid-depth changes across the event window."],
 ["ask-liquidity-removed-30s","Ask liquidity removed over 30 seconds","quote-notional","continuous-stream-grade","informational","Cumulative negative displayed ask-depth changes across the event window."],
 ["liquidity-turnover-30s","Displayed liquidity turnover over 30 seconds","quote-notional","continuous-stream-grade","informational","Displayed liquidity additions plus removals across the event window."],
 ["liquidity-turnover-vs-opening-depth-30s","Liquidity turnover versus opening depth","percent","continuous-stream-grade","informational","Displayed liquidity turnover divided by opening displayed depth notional."],
 ["bid-same-price-persistence-30s","Bid same-price persistence","percent","continuous-stream-grade","informational","Opening bid notional still displayed at the same price after thirty seconds."],
 ["ask-same-price-persistence-30s","Ask same-price persistence","percent","continuous-stream-grade","informational","Opening ask notional still displayed at the same price after thirty seconds."],
 ["same-price-liquidity-persistence-30s","Combined same-price persistence","percent","continuous-stream-grade","informational","Opening displayed notional still present at the same side and price after thirty seconds."],
 ["opening-cluster-survival-30s","Opening cluster survival","percent","continuous-stream-grade","informational","Share of upper-quartile opening price levels retaining at least half their displayed notional at the same price."],
 ["liquidity-centre-shift-bps","Signed liquidity centre shift","basis-points","continuous-stream-grade","informational","Closing minus opening signed visible-liquidity centre relative to each frame midpoint."],
 ["liquidity-absolute-distance-shift-30s-bps","Absolute liquidity distance shift","basis-points","continuous-stream-grade","informational","Closing minus opening visible-notional-weighted absolute distance from midpoint."],
 ["bid-centre-distance-shift-30s-bps","Bid centre distance shift","basis-points","continuous-stream-grade","informational","Closing minus opening bid-notional-weighted absolute distance from midpoint."],
 ["ask-centre-distance-shift-30s-bps","Ask centre distance shift","basis-points","continuous-stream-grade","informational","Closing minus opening ask-notional-weighted absolute distance from midpoint."],
 ["near-depth-concentration-shift-25-of-100bps-30s","Near-depth concentration shift","percentage-points","continuous-stream-grade","informational","Closing minus opening share of visible 100-bps depth located inside twenty-five basis points."],
 ["resilience-recovery-ms","Liquidity recovery time","milliseconds","continuous-stream-grade","informational","Elapsed event time for every shocked spread or nearby-depth component to recover under the versioned rule."],
 ["shock-spread-widening-pct","Shock spread widening","percent","continuous-stream-grade","informational","Shock-frame spread widening relative to the opening spread."],
 ["shock-bid-depth-loss-25bps-pct","Shock bid-depth loss within 25 bps","percent","continuous-stream-grade","informational","Opening minus shock-frame displayed bid depth inside twenty-five basis points, divided by opening depth."],
 ["shock-ask-depth-loss-25bps-pct","Shock ask-depth loss within 25 bps","percent","continuous-stream-grade","informational","Opening minus shock-frame displayed ask depth inside twenty-five basis points, divided by opening depth."],
 ["spread-recovery-ms","Spread recovery time","milliseconds","continuous-stream-grade","informational","Elapsed time after shock until spread returns within one hundred ten percent of opening spread."],
 ["bid-depth-recovery-25bps-ms","Bid-depth recovery time","milliseconds","continuous-stream-grade","informational","Elapsed time after shock until displayed bid depth inside twenty-five basis points returns to ninety percent of opening depth."],
 ["ask-depth-recovery-25bps-ms","Ask-depth recovery time","milliseconds","continuous-stream-grade","informational","Elapsed time after shock until displayed ask depth inside twenty-five basis points returns to ninety percent of opening depth."],
 ["resilience-shocked-component-count","Shocked component count","count","continuous-stream-grade","informational","Count of versioned spread, bid-depth and ask-depth shock conditions met."],
 ["resilience-recovered-component-count","Recovered component count","count","continuous-stream-grade","informational","Count of shocked components that recovered before the observation window ended."],
 ["shock-depth-loss-notional","Shock nearby-depth loss","quote-notional","continuous-stream-grade","informational","Displayed twenty-five-basis-point depth lost between opening and shock on directionally affected sides."],
 ["same-price-replenishment-post-shock","Same-price replenishment after shock","quote-notional","continuous-stream-grade","informational","Lost nearby displayed depth restored at the same side and price by the closing frame."],
 ["migrated-price-replenishment-post-shock","Migrated-price replenishment after shock","quote-notional","continuous-stream-grade","informational","Recovered nearby displayed depth not attributable to same-price restoration."],
 ["replenishment-vs-shock-loss-pct","Replenishment versus shock loss","percent","continuous-stream-grade","informational","Recovered nearby displayed depth divided by measured shock depth loss."],
 ["same-price-replenishment-share-pct","Same-price replenishment share","percent","continuous-stream-grade","informational","Same-price replenishment divided by all measured post-shock replenishment."],
 ["post-shock-midpoint-change-bps","Post-shock midpoint change","basis-points","continuous-stream-grade","informational","Closing midpoint minus shock midpoint expressed in basis points of shock midpoint."],
 ["post-shock-continuation-flag","Post-shock continuation flag","flag","continuous-stream-grade","informational","One when midpoint moves at least two basis points in the unique depth-vulnerability direction."],
 ["post-shock-reversal-flag","Post-shock reversal flag","flag","continuous-stream-grade","informational","One when midpoint moves at least two basis points opposite the unique depth-vulnerability direction."],
 ["post-shock-no-movement-flag","Post-shock no-movement flag","flag","continuous-stream-grade","informational","One when absolute direction-aligned midpoint movement remains below two basis points."],
 ["absorption-candidate-flag","Depth-only absorption candidate","flag","continuous-stream-grade","experimental","Versioned depth-only candidate requiring substantial mostly same-price replenishment without directional continuation."],
 ["exhaustion-candidate-flag","Depth-only exhaustion candidate","flag","continuous-stream-grade","experimental","Versioned depth-only candidate requiring weak replenishment and directional continuation."],
] as const;
export type DizyQuantMetricId=typeof candidateRows[number][0];
export type DizyQuantMetricDefinition=Readonly<{
 id:DizyQuantMetricId;version:1;label:string;unit:DizyQuantUnit;evidenceGrade:DizyQuantEvidenceGrade;
 promotionStatus:DizyQuantPromotionStatus;description:string;signalEligible:false;
}>;
export const DIZYQUANT_METRIC_DEFINITIONS=Object.freeze(candidateRows.map(([id,label,unit,evidenceGrade,promotionStatus,description])=>Object.freeze({id,version:1 as const,label,unit,evidenceGrade,promotionStatus,description,signalEligible:false as const}))) as readonly DizyQuantMetricDefinition[];
const definitionById=new Map<DizyQuantMetricId,DizyQuantMetricDefinition>(DIZYQUANT_METRIC_DEFINITIONS.map(value=>[value.id,value]));

export type DizyQuantMetricObservation=Readonly<{
 id:DizyQuantMetricId;version:1;unit:DizyQuantUnit;promotionStatus:DizyQuantPromotionStatus;value:number|null;signalEligible:false;
}>;
export type DizyQuantCoverage=Readonly<{fromMs:number|null;toMs:number|null}>;
export type DizyQuantResearchSnapshot=Readonly<{
 schemaVersion:typeof DIZYQUANT_RESEARCH_SCHEMA_VERSION;metricSetVersion:typeof DIZYQUANT_METRIC_SET_VERSION;
 symbol:string;sourceTimeMs:number;evaluatedAtMs:number;ageMs:number;maxAgeMs:number;evidenceGrade:DizyQuantEvidenceGrade;
 availability:DizyQuantAvailability;sequenceContinuous:boolean|null;hasGaps:boolean;sourceKinds:readonly DizyQuantSourceKind[];
 coverage:DizyQuantCoverage;metrics:readonly DizyQuantMetricObservation[];availableMetricCount:number;limitations:readonly string[];
 decisionEligible:false;signalInfluence:"forbidden";
}>;
export type BuildDizyQuantResearchSnapshotInput=Readonly<{
 symbol:string;sourceTimeMs:number;evaluatedAtMs:number;maxAgeMs:number;evidenceGrade:DizyQuantEvidenceGrade;
 sequenceContinuous:boolean|null;hasGaps:boolean;sourceKinds:readonly DizyQuantSourceKind[];coverage:DizyQuantCoverage;
 values:Readonly<Partial<Record<DizyQuantMetricId,number|null>>>;limitations?:readonly string[];
}>;

const symbolPattern=/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const finite=(value:number,label:string)=>{if(!Number.isFinite(value))throw Error(`Invalid ${label}`);return value};
const cleanText=(value:string,label:string,max=160)=>{const clean=value.trim();if(!clean||clean.length>max||/[\u0000-\u001f]/.test(clean))throw Error(`Invalid ${label}`);return clean};

export function classifyDizyQuantAvailability(input:Pick<BuildDizyQuantResearchSnapshotInput,"sourceTimeMs"|"evaluatedAtMs"|"maxAgeMs"|"evidenceGrade"|"sequenceContinuous"|"hasGaps"|"values">):DizyQuantAvailability{
 const numeric=Object.values(input.values).some(value=>typeof value==="number"&&Number.isFinite(value));
 if(!numeric)return"unavailable";
 if(input.hasGaps||input.evidenceGrade==="continuous-stream-grade"&&input.sequenceContinuous!==true)return"gapped";
 return input.evaluatedAtMs-input.sourceTimeMs>input.maxAgeMs?"stale":"fresh";
}

export function buildDizyQuantResearchSnapshot(input:BuildDizyQuantResearchSnapshotInput):DizyQuantResearchSnapshot{
 const symbol=input.symbol.trim().toUpperCase();if(!symbolPattern.test(symbol))throw Error("Invalid DizyQuant symbol");
 const sourceTimeMs=finite(input.sourceTimeMs,"source time"),evaluatedAtMs=finite(input.evaluatedAtMs,"evaluation time"),maxAgeMs=finite(input.maxAgeMs,"maximum age");
 if(sourceTimeMs<=0||evaluatedAtMs<=0||maxAgeMs<=0||sourceTimeMs>evaluatedAtMs+5_000)throw Error("Invalid DizyQuant time boundary");
 const sourceKinds=[...new Set(input.sourceKinds)];if(!sourceKinds.length||sourceKinds.length!==input.sourceKinds.length)throw Error("Invalid DizyQuant sources");
 const fromMs=input.coverage.fromMs,toMs=input.coverage.toMs;if(fromMs!==null)finite(fromMs,"coverage start");if(toMs!==null)finite(toMs,"coverage end");if((fromMs===null)!==(toMs===null)||fromMs!==null&&toMs!==null&&(fromMs<=0||toMs<fromMs||toMs>sourceTimeMs+5_000))throw Error("Invalid DizyQuant coverage");
 for(const[id,value]of Object.entries(input.values)){if(!definitionById.has(id as DizyQuantMetricId))throw Error("Unknown DizyQuant metric");if(value!==null&&value!==undefined&&!Number.isFinite(value))throw Error(`Invalid DizyQuant value for ${id}`)}
 const metrics=DIZYQUANT_METRIC_DEFINITIONS.map(definition=>Object.freeze({id:definition.id,version:definition.version,unit:definition.unit,promotionStatus:definition.promotionStatus,value:input.values[definition.id]??null,signalEligible:false as const}));
 const limitations=Object.freeze([...(input.limitations??[])].map((value,index)=>cleanText(value,`limitation ${index+1}`)));
 const availability=classifyDizyQuantAvailability({...input,sourceTimeMs,evaluatedAtMs,maxAgeMs});
 return Object.freeze({schemaVersion:DIZYQUANT_RESEARCH_SCHEMA_VERSION,metricSetVersion:DIZYQUANT_METRIC_SET_VERSION,symbol,sourceTimeMs,evaluatedAtMs,ageMs:Math.max(0,evaluatedAtMs-sourceTimeMs),maxAgeMs,evidenceGrade:input.evidenceGrade,availability,sequenceContinuous:input.sequenceContinuous,hasGaps:input.hasGaps,sourceKinds:Object.freeze(sourceKinds),coverage:Object.freeze({fromMs,toMs}),metrics:Object.freeze(metrics),availableMetricCount:metrics.filter(value=>value.value!==null).length,limitations,decisionEligible:false,signalInfluence:"forbidden"});
}

export type DizyQuantReplaySnapshot=Readonly<{
 schemaVersion:typeof DIZYQUANT_RESEARCH_SCHEMA_VERSION;metricSetVersion:typeof DIZYQUANT_METRIC_SET_VERSION;
 symbol:string;sourceTimeMs:number;evidenceGrade:DizyQuantEvidenceGrade;availability:DizyQuantReplayAvailability;
 sequenceContinuous:boolean|null;hasGaps:boolean;sourceKinds:readonly DizyQuantSourceKind[];coverage:DizyQuantCoverage;
 metrics:readonly DizyQuantMetricObservation[];availableMetricCount:number;limitations:readonly string[];signalInfluence:"forbidden";
}>;
const replayAvailability=(value:DizyQuantAvailability):DizyQuantReplayAvailability=>value==="stale"?"fresh":value;
export function toDizyQuantReplaySnapshot(snapshot:DizyQuantResearchSnapshot):DizyQuantReplaySnapshot{
 return Object.freeze({schemaVersion:snapshot.schemaVersion,metricSetVersion:snapshot.metricSetVersion,symbol:snapshot.symbol,sourceTimeMs:snapshot.sourceTimeMs,evidenceGrade:snapshot.evidenceGrade,availability:replayAvailability(snapshot.availability),sequenceContinuous:snapshot.sequenceContinuous,hasGaps:snapshot.hasGaps,sourceKinds:snapshot.sourceKinds,coverage:snapshot.coverage,metrics:snapshot.metrics,availableMetricCount:snapshot.availableMetricCount,limitations:snapshot.limitations,signalInfluence:"forbidden"});
}
function canonical(value:unknown):string{
 if(value===null)return"null";if(typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);if(typeof value==="number"){if(!Number.isFinite(value))throw Error("Unsafe DizyQuant canonical value");return JSON.stringify(value)}if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;if(typeof value==="object"){const record=value as Record<string,unknown>;return`{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`}throw Error("Unsafe DizyQuant canonical value");
}
export const canonicalDizyQuantReplayJson=(snapshot:DizyQuantResearchSnapshot)=>canonical(toDizyQuantReplaySnapshot(snapshot));
