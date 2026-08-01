import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { getJournalEntry, updateJournalEntry } from "../../../lib/journal-store";
import { JournalValidationError } from "../../../lib/journal-validation";
import { appendAudit } from "../../../lib/store";
export const runtime="nodejs"; export const dynamic="force-dynamic";
const fail=(status:number,message:string)=>NextResponse.json({error:{message}},{status});
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const user=await requireApiUser();if(!user)return fail(401,"Unauthorised");const entry=await getJournalEntry(user.id,(await params).id);return entry?NextResponse.json({entry,readOnly:user.role==="viewer"}):fail(404,"Journal entry not found.");}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){const user=await requireApiUser();if(!user)return fail(401,"Unauthorised");if(user.role==="viewer")return fail(403,"Viewer sessions are read-only.");try{const entry=await updateJournalEntry(user.id,(await params).id,await request.json());if(!entry)return fail(404,"Journal entry not found.");await appendAudit(user.id,"journal.update",{entryId:entry.id});return NextResponse.json({entry});}catch(reason){return reason instanceof JournalValidationError?fail(400,reason.message):fail(400,"Invalid journal update.");}}
