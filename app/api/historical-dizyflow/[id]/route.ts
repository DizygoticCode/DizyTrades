import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { readHistoricalDizyFlowMemory } from "../../../lib/historical-dizyflow-store";
import { readJournal } from "../../../lib/journal-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
const fail=(status:number,code:string,message:string)=>NextResponse.json({error:{code,message}},{status});
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const user=await requireApiUser();if(!user)return fail(401,"UNAUTHORISED","Unauthorised");const id=(await params).id;const referenced=(await readJournal(user.id)).entries.some(entry=>entry.trade?.historicalDizyFlow.memoryId===id);if(!referenced)return fail(404,"MEMORY_UNAVAILABLE","Historical DizyFlow memory is unavailable.");try{const memory=await readHistoricalDizyFlowMemory(user.id,id);return memory?NextResponse.json({memory}):fail(404,"MEMORY_UNAVAILABLE","Historical DizyFlow memory is unavailable.")}catch{return fail(422,"MEMORY_INVALID","Historical DizyFlow memory failed integrity validation.")}}
