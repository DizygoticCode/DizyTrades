export const DIZYQUANT_RESEARCH_SCHEMA_VERSION=1 as const;
export const DIZYQUANT_METRIC_SET_VERSION="dizyquant-candidates/1.2.0" as const;

export type DizyQuantEvidenceGrade="snapshot-grade"|"continuous-stream-grade";
export type DizyQuantAvailability="fresh"|"stale"|"gapped"|"unavailable";
export type DizyQuantReplayAvailability="fresh"|"gapped"|"unavailable";
export type DizyQuantPromotionStatus="informational"|"experimental"|"validated"|"rejected";
export type DizyQuantSourceKind="depth-snapshot"|"depth-stream"|"public-trades"|"retained-liquidity"|"replay";
export type DizyQuantUnit="price"|"ticks"|"basis-points"|"percent"|"quote-notional"|"base-quantity"|"milliseconds"|"count"|"basis-points-per-million-quote";

const candidateDefinitions=[
 {id:"spread-price",version:1,label:"Quoted spread price",unit:"price",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Best ask minus best bid in provider price units."},
 {id:"spread-ticks",version:1,label:"Quoted spread ticks",unit:"ticks",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Quoted spread divided by the reviewed public price step."},
 {id:"spread-bps",version:1,label:"Quoted spread",unit:"basis-points",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Best ask minus best bid expressed relative to midpoint."},
 {id:"bid-depth-10bps",version:1,label:"Bid depth within 10 bps",unit:"quote-notional",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Visible bid notional inside ten basis points of midpoint."},
 {id:"ask-depth-10bps",version:1,label:"Ask depth within 10 bps",unit:"quote-notional",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Visible ask notional inside ten basis points of midpoint."},
 {id:"depth-imbalance-10bps",version:1,label:"Depth imbalance within 10 bps",unit:"percent",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Bid-versus-ask visible notional imbalance inside ten basis points of midpoint."},
 {id:"bid-depth-25bps",version:1,label:"Bid depth within 25 bps",unit:"quote-notional",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Visible bid notional inside twenty-five basis points of midpoint."},
 {id:"ask-depth-25bps",version:1,label:"Ask depth within 25 bps",unit:"quote-notional",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Visible ask notional inside twenty-five basis points of midpoint."},
 {id:"depth-imbalance-25bps",version:1,label:"Depth imbalance within 25 bps",unit:"percent",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Bid-versus-ask visible notional imbalance inside twenty-five basis points of midpoint."},
 {id:"bid-depth-50bps",version:1,label:"Bid depth within 50 bps",unit:"quote-notional",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Visible bid notional inside fifty basis points of midpoint."},
 {id:"ask-depth-50bps",version:1,label:"Ask depth within 50 bps",unit:"quote-notional",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Visible ask notional inside fifty basis points of midpoint."},
 {id:"depth-imbalance-50bps",version:1,label:"Depth imbalance within 50 bps",unit:"percent",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Bid-versus-ask visible notional imbalance inside fifty basis points of midpoint."},
 {id:"bid-depth-100bps",version:1,label:"Bid depth within 100 bps",unit:"quote-notional",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Visible bid notional inside one hundred basis points of midpoint."},
 {id:"ask-depth-100bps",version:1,label:"Ask depth within 100 bps",unit:"quote-notional",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Visible ask notional inside one hundred basis points of midpoint."},
 {id:"depth-imbalance-100bps",version:1,label:"Depth imbalance within 100 bps",unit:"percent",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Bid-versus-ask visible notional imbalance inside one hundred basis points of midpoint."},
 {id:"depth-weighted-distance-100bps",version:1,label:"Depth-weighted distance within 100 bps",unit:"basis-points",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Visible-notional-weighted absolute distance from midpoint inside one hundred basis points."},
 {id:"near-depth-concentration-25-of-100bps",version:1,label:"Near-depth concentration",unit:"percent",evidenceGrade:"snapshot-grade",promotionStatus:"informational",description:"Visible notional inside twenty-five basis points divided by visible notional inside one hundred basis points."},
 {id:"aggressive-buy-notional-10s",version:1,label:"Aggressive buy notional over 10 seconds",unit:"quote-notional",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Provider-labelled public buy-aggressor notional in the ten-second event window."},
 {id:"aggressive-sell-notional-10s",version:1,label:"Aggressive sell notional over 10 seconds",unit:"quote-notional",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Provider-labelled public sell-aggressor notional in the ten-second event window."},
 {id:"aggressive-gross-notional-10s",version:1,label:"Gross aggressive notional over 10 seconds",unit:"quote-notional",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Public buy-aggressor plus sell-aggressor notional in the ten-second event window."},
 {id:"aggressive-net-notional-10s",version:1,label:"Net aggressive notional over 10 seconds",unit:"quote-notional",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Public buy-aggressor minus sell-aggressor notional in the ten-second event window."},
 {id:"aggressive-flow-imbalance-10s",version:1,label:"Aggressive flow imbalance over 10 seconds",unit:"percent",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Net public aggressor notional divided by gross public aggressor notional."},
 {id:"aggressive-buy-trade-count-10s",version:1,label:"Aggressive buy trade count over 10 seconds",unit:"count",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Count of provider-labelled public buy-aggressor executions in the event window."},
 {id:"aggressive-sell-trade-count-10s",version:1,label:"Aggressive sell trade count over 10 seconds",unit:"count",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Count of provider-labelled public sell-aggressor executions in the event window."},
 {id:"aggressive-trade-count-imbalance-10s",version:1,label:"Aggressive trade-count imbalance over 10 seconds",unit:"percent",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Buy-aggressor count minus sell-aggressor count divided by total public trade count."},
 {id:"buy-flow-vs-opening-ask-depth-25bps",version:1,label:"Buy flow versus opening ask depth",unit:"percent",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Buy-aggressor notional divided by opening displayed ask notional inside twenty-five basis points."},
 {id:"sell-flow-vs-opening-bid-depth-25bps",version:1,label:"Sell flow versus opening bid depth",unit:"percent",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Sell-aggressor notional divided by opening displayed bid notional inside twenty-five basis points."},
 {id:"midpoint-change-10s-bps",version:1,label:"Midpoint change over 10 seconds",unit:"basis-points",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Closing midpoint minus opening midpoint expressed in basis points of the opening midpoint."},
 {id:"flow-aligned-response-10s-bps",version:1,label:"Flow-aligned midpoint response",unit:"basis-points",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Midpoint change signed so positive values align with net public aggressor flow."},
 {id:"flow-efficiency-bps-per-million-10s",version:1,label:"Flow-aligned response per million",unit:"basis-points-per-million-quote",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Flow-aligned midpoint response divided by gross public aggressor notional in millions."},
 {id:"liquidity-added-30s",version:1,label:"Displayed liquidity added over 30 seconds",unit:"quote-notional",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Observed increase in displayed book notional over a thirty-second event-time window."},
 {id:"liquidity-removed-30s",version:1,label:"Displayed liquidity removed over 30 seconds",unit:"quote-notional",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Observed decrease in displayed book notional over a thirty-second event-time window."},
 {id:"liquidity-centre-shift-bps",version:1,label:"Liquidity centre shift",unit:"basis-points",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Movement of the visible-liquidity centre of mass relative to midpoint."},
 {id:"resilience-recovery-ms",version:1,label:"Liquidity recovery time",unit:"milliseconds",evidenceGrade:"continuous-stream-grade",promotionStatus:"informational",description:"Elapsed event time for spread or nearby depth to recover after a defined liquidity shock."},
] as const;

export type DizyQuantMetricId=typeof candidateDefinitions[number]["id"];
export type DizyQuantMetricDefinition=Readonly<{
 id:DizyQuantMetricId;version:1;label:string;unit:DizyQuantUnit;evidenceGrade:DizyQuantEvidenceGrade;
 promotionStatus:DizyQuantPromotionStatus;description:string;signalEligible:false;
}>;
export const DIZYQUANT_METRIC_DEFINITIONS=Object.freeze(candidateDefinitions.map(value=>Object.freeze({...value,signalEligible:false as const}))) as readonly DizyQuantMetricDefinition[];
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
 for(const [id,value] of Object.entries(input.values)){if(!definitionById.has(id as DizyQuantMetricId))throw Error("Unknown DizyQuant metric");if(value!==null&&value!==undefined&&!Number.isFinite(value))throw Error(`Invalid DizyQuant value for ${id}`)}
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
