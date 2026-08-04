import type{DizyQuantMetricId}from"./research.ts";

export const DIZYQUANT_LAB_SCHEMA_VERSION=1 as const;
export const DIZYQUANT_LAB_FORMULA_VERSION="dizyquant-replay-lab/1.0.0" as const;
export const DIZYQUANT_LAB_MAX_OBSERVATIONS=10_000 as const;
export const DIZYQUANT_LAB_DEFAULT_MIN_TRAIN=30 as const;
export const DIZYQUANT_LAB_DEFAULT_MIN_HOLDOUT=20 as const;
export const DIZYQUANT_LAB_MAX_NULL_ROTATIONS=64 as const;
export const DIZYQUANT_LAB_MAX_WALK_FORWARD_FOLDS=8 as const;

export type DizyQuantStudyObservation=Readonly<{
 observationId:string;
 timestampMs:number;
 symbol:string;
 regime:string;
 metricId:DizyQuantMetricId;
 predictor:number;
 outcome:number;
}>;
export type DizyQuantStudyConfig=Readonly<{
 metricId:DizyQuantMetricId;
 holdoutFraction?:number;
 minTrain?:number;
 minHoldout?:number;
 nullRotations?:number;
 walkForwardFolds?:number;
}>;
export type DizyQuantLabStatus="ready"|"insufficient-data"|"invalid";
export type DizyQuantResearchDecision="retain-experimental"|"reject-current-formula"|"insufficient-evidence"|"invalid-input";
export type DizyQuantLabModel=Readonly<{
 threshold:number;
 direction:-1|1;
 trainingMajorityDirection:-1|1;
 trainingMeanHigh:number;
 trainingMeanLow:number;
 trainingEffect:number;
}>;
export type DizyQuantLabEvaluation=Readonly<{
 sampleCount:number;
 positiveCount:number;
 negativeCount:number;
 modelAccuracyPct:number|null;
 baselineAccuracyPct:number|null;
 accuracyLiftPctPoints:number|null;
 balancedAccuracyPct:number|null;
 predictorOutcomeCorrelation:number|null;
 highGroupMeanOutcome:number|null;
 lowGroupMeanOutcome:number|null;
 highMinusLowOutcome:number|null;
}>;
export type DizyQuantNullBaseline=Readonly<{
 rotationCount:number;
 observedAbsoluteCorrelation:number|null;
 meanAbsoluteRotatedCorrelation:number|null;
 empiricalExceedancePct:number|null;
}>;
export type DizyQuantWalkForwardSummary=Readonly<{
 requestedFolds:number;
 completedFolds:number;
 meanAccuracyLiftPctPoints:number|null;
 positiveLiftFoldPct:number|null;
}>;
export type DizyQuantReplayLabResult=Readonly<{
 schemaVersion:typeof DIZYQUANT_LAB_SCHEMA_VERSION;
 formulaVersion:typeof DIZYQUANT_LAB_FORMULA_VERSION;
 metricId:DizyQuantMetricId;
 valid:boolean;
 status:DizyQuantLabStatus;
 decision:DizyQuantResearchDecision;
 promotionEligible:false;
 observationCount:number;
 trainingCount:number;
 holdoutCount:number;
 coverage:Readonly<{fromMs:number|null;toMs:number|null}>;
 model:DizyQuantLabModel|null;
 holdout:DizyQuantLabEvaluation|null;
 nullBaseline:DizyQuantNullBaseline|null;
 walkForward:DizyQuantWalkForwardSummary|null;
 limitations:readonly string[];
}>;

type NormalisedObservation=Readonly<{
 observationId:string;timestampMs:number;symbol:string;regime:string;metricId:DizyQuantMetricId;predictor:number;outcome:number;
}>;

const symbolPattern=/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const clean=(value:string,max:number)=>{const result=value.trim();return result&&result.length<=max&&!/[\u0000-\u001f]/.test(result)?result:null};
const finite=(value:number)=>Number.isFinite(value);
const mean=(values:readonly number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
const median=(values:readonly number[])=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2};
const direction=(value:number):-1|1=>value>=0?1:-1;
const clampInteger=(value:number|undefined,fallback:number,min:number,max:number)=>Number.isInteger(value)?Math.min(max,Math.max(min,value!)):fallback;
const clampFraction=(value:number|undefined)=>finite(value??Number.NaN)&&value!>=.1&&value!<=.5?value!:.3;

