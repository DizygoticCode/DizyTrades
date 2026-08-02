import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../../lib/auth";
import { finaliseHistoricalDizyFlowMemory, HISTORICAL_DIZYFLOW_LIMITS, HistoricalDizyFlowValidationError, type HistoricalDizyFlowDraft } from "../../../../../lib/historical-dizyflow";
import { createHistoricalDizyFlowMemory, deleteHistoricalDizyFlowMemory, HistoricalDizyFlowStorageError } from "../../../../../lib/historical-dizyflow-store";
import { readJournal, setJournalHistoricalDizyFlowReferenceWithinTransaction, withJournalTransaction } from "../../../../../lib/journal-store";
import { attachManualHistoricalDizyFlow, completedManualTrade } from "../../../../../lib/manual-paper";
import { appendAudit } from "../../../../../lib/store";
import { optionalHistoricalDizyFlowJournalSync } from "../../../../../lib/historical-dizyflow-journal-sync";

export const runtime="nodejs";export const dynamic="force-dynamic";
const fail=(status:number,code:string,message:string)=>NextResponse.json({error:{code,message}},{status});

export async function POST(request:Request,{params}:{params:Promise<{tradeId:string}>}){
  const user=await requireApiUser();if(!user)return fail(401,"UNAUTHORISED","Unauthorised");if(user.role==="viewer")return fail(403,"VIEWER_READ_ONLY","Viewer sessions cannot finalize captures.");
  const length=Number(request.headers.get("content-length")??0);if(length>HISTORICAL_DIZYFLOW_LIMITS.maximumMemoryBytes)return fail(413,"REQUEST_TOO_LARGE","Capture payload exceeds its byte limit.");const text=await request.text();if(Buffer.byteLength(text)>HISTORICAL_DIZYFLOW_LIMITS.maximumMemoryBytes)return fail(413,"REQUEST_TOO_LARGE","Capture payload exceeds its byte limit.");
  let draft:HistoricalDizyFlowDraft;try{draft=JSON.parse(text) as HistoricalDizyFlowDraft}catch{return fail(400,"INVALID_JSON","Capture payload is not valid JSON.")}
  const tradeId=(await params).tradeId,trade=await completedManualTrade(user.id,tradeId);if(!trade)return fail(404,"COMPLETED_TRADE_REQUIRED","An authoritative completed Manual Paper trade is required.");const entryTimeMs=Date.parse(trade.openedAt!),exitTimeMs=Date.parse(trade.timestamp);if(draft.tradeId!==tradeId||draft.symbol!==trade.symbol||draft.marketKey!==trade.marketKey||draft.marketType!==trade.marketType||draft.entryTimeMs!==entryTimeMs||draft.exitTimeMs!==exitTimeMs)return fail(409,"TRADE_IDENTITY_MISMATCH","Capture does not match the authoritative completed Manual Paper trade.");
  let createdId:string|null=null;
  try{
    const memory=finaliseHistoricalDizyFlowMemory({...draft,journalEntryId:null}),stored=await createHistoricalDizyFlowMemory(user.id,memory),reference=Object.freeze({available:true,memoryId:memory.id,captureStartMs:memory.captureStartMs,captureEndMs:memory.captureEndMs,sampleCount:memory.integrity.sampleCount,eventCount:memory.integrity.eventCount,averageConfidence:memory.summary.averageConfidence,coveragePct:memory.summary.sampleCoveragePct,limitations:memory.limitations});if(stored.created)createdId=memory.id;
    const attached=await attachManualHistoricalDizyFlow(user.id,tradeId,reference);if(!attached)throw new Error("Authoritative Manual Paper reference attachment failed.");
    const journal=(await readJournal(user.id)).entries.find(entry=>entry.type==="trade-review"&&entry.trade?.tradeId===tradeId),sync=await optionalHistoricalDizyFlowJournalSync(journal?()=>withJournalTransaction(user.id,async()=>Boolean(await setJournalHistoricalDizyFlowReferenceWithinTransaction(user.id,journal.id,reference))):null),{journalLinked,warning}=sync;if(sync.errorName)await appendAudit(user.id,"historical-dizyflow.journal-link-failed",{tradeId,memoryId:memory.id,code:sync.errorName});
    await appendAudit(user.id,"historical-dizyflow.finalized",{tradeId,memoryId:memory.id,samples:memory.integrity.sampleCount,events:memory.integrity.eventCount,created:stored.created,journalLinked,bytes:Buffer.byteLength(JSON.stringify(memory))});return NextResponse.json({memoryId:memory.id,created:stored.created,reference,journalLinked,warning},{status:stored.created?201:200});
  }catch(reason){if(createdId){const stillReferenced=(await completedManualTrade(user.id,tradeId))?.historicalDizyFlow?.memoryId===createdId;if(!stillReferenced)await deleteHistoricalDizyFlowMemory(user.id,createdId).catch(()=>undefined)}const code=reason instanceof HistoricalDizyFlowValidationError||reason instanceof HistoricalDizyFlowStorageError?reason.code:"FINALIZATION_FAILED";await appendAudit(user.id,"historical-dizyflow.finalize-failed",{tradeId,code});return fail(code==="CONTENT_CONFLICT"?409:422,code,reason instanceof Error?reason.message:"Capture finalization failed.")}
}
