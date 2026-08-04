import{DIZYQUANT_METRIC_DEFINITIONS,DIZYQUANT_METRIC_SET_VERSION,type DizyQuantEvidenceGrade,type DizyQuantPromotionStatus,type DizyQuantUnit}from"./research.ts";

export const DIZYQUANT_PRESENTATION_VERSION="dizyquant-presentation/1.0.0" as const;
export type DizyQuantSliceStatus="complete";
export type DizyQuantSlicePresentation=Readonly<{number:1|2|3|4|5|6;name:string;status:DizyQuantSliceStatus;summary:string}>;
export type DizyQuantMetricPresentation=Readonly<{id:string;label:string;unit:DizyQuantUnit;evidenceGrade:DizyQuantEvidenceGrade;promotionStatus:DizyQuantPromotionStatus;signalEligible:false}>;
export type DizyQuantResearchPresentation=Readonly<{
 presentationVersion:typeof DIZYQUANT_PRESENTATION_VERSION;
 metricSetVersion:typeof DIZYQUANT_METRIC_SET_VERSION;
 surface:"bounded-read-only";
 totalMetricCount:number;
 snapshotGradeCount:number;
 continuousStreamGradeCount:number;
 informationalCount:number;
 experimentalCount:number;
 validatedCount:number;
 rejectedCount:number;
 signalEligibleCount:0;
 decisionEligible:false;
 signalInfluence:"forbidden";
 liveValuesLoaded:false;
 rawBookStreamExposed:false;
 slices:readonly DizyQuantSlicePresentation[];
 metrics:readonly DizyQuantMetricPresentation[];
 safeguards:readonly string[];
}>;

const slices=Object.freeze([
 Object.freeze({number:1 as const,name:"Research contract",status:"complete" as const,summary:"Versioned identities, evidence grades, availability states and deterministic Replay records."}),
 Object.freeze({number:2 as const,name:"Ladder state",status:"complete" as const,summary:"Spread, visible depth, imbalance, concentration and weighted distance."}),
 Object.freeze({number:3 as const,name:"Aggressive flow",status:"complete" as const,summary:"Public aggressor flow, visible-depth pressure and descriptive price response."}),
 Object.freeze({number:4 as const,name:"Liquidity migration",status:"complete" as const,summary:"Displayed turnover, persistence, cluster survival and centre migration."}),
 Object.freeze({number:5 as const,name:"Resilience and candidates",status:"complete" as const,summary:"Shock recovery, replenishment and experimental depth-only candidate labels."}),
 Object.freeze({number:6 as const,name:"Replay laboratory",status:"complete" as const,summary:"Held-out evaluation, walk-forward checks, deterministic null baselines and bounded presentation."}),
])as readonly DizyQuantSlicePresentation[];

export function buildDizyQuantResearchPresentation():DizyQuantResearchPresentation{
 const metrics=Object.freeze(DIZYQUANT_METRIC_DEFINITIONS.map(value=>Object.freeze({id:value.id,label:value.label,unit:value.unit,evidenceGrade:value.evidenceGrade,promotionStatus:value.promotionStatus,signalEligible:false as const})));
 const snapshotGradeCount=metrics.filter(value=>value.evidenceGrade==="snapshot-grade").length,continuousStreamGradeCount=metrics.filter(value=>value.evidenceGrade==="continuous-stream-grade").length;
 const informationalCount=metrics.filter(value=>value.promotionStatus==="informational").length,experimentalCount=metrics.filter(value=>value.promotionStatus==="experimental").length,validatedCount=metrics.filter(value=>value.promotionStatus==="validated").length,rejectedCount=metrics.filter(value=>value.promotionStatus==="rejected").length;
 const safeguards=Object.freeze(["No live metric values or raw order-book messages are loaded on this page.","DizyQuant remains decision-ineligible and forbidden from influencing DizySignals.","Experimental candidate labels are descriptive research rules, not trading instructions.","Metric promotion requires a separate reviewed change after representative Replay and statistical evidence."]);
 return Object.freeze({presentationVersion:DIZYQUANT_PRESENTATION_VERSION,metricSetVersion:DIZYQUANT_METRIC_SET_VERSION,surface:"bounded-read-only",totalMetricCount:metrics.length,snapshotGradeCount,continuousStreamGradeCount,informationalCount,experimentalCount,validatedCount,rejectedCount,signalEligibleCount:0,decisionEligible:false,signalInfluence:"forbidden",liveValuesLoaded:false,rawBookStreamExposed:false,slices,metrics,safeguards});
}
