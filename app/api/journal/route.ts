import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/auth";
import { createJournalEntry, readJournal } from "../../lib/journal-store";
import { toJournalListItem } from "../../lib/journal-model";
import { JournalValidationError } from "../../lib/journal-validation";
import { appendAudit } from "../../lib/store";
export const runtime="nodejs"; export const dynamic="force-dynamic";
const error=(code:string,message:string,status:number,field="request")=>NextResponse.json({error:{code,field,message}},{status});
export async function GET(){const user=await requireApiUser();if(!user)return error("UNAUTHORISED","Unauthorised",401,"session");const record=await readJournal(user.id);return NextResponse.json({entries:record.entries.slice().reverse().map(toJournalListItem),readOnly:user.role==="viewer"});}
export async function POST(request:Request){const user=await requireApiUser();if(!user)return error("UNAUTHORISED","Unauthorised",401,"session");if(user.role==="viewer")return error("VIEWER_READ_ONLY","Viewer sessions are read-only.",403,"session");try{const entry=await createJournalEntry(user.id,await request.json());await appendAudit(user.id,"journal.create",{entryId:entry.id,type:entry.type,tradeId:entry.trade?.tradeId});return NextResponse.json({entry},{status:201});}catch(reason){if(reason instanceof JournalValidationError)return error("INVALID_JOURNAL_ENTRY",reason.message,400,reason.field);if(reason instanceof Error&&reason.message==="TRADE_ALREADY_JOURNALED")return error("TRADE_ALREADY_JOURNALED","This trade already has a Journal review.",409,"tradeId");return error("INVALID_REQUEST","Invalid journal request.",400);}}
