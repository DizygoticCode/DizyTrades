import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { readJournal } from "../../../lib/journal-store";
import { readTradeReview } from "../../../lib/dizybrain-review-store";
import { tradeReviewFreshness } from "../../../lib/dizybrain-trade-review";
import { readReplayMemory } from "../../../lib/replay-memory-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
const fail=(status:number,code:string,message:string)=>NextResponse.json({error:{code,message}},{status});
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const user=await requireApiUser();if(!user)return fail(401,"UNAUTHORISED","Unauthorised");const id=(await params).id;const entry=(await readJournal(user.id)).entries.find(item=>item.trade?.dizyBrainReview.available&&item.trade.dizyBrainReview.reviewId===id);if(!entry)return fail(404,"REVIEW_UNAVAILABLE","Trade review is unavailable.");try{const review=await readTradeReview(user.id,id);if(!review)return fail(404,"REVIEW_UNAVAILABLE","Trade review is unavailable.");const memoryId=entry.trade?.replay?.source==="retained-memory"?entry.trade.replay.memoryId:null;const memory=memoryId?await readReplayMemory(user.id,memoryId):null;const freshness=memory?tradeReviewFreshness(entry,memory):{stale:true,currentGeneratedFromHash:null};return NextResponse.json({review,readOnly:user.role==="viewer",stale:freshness.stale});}catch{return fail(422,"REVIEW_INVALID","Stored trade review failed validation.");}}