function invalid(metricId:DizyQuantMetricId,reason:string):DizyQuantReplayLabResult{
 return Object.freeze({schemaVersion:DIZYQUANT_LAB_SCHEMA_VERSION,formulaVersion:DIZYQUANT_LAB_FORMULA_VERSION,metricId,valid:false,status:"invalid",decision:"invalid-input",promotionEligible:false,observationCount:0,trainingCount:0,holdoutCount:0,coverage:Object.freeze({fromMs:null,toMs:null}),model:null,holdout:null,nullBaseline:null,walkForward:null,limitations:Object.freeze([reason])});
}
function insufficient(metricId:DizyQuantMetricId,observations:readonly NormalisedObservation[],trainingCount:number,holdoutCount:number,reason:string):DizyQuantReplayLabResult{
 return Object.freeze({schemaVersion:DIZYQUANT_LAB_SCHEMA_VERSION,formulaVersion:DIZYQUANT_LAB_FORMULA_VERSION,metricId,valid:true,status:"insufficient-data",decision:"insufficient-evidence",promotionEligible:false,observationCount:observations.length,trainingCount,holdoutCount,coverage:Object.freeze({fromMs:observations[0]?.timestampMs??null,toMs:observations.at(-1)?.timestampMs??null}),model:null,holdout:null,nullBaseline:null,walkForward:null,limitations:Object.freeze([reason,"No lab result can automatically promote a DizyQuant metric or influence DizySignals."])});
}

