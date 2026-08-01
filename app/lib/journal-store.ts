import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JournalEntry } from "./journal-model";
import { journalCreateFields, journalEditableFields } from "./journal-validation";
const root=()=>process.env.DATA_DIR||join(process.cwd(),".data"); const safe=(id:string)=>id.replace(/[^a-z0-9_-]/gi,""); const path=(id:string)=>join(root(),"journal",`${safe(id)}.json`);
type JournalRecord={version:1;entries:JournalEntry[]}; const empty=():JournalRecord=>({version:1,entries:[]});
export async function readJournal(userId:string):Promise<JournalRecord>{try{const raw=JSON.parse(await readFile(path(userId),"utf8")) as Partial<JournalRecord>;return {version:1,entries:Array.isArray(raw.entries)?raw.entries.filter(e=>e&&e.schemaVersion===1).slice(-2000):[]};}catch{return empty();}}
async function writeJournal(userId:string,value:JournalRecord){await mkdir(join(root(),"journal"),{recursive:true});const target=path(userId),temp=`${target}.${process.pid}.${Date.now()}.tmp`;await writeFile(temp,JSON.stringify(value,null,2)+"\n",{mode:0o600});await rename(temp,target);}
const queues=new Map<string,Promise<unknown>>();async function serial<T>(id:string,fn:()=>Promise<T>){const prior=queues.get(id)??Promise.resolve();let release!:()=>void;const gate=new Promise<void>(r=>release=r);queues.set(id,prior.then(()=>gate));await prior;try{return await fn();}finally{release();}}
export async function createJournalEntry(userId:string,input:unknown){return serial(userId,async()=>{const record=await readJournal(userId),fields=journalCreateFields(input);if(fields.trade&&record.entries.some(e=>e.trade?.tradeId===fields.trade?.tradeId))throw new Error("TRADE_ALREADY_JOURNALED");const now=new Date().toISOString();const entry=Object.freeze({id:randomUUID(),...fields,createdAt:now,editedAt:now}) as JournalEntry;record.entries.push(entry);record.entries=record.entries.slice(-2000);await writeJournal(userId,record);return entry;});}
export async function updateJournalEntry(userId:string,id:string,input:unknown){return serial(userId,async()=>{const record=await readJournal(userId),index=record.entries.findIndex(e=>e.id===id);if(index<0)return null;const entry=Object.freeze({...journalEditableFields(input,record.entries[index]),editedAt:new Date().toISOString()}) as JournalEntry;record.entries[index]=entry;await writeJournal(userId,record);return entry;});}
export async function getJournalEntry(userId:string,id:string){return (await readJournal(userId)).entries.find(e=>e.id===id)??null;}
