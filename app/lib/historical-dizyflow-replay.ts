import type { HistoricalDizyFlowEvent, HistoricalDizyFlowMemory, HistoricalDizyFlowSample } from "./historical-dizyflow";

export const HISTORICAL_FLOW_MAX_SAMPLE_AGE_MS = 5_000;

export type HistoricalFlowSampleMatch = Readonly<{
  status: "available" | "limited" | "stale" | "disconnected" | "unavailable";
  sample: HistoricalDizyFlowSample | null;
  ageMs: number | null;
  reason: "no-samples" | "before-first-sample" | "sample-too-old" | null;
}>;

/** Selects only an exact or prior retained sample. It never interpolates or exposes future evidence. */
export function selectHistoricalFlowSample(input:{samples:readonly HistoricalDizyFlowSample[];replayTimeMs:number;maxAgeMs?:number}):HistoricalFlowSampleMatch {
  const {samples,replayTimeMs}=input,maxAgeMs=input.maxAgeMs??HISTORICAL_FLOW_MAX_SAMPLE_AGE_MS;
  if(!samples.length)return Object.freeze({status:"unavailable",sample:null,ageMs:null,reason:"no-samples"});
  let low=0,high=samples.length-1,found=-1;
  while(low<=high){const middle=(low+high)>>>1;if(samples[middle].timeMs<=replayTimeMs){found=middle;low=middle+1}else high=middle-1;}
  if(found<0)return Object.freeze({status:"unavailable",sample:null,ageMs:null,reason:"before-first-sample"});
  const sample=samples[found],ageMs=replayTimeMs-sample.timeMs;
  if(ageMs>maxAgeMs)return Object.freeze({status:"unavailable",sample:null,ageMs,reason:"sample-too-old"});
  return Object.freeze({status:sample.availability,sample,ageMs,reason:null});
}

const eventCompare=(a:HistoricalDizyFlowEvent,b:HistoricalDizyFlowEvent)=>a.timeMs-b.timeMs||a.type.localeCompare(b.type)||a.id.localeCompare(b.id);
export function eventsForReplayWindow(input:{events:readonly HistoricalDizyFlowEvent[];previousReplayTimeMs:number;replayTimeMs:number}) {
  if(input.replayTimeMs<input.previousReplayTimeMs)return Object.freeze([] as HistoricalDizyFlowEvent[]);
  const firstAfter=(time:number)=>{let low=0,high=input.events.length;while(low<high){const middle=(low+high)>>>1;if(input.events[middle].timeMs<=time)low=middle+1;else high=middle;}return low;};
  return Object.freeze(input.events.slice(firstAfter(input.previousReplayTimeMs),firstAfter(input.replayTimeMs)).sort(eventCompare));
}

export type HistoricalDizyFlowReplayView=Readonly<{memory:HistoricalDizyFlowMemory;replayTimeMs:number;status:HistoricalFlowSampleMatch["status"];sample:HistoricalDizyFlowSample|null;sampleAgeMs:number|null;unavailableReason:HistoricalFlowSampleMatch["reason"];eventsAtStep:readonly HistoricalDizyFlowEvent[]}>;
export function buildHistoricalFlowReplayView(memory:HistoricalDizyFlowMemory,replayTimeMs:number,previousReplayTimeMs:number):HistoricalDizyFlowReplayView {
  const match=selectHistoricalFlowSample({samples:memory.samples,replayTimeMs});
  return Object.freeze({memory,replayTimeMs,status:match.status,sample:match.sample,sampleAgeMs:match.ageMs,unavailableReason:match.reason,eventsAtStep:eventsForReplayWindow({events:memory.events,previousReplayTimeMs,replayTimeMs})});
}