function normaliseObservations(input:readonly DizyQuantStudyObservation[],metricId:DizyQuantMetricId):readonly NormalisedObservation[]|null{
 if(!Array.isArray(input)||!input.length||input.length>DIZYQUANT_LAB_MAX_OBSERVATIONS)return null;
 const ids=new Set<string>();const out:NormalisedObservation[]=[];let previousTime=-Infinity;
 for(const value of input){
  if(!value||typeof value!=="object")return null;
  const observationId=typeof value.observationId==="string"?clean(value.observationId,160):null;
  const symbol=typeof value.symbol==="string"?value.symbol.trim().toUpperCase():"";
  const regime=typeof value.regime==="string"?clean(value.regime,80):null;
  if(!observationId||ids.has(observationId)||!symbolPattern.test(symbol)||!regime||value.metricId!==metricId||!Number.isSafeInteger(value.timestampMs)||value.timestampMs<=previousTime||!finite(value.predictor)||!finite(value.outcome))return null;
  ids.add(observationId);previousTime=value.timestampMs;out.push(Object.freeze({observationId,timestampMs:value.timestampMs,symbol,regime,metricId,predictor:value.predictor,outcome:value.outcome}));
 }
 return Object.freeze(out);
}
function correlation(xs:readonly number[],ys:readonly number[]):number|null{
 if(xs.length!==ys.length||xs.length<2)return null;
 const mx=mean(xs),my=mean(ys);if(mx===null||my===null)return null;
 let numerator=0,x2=0,y2=0;
 for(let index=0;index<xs.length;index++){const dx=xs[index]-mx,dy=ys[index]-my;numerator+=dx*dy;x2+=dx*dx;y2+=dy*dy}
 const denominator=Math.sqrt(x2*y2);return denominator>0?numerator/denominator:null;
}
function trainModel(values:readonly NormalisedObservation[]):DizyQuantLabModel|null{
 const threshold=median(values.map(value=>value.predictor));if(threshold===null)return null;
 const high=values.filter(value=>value.predictor>=threshold).map(value=>value.outcome),low=values.filter(value=>value.predictor<threshold).map(value=>value.outcome);
 const highMean=mean(high),lowMean=mean(low);if(highMean===null||lowMean===null||high.length<2||low.length<2)return null;
 const trainingEffect=highMean-lowMean;if(!finite(trainingEffect)||trainingEffect===0)return null;
 const positives=values.filter(value=>value.outcome>0).length;
 return Object.freeze({threshold,direction:direction(trainingEffect),trainingMajorityDirection:positives>=values.length-positives?1:-1,trainingMeanHigh:highMean,trainingMeanLow:lowMean,trainingEffect});
}
function evaluate(model:DizyQuantLabModel,values:readonly NormalisedObservation[]):DizyQuantLabEvaluation{
 let modelCorrect=0,baselineCorrect=0,positiveCount=0,negativeCount=0,positiveCorrect=0,negativeCorrect=0;
 const high:number[]=[],low:number[]=[];
 for(const value of values){
  const actual=direction(value.outcome),bucket=value.predictor>=model.threshold?1:-1,predicted=(bucket*model.direction)as-1|1;
  if(actual===1){positiveCount++;if(predicted===actual)positiveCorrect++}else{negativeCount++;if(predicted===actual)negativeCorrect++}
  if(predicted===actual)modelCorrect++;if(model.trainingMajorityDirection===actual)baselineCorrect++;
  (bucket===1?high:low).push(value.outcome);
 }
 const sampleCount=values.length,modelAccuracyPct=sampleCount?modelCorrect/sampleCount*100:null,baselineAccuracyPct=sampleCount?baselineCorrect/sampleCount*100:null;
 const balancedAccuracyPct=positiveCount&&negativeCount?(positiveCorrect/positiveCount+negativeCorrect/negativeCount)/2*100:null;
 const highGroupMeanOutcome=mean(high),lowGroupMeanOutcome=mean(low);
 return Object.freeze({sampleCount,positiveCount,negativeCount,modelAccuracyPct,baselineAccuracyPct,accuracyLiftPctPoints:modelAccuracyPct!==null&&baselineAccuracyPct!==null?modelAccuracyPct-baselineAccuracyPct:null,balancedAccuracyPct,predictorOutcomeCorrelation:correlation(values.map(value=>value.predictor),values.map(value=>value.outcome)),highGroupMeanOutcome,lowGroupMeanOutcome,highMinusLowOutcome:highGroupMeanOutcome!==null&&lowGroupMeanOutcome!==null?highGroupMeanOutcome-lowGroupMeanOutcome:null});
}
function nullBaseline(values:readonly NormalisedObservation[],observed:number|null,requested:number):DizyQuantNullBaseline{
 const rotationCount=Math.min(requested,Math.max(0,values.length-1));if(observed===null||rotationCount===0)return Object.freeze({rotationCount,observedAbsoluteCorrelation:observed===null?null:Math.abs(observed),meanAbsoluteRotatedCorrelation:null,empiricalExceedancePct:null});
 const predictors=values.map(value=>value.predictor),outcomes=values.map(value=>value.outcome),rotated:number[]=[];
 for(let shift=1;shift<=rotationCount;shift++){const moved=outcomes.map((_,index)=>outcomes[(index+shift)%outcomes.length]),value=correlation(predictors,moved);if(value!==null)rotated.push(Math.abs(value))}
 const meanNull=mean(rotated),observedAbs=Math.abs(observed),exceed=rotated.filter(value=>value>=observedAbs).length;
 return Object.freeze({rotationCount:rotated.length,observedAbsoluteCorrelation:observedAbs,meanAbsoluteRotatedCorrelation:meanNull,empiricalExceedancePct:rotated.length?(exceed+1)/(rotated.length+1)*100:null});
}
function walkForward(values:readonly NormalisedObservation[],minTrain:number,requestedFolds:number):DizyQuantWalkForwardSummary{
 const remaining=values.length-minTrain;if(remaining<2)return Object.freeze({requestedFolds,completedFolds:0,meanAccuracyLiftPctPoints:null,positiveLiftFoldPct:null});
 const foldSize=Math.max(1,Math.floor(remaining/requestedFolds)),lifts:number[]=[];
 for(let fold=0;fold<requestedFolds;fold++){
  const testFrom=minTrain+fold*foldSize;if(testFrom>=values.length)break;
  const testTo=fold===requestedFolds-1?values.length:Math.min(values.length,testFrom+foldSize);
  const model=trainModel(values.slice(0,testFrom)),test=values.slice(testFrom,testTo);if(!model||!test.length)continue;
  const result=evaluate(model,test);if(result.accuracyLiftPctPoints!==null)lifts.push(result.accuracyLiftPctPoints);
 }
 const average=mean(lifts);return Object.freeze({requestedFolds,completedFolds:lifts.length,meanAccuracyLiftPctPoints:average,positiveLiftFoldPct:lifts.length?lifts.filter(value=>value>0).length/lifts.length*100:null});
}

