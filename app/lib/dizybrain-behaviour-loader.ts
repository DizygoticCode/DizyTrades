import "server-only";
import { buildDizyBrainBehaviourProfile, normalizeBehaviourFilters, SUPPORTED_BEHAVIOUR_REVIEW_ENGINES, type BehaviourJoinedTrade, type BehaviourProfileFilters } from "./dizybrain-behaviour";
import { readTradeReview } from "./dizybrain-review-store";
import { tradeReviewInputHashFromMemoryMetadata } from "./dizybrain-trade-review";
import { readJournal } from "./journal-store";

export type BehaviourLoadDiagnostics=Readonly<{referencedReviews:number;loadedReviews:number;validReviews:number;staleReviews:number;invalidReviews:number;unsupportedReviews:number;eligibleReviews:number;filesRead:number;duplicateReviewReferences:number;aggregationDurationMs:number;profileSerializedBytes:number}>;

/** Per-user, on-demand join. It reads referenced review JSON only; Replay Memory and its candles are never opened. */
export async function loadDizyBrainBehaviourProfile(userId:string,rawFilters:Partial<BehaviourProfileFilters>,generatedAt:string){
  const started=performance.now(),filters=normalizeBehaviourFilters(rawFilters),journal=await readJournal(userId),entries=journal.entries.filter(x=>x.type==="trade-review"&&x.trade),totalJournalTradeReviews=entries.length;
  const active=entries.filter(x=>filters.includeArchived||!x.archived),archivedExcluded=entries.length-active.length,generatedReviews=entries.filter(x=>x.trade!.dizyBrainReview.available&&x.trade!.dizyBrainReview.reviewId).length;
  let missingReviews=0,invalidReviews=0,staleReviews=0,unsupportedReviews=0,filesRead=0,loadedReviews=0,validReviews=0,duplicateReviewReferences=0;
  const byId=new Map<string,Promise<Awaited<ReturnType<typeof readTradeReview>>>>(),joined:BehaviourJoinedTrade[]=[];
  for(const entry of active){const reference=entry.trade!.dizyBrainReview,id=reference.reviewId;if(!reference.available||!id){missingReviews++;continue;}let pending=byId.get(id);if(pending){duplicateReviewReferences++;}else{pending=readTradeReview(userId,id);byId.set(id,pending);filesRead++;}let review;try{review=await pending;}catch{invalidReviews++;continue;}if(!review){missingReviews++;continue;}loadedReviews++;
    if(review.id!==id||review.journalEntryId!==entry.id||review.tradeId!==entry.trade!.tradeId||review.marketKey!==entry.trade!.replay?.marketKey||review.symbol!==entry.trade!.symbol||review.timeframe!==entry.trade!.timeframe){invalidReviews++;continue;}
    validReviews++;if(!SUPPORTED_BEHAVIOUR_REVIEW_ENGINES.includes(review.engineVersion as never)){unsupportedReviews++;continue;}const currentHash=tradeReviewInputHashFromMemoryMetadata(entry,{id:review.replayMemoryId,contentHash:review.provenance.replayMemoryContentHash});if(reference.generatedFromHash!==review.generatedFromHash||review.generatedFromHash!==currentHash||reference.reviewId!==review.id){staleReviews++;continue;}
    joined.push(Object.freeze({review,archived:entry.archived,quality:entry.quality,planDiscipline:entry.planDiscipline,mood:entry.mood,tags:Object.freeze([...entry.tags]),notesPresent:Boolean(entry.notes.trim())}));
  }
  const profile=buildDizyBrainBehaviourProfile({reviewedTrades:joined,filters,generatedAt,coverage:{totalJournalTradeReviews,generatedReviews,staleReviews,missingReviews,invalidReviews,unsupportedReviews,archivedExcluded,duplicateReviewReferences}});const diagnostics=Object.freeze({referencedReviews:byId.size,loadedReviews,validReviews,staleReviews,invalidReviews,unsupportedReviews,eligibleReviews:profile.coverage.eligibleCurrentReviews,filesRead,duplicateReviewReferences,aggregationDurationMs:Math.round((performance.now()-started)*100)/100,profileSerializedBytes:Buffer.byteLength(JSON.stringify(profile))});return Object.freeze({profile,diagnostics});
}
