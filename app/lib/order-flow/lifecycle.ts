import type {FlowStatus} from "./types.ts";
/** Classify a valid book by the age of its last sequentially applied update.
 * Staleness is observational and never itself requests a snapshot/recovery. */
export function feedAgeStatus(ageMs:number,liveMs=2000,staleMs=5000):FlowStatus{return ageMs<=liveMs?"Live":ageMs<=staleMs?"Delayed":"Stale";}
export type StableDepthStatus="CONNECTING"|"LIVE"|"STALE"|"ERROR";
export function stableDepthStatus({hasSnapshot,ageMs,endpointFailed,staleMs=5000}:{hasSnapshot:boolean;ageMs:number;endpointFailed:boolean;staleMs?:number}):StableDepthStatus{
 if(!hasSnapshot)return endpointFailed?"ERROR":"CONNECTING";
 return ageMs>staleMs?"STALE":"LIVE";
}
/** DOM polling and heatmap streaming are intentionally controlled separately. */
export function depthConsumerActivity({enabled,domVisible,heatmapVisible}:{enabled:boolean;domVisible:boolean;heatmapVisible:boolean}){
 return {dom:enabled&&domVisible,heatmap:enabled&&heatmapVisible};
}