export function runDizyQuantReplayLab(input:readonly DizyQuantStudyObservation[],config:DizyQuantStudyConfig):DizyQuantReplayLabResult{
 const observations=normaliseObservations(input,config.metricId);if(!observations)return invalid(config.metricId,"Replay lab observations are malformed, duplicated, unordered, non-finite, mixed-metric or exceed the bounded limit.");
 const minTrain=clampInteger(config.minTrain,DIZYQUANT_LAB_DEFAULT_MIN_TRAIN,10,5_000),minHoldout=clampInteger(config.minHoldout,DIZYQUANT_LAB_DEFAULT_MIN_HOLDOUT,10,2_000),holdoutFraction=clampFraction(config.holdoutFraction);
 const desiredHoldout=Math.max(minHoldout,Math.floor(observations.length*holdoutFraction)),trainingCount=observations.length-desiredHoldout;
 if(trainingCount<minTrain||desiredHoldout<minHoldout)return insufficient(config.metricId,observations,Math.max(0,trainingCount),Math.max(0,desiredHoldout),"The ordered sample does not meet the configured training and held-out minimums.");
 const training=observations.slice(0,trainingCount),holdoutValues=observations.slice(trainingCount),model=trainModel(training);
 if(!model)return insufficient(config.metricId,observations,training.length,holdoutValues.length,"Training evidence cannot form two populated predictor groups with a non-zero historical effect.");
 const holdout=evaluate(model,holdoutValues),rotations=clampInteger(config.nullRotations,32,1,DIZYQUANT_LAB_MAX_NULL_ROTATIONS),folds=clampInteger(config.walkForwardFolds,4,2,DIZYQUANT_LAB_MAX_WALK_FORWARD_FOLDS);
 const nullResult=nullBaseline(holdoutValues,holdout.predictorOutcomeCorrelation,rotations),walk=walkForward(observations,minTrain,folds);
 const adequateClasses=holdout.positiveCount>0&&holdout.negativeCount>0,retained=adequateClasses&&(holdout.accuracyLiftPctPoints??-Infinity)>0&&(walk.meanAccuracyLiftPctPoints??-Infinity)>0&&(nullResult.empiricalExceedancePct??100)<=20;
 const decision:DizyQuantResearchDecision=!adequateClasses?"insufficient-evidence":retained?"retain-experimental":"reject-current-formula";
 const status:DizyQuantLabStatus=!adequateClasses?"insufficient-data":"ready";
 const limitations=["Threshold, direction and majority baseline are learned from the training prefix only.","The circular-rotation null is a deterministic descriptive baseline, not a universal significance test.","No lab result can automatically validate, promote or route a metric into DizySignals."];
 if(!adequateClasses)limitations.push("Held-out outcomes do not contain both positive and negative classes.");
 return Object.freeze({schemaVersion:DIZYQUANT_LAB_SCHEMA_VERSION,formulaVersion:DIZYQUANT_LAB_FORMULA_VERSION,metricId:config.metricId,valid:true,status,decision,promotionEligible:false,observationCount:observations.length,trainingCount:training.length,holdoutCount:holdoutValues.length,coverage:Object.freeze({fromMs:observations[0].timestampMs,toMs:observations.at(-1)!.timestampMs}),model,holdout,nullBaseline:nullResult,walkForward:walk,limitations:Object.freeze(limitations)});
}
function canonical(value:unknown):string{
 if(value===null)return"null";if(typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);if(typeof value==="number"){if(!finite(value))throw Error("Unsafe DizyQuant lab canonical value");return JSON.stringify(value)}if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;if(typeof value==="object"){const record=value as Record<string,unknown>;return`{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`}throw Error("Unsafe DizyQuant lab canonical value");
}
export const canonicalDizyQuantReplayLabJson=(result:DizyQuantReplayLabResult)=>canonical(result);
