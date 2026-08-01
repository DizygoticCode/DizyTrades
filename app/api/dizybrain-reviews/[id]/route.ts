import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { readJournal } from "../../../lib/journal-store";
import { readTradeReview } from "../../../lib/dizybrain-review-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
const fail=(status:number,code:string,message:string)=>NextResponse.json({error:{code,message}},{status});
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const user=await requireApiUser();if(!user)return fail(401,"UNAUTHORISED","Unauthorised");const id=(await params).id;const referenced=(await readJournal(user.id)).entries.some(entry=>entry.trade?.dizyBrainReview.available&&entry.trade.dizyBrainReview.reviewId===id);if(!referenced)return fail(404,"REVIEW_UNAVAILABLE","Trade review is unavailable.");try{const review=await readTradeReview(user.id,id);return review?NextResponse.json({review,readOnly:user.role==="viewer"}):fail(404,"REVIEW_UNAVAILABLE","Trade review is unavailable.");}catch{return fail(422,"REVIEW_INVALID","Stored trade review failed validation.");}}
