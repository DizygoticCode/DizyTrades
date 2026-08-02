import type { HistoricalDizyFlowEvent } from "./historical-dizyflow";

const stable=(value:unknown):string=>Array.isArray(value)?`[${value.map(stable).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`).join(",")}}`:JSON.stringify(value);
export function historicalFlowEventId(event:Omit<HistoricalDizyFlowEvent,"id">){let hash=2166136261;for(const character of stable(event)){hash^=character.charCodeAt(0);hash=Math.imul(hash,16777619)}return `hfe1_${(hash>>>0).toString(16).padStart(8,"0")}`}
export function createHistoricalFlowEvent(event:Omit<HistoricalDizyFlowEvent,"id">):HistoricalDizyFlowEvent{return Object.freeze({id:historicalFlowEventId(event),...event})}
