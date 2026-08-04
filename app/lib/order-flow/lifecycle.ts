import type {FlowStatus} from "./types.ts";
/** Classify a valid book by the age of its last sequentially applied update.
 * Staleness is observational and never itself requests a snapshot/recovery. */
export function feedAgeStatus(ageMs:number,liveMs=2000,staleMs=5000):FlowStatus{return ageMs<=liveMs?"Live":ageMs<=staleMs?"Delayed":"Stale";}
export function depthPresentationStatus(ageMs:number,hasValidBook:boolean,hasEnvelope=true):"CONNECTING"|"LIVE"|"DELAYED"|"OFFLINE"{
 if(!hasEnvelope)return "CONNECTING";if(!hasValidBook||ageMs>15_000)return "OFFLINE";return ageMs>5_000?"DELAYED":"LIVE";
}
export function latestReceiptTime(current:number|null,candidate:number|null):number|null{
 if(candidate===null)return current;
 if(current===null)return candidate;
 return Math.max(current,candidate);
}
export type StableDepthStatus="CONNECTING"|"LIVE"|"STALE"|"ERROR";
export function stableDepthStatus({hasSnapshot,ageMs,endpointFailed,staleMs=5000}:{hasSnapshot:boolean;ageMs:number;endpointFailed:boolean;staleMs?:number}):StableDepthStatus{
 if(!hasSnapshot)return endpointFailed?"ERROR":"CONNECTING";
 return ageMs>staleMs?"STALE":"LIVE";
}
/** DOM polling and heatmap streaming are intentionally controlled separately. */
export function depthConsumerActivity({enabled,domVisible,heatmapVisible,marketDepthVisible=false}:{enabled:boolean;domVisible:boolean;heatmapVisible:boolean;marketDepthVisible?:boolean}){
 return {dom:enabled&&(domVisible||marketDepthVisible),heatmap:enabled&&heatmapVisible};
}
