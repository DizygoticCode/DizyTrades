import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { JOURNAL_SCHEMA_VERSION, type DizyBrainReviewReference, type JournalEntry } from "./journal-model";
import { journalCreateFields, journalEditableFields } from "./journal-validation";

const root=()=>process.env.DATA_DIR||join(process.cwd(),".data");
const safe=(id:string)=>id.replace(/[^a-z0-9_-]/gi,"");
const path=(id:string)=>join(root(),"journal",`${safe(id)}.json`);
export type JournalRecord={version:4;entries:JournalEntry[]};
const empty=():JournalRecord=>({version:4,entries:[]});

/** Version-one records are normalised in memory and written as v2 on their next mutation. */
export function migrateJournalEntry(value:unknown):JournalEntry|null {
  if(!value||typeof value!=="object")return null;
  const entry=value as Record<string,unknown>;
  if(entry.schemaVersion!==1&&entry.schemaVersion!==2&&entry.schemaVersion!==3&&entry.schemaVersion!==JOURNAL_SCHEMA_VERSION)return null;
  const trade=entry.trade&&typeof entry.trade==="object"?entry.trade as Record<string,unknown>:null,replay=trade?.replay&&typeof trade.replay==="object"?trade.replay as Record<string,unknown>:null;
  const migratedReplay=replay?{...replay,source:replay.source??(replay.available?"rolling-history":"unavailable"),memoryId:replay.memoryId??null,capturedRangeStartMs:replay.capturedRangeStartMs??null,capturedRangeEndMs:replay.capturedRangeEndMs??null,candleCount:replay.candleCount??null,integrityWarnings:replay.integrityWarnings??[],brainAvailable:replay.brainAvailable??false,flowAvailability:replay.flowAvailability??"unavailable"}:null;
  const review=trade?.dizyBrainReview&&typeof trade.dizyBrainReview==="object"?trade.dizyBrainReview as Record<string,unknown>:null;
  const migratedReview={available:review?.available===true,reviewId:typeof review?.reviewId==="string"?review.reviewId:null,engineVersion:typeof review?.engineVersion==="string"?review.engineVersion:null,generatedAt:typeof review?.generatedAt==="string"?review.generatedAt:null,generatedFromHash:typeof review?.generatedFromHash==="string"?review.generatedFromHash:null,reviewConfidence:typeof review?.reviewConfidence==="number"?review.reviewConfidence:null};
  return {...entry,schemaVersion:JOURNAL_SCHEMA_VERSION,title:typeof entry.title==="string"?entry.title:"",archived:entry.archived===true,archivedAt:entry.archived===true&&typeof entry.archivedAt==="string"?entry.archivedAt:null,trade:trade?{...trade,replay:migratedReplay,dizyBrainReview:migratedReview}:null} as JournalEntry;
}

export async function readJournal(userId:string):Promise<JournalRecord>{try{const raw=JSON.parse(await readFile(path(userId),"utf8")) as {entries?:unknown[]};return {version:4,entries:Array.isArray(raw.entries)?raw.entries.map(migrateJournalEntry).filter((entry):entry is JournalEntry=>Boolean(entry)).slice(-2000):[]};}catch{return empty();}}
async function writeJournal(userId:string,value:JournalRecord){await mkdir(join(root(),"journal"),{recursive:true});const target=path(userId),temp=`${target}.${process.pid}.${Date.now()}.tmp`;await writeFile(temp,JSON.stringify(value,null,2)+"\n",{mode:0o600});await rename(temp,target);}
const queues=new Map<string,Promise<unknown>>();export async function withJournalTransaction<T>(id:string,fn:()=>Promise<T>){const prior=queues.get(id)??Promise.resolve();let release!:()=>void;const gate=new Promise<void>(r=>release=r),queued=prior.then(()=>gate);queues.set(id,queued);await prior;try{return await fn();}finally{release();if(queues.get(id)===queued)queues.delete(id);}}

export class DuplicateJournalTradeError extends Error {constructor(public entryId:string,public archived:boolean){super("TRADE_ALREADY_JOURNALED");}}
export async function createJournalEntryWithinTransaction(userId:string,input:unknown){const record=await readJournal(userId),fields=journalCreateFields(input);const duplicate=fields.trade&&record.entries.find(e=>e.trade?.tradeId===fields.trade?.tradeId);if(duplicate)throw new DuplicateJournalTradeError(duplicate.id,duplicate.archived);const now=new Date().toISOString();const entry=Object.freeze({id:randomUUID(),...fields,createdAt:now,editedAt:now}) as JournalEntry;record.entries.push(entry);record.entries=record.entries.slice(-2000);await writeJournal(userId,record);return entry;}
export async function createJournalEntry(userId:string,input:unknown){return withJournalTransaction(userId,()=>createJournalEntryWithinTransaction(userId,input));}
export async function updateJournalEntry(userId:string,id:string,input:unknown){return withJournalTransaction(userId,async()=>{const record=await readJournal(userId),index=record.entries.findIndex(e=>e.id===id);if(index<0)return null;const entry=Object.freeze({...journalEditableFields(input,record.entries[index]),editedAt:new Date().toISOString()}) as JournalEntry;record.entries[index]=entry;await writeJournal(userId,record);return entry;});}
export async function setJournalArchived(userId:string,id:string,archived:boolean){return withJournalTransaction(userId,async()=>{const record=await readJournal(userId),index=record.entries.findIndex(e=>e.id===id);if(index<0)return null;const now=new Date().toISOString();const entry=Object.freeze({...record.entries[index],archived,archivedAt:archived?now:null,editedAt:now}) as JournalEntry;record.entries[index]=entry;await writeJournal(userId,record);return entry;});}
export async function deleteJournalEntry(userId:string,id:string){return withJournalTransaction(userId,async()=>{const record=await readJournal(userId),index=record.entries.findIndex(e=>e.id===id);if(index<0)return null;const [entry]=record.entries.splice(index,1);await writeJournal(userId,record);return entry;});}
export async function getJournalEntry(userId:string,id:string){return (await readJournal(userId)).entries.find(e=>e.id===id)??null;}
export async function setJournalReviewReferenceWithinTransaction(userId:string,id:string,reference:DizyBrainReviewReference){const record=await readJournal(userId),index=record.entries.findIndex(e=>e.id===id);if(index<0||!record.entries[index].trade)return null;const current=record.entries[index],entry=Object.freeze({...current,trade:Object.freeze({...current.trade!,dizyBrainReview:reference})}) as JournalEntry;record.entries[index]=entry;await writeJournal(userId,record);return entry;}
