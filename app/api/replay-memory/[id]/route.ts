import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { getJournalEntry, readJournal } from "../../../lib/journal-store";
import { readReplayMemory } from "../../../lib/replay-memory-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
const fail=(status:number,code:string,message:string)=>NextResponse.json({error:{code,message}},{status});
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const user=await requireApiUser();if(!user)return fail(401,"UNAUTHORISED","Unauthorised");const id=(await params).id,entryId=new URL(request.url).searchParams.get("journalEntry");const referenced=entryId?(await getJournalEntry(user.id,entryId))?.trade?.replay?.memoryId===id:(await readJournal(user.id)).entries.some(entry=>entry.trade?.replay?.memoryId===id);if(!referenced)return fail(404,"MEMORY_UNAVAILABLE","Replay memory is unavailable.");try{const memory=await readReplayMemory(user.id,id);return memory?NextResponse.json({memory}):fail(404,"MEMORY_UNAVAILABLE","Replay memory is unavailable.");}catch{return fail(422,"MEMORY_INVALID","Retained replay memory failed integrity validation.");}}
