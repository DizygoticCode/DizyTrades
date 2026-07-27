import type {FlowStatus} from "./types.ts";
/** Classify a valid book by the age of its last sequentially applied update.
 * Staleness is observational and never itself requests a snapshot/recovery. */
export function feedAgeStatus(ageMs:number,liveMs=2000,staleMs=5000):FlowStatus{return ageMs<=liveMs?"Live":ageMs<=staleMs?"Delayed":"Stale";}
