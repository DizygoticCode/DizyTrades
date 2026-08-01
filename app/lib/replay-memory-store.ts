import "server-only";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MAX_REPLAY_MEMORIES_PER_USER, MAX_REPLAY_MEMORY_BYTES, MAX_REPLAY_MEMORY_BYTES_PER_USER, validateHistoricalReplayMemory, type HistoricalReplayMemory } from "./historical-replay-memory";

const root=()=>process.env.DATA_DIR||join(process.cwd(),".data");
const safe=(value:string)=>{const result=value.replace(/[^a-z0-9_-]/gi,"");if(!result||result!==value)throw new Error("Invalid replay-memory identifier.");return result;};
const directory=(userId:string)=>join(root(),"replay-memory",safe(userId));
const filename=(userId:string,id:string)=>join(directory(userId),`${safe(id)}.json`);
const queues=new Map<string,Promise<unknown>>();async function serial<T>(id:string,fn:()=>Promise<T>){const prior=queues.get(id)??Promise.resolve();let release!:()=>void;const gate=new Promise<void>(r=>release=r),queued=prior.then(()=>gate);queues.set(id,queued);await prior;try{return await fn();}finally{release();if(queues.get(id)===queued)queues.delete(id);}}
export class ReplayMemoryStorageError extends Error {constructor(public code:string,message:string){super(message);}}

export async function createReplayMemory(userId:string,memory:HistoricalReplayMemory){return serial(userId,async()=>{const dir=directory(userId),target=filename(userId,memory.id);await mkdir(dir,{recursive:true});try{return validateHistoricalReplayMemory(JSON.parse(await readFile(target,"utf8")));}catch(reason){if((reason as NodeJS.ErrnoException).code!=="ENOENT")throw reason;}
  const encoded=JSON.stringify(memory,null,2)+"\n",bytes=Buffer.byteLength(encoded);if(bytes>MAX_REPLAY_MEMORY_BYTES)throw new ReplayMemoryStorageError("MEMORY_TOO_LARGE","Replay memory exceeds its size limit.");
  const files=(await readdir(dir)).filter(name=>/^hrm1_[a-f0-9]{40}\.json$/.test(name));if(files.length>=MAX_REPLAY_MEMORIES_PER_USER)throw new ReplayMemoryStorageError("MEMORY_LIMIT","Replay-memory count limit reached.");let total=0;for(const file of files)total+=(await stat(join(dir,file))).size;if(total+bytes>MAX_REPLAY_MEMORY_BYTES_PER_USER)throw new ReplayMemoryStorageError("STORAGE_LIMIT","Replay-memory storage limit reached.");
  const temp=`${target}.${process.pid}.${Date.now()}.tmp`;await writeFile(temp,encoded,{mode:0o600,flag:"wx"});await rename(temp,target);return memory;});}
export async function readReplayMemory(userId:string,id:string){try{const raw=await readFile(filename(userId,id),"utf8");if(Buffer.byteLength(raw)>MAX_REPLAY_MEMORY_BYTES)throw new ReplayMemoryStorageError("MALFORMED_MEMORY","Replay memory is oversized.");return validateHistoricalReplayMemory(JSON.parse(raw));}catch(reason){if((reason as NodeJS.ErrnoException).code==="ENOENT")return null;throw reason;}}
export async function deleteReplayMemory(userId:string,id:string){return serial(userId,async()=>{try{await unlink(filename(userId,id));return true;}catch(reason){if((reason as NodeJS.ErrnoException).code==="ENOENT")return false;throw reason;}});}
