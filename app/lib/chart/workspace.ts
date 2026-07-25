import "server-only";
import { mkdir,readFile,rename,writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MAX_DRAWINGS,sanitiseDrawing,type Drawing } from "./drawings";
import { MAX_USER_INDICATORS,sanitiseIndicator,type UserIndicator } from "./user-indicators";
export const MAX_WORKSPACE_BYTES=750_000;
export type ChartWorkspace={version:number;exchange:string;symbol:string;timeframe:string;drawings:Drawing[];indicators:UserIndicator[];updatedAt:string};
const root=()=>process.env.DATA_DIR||join(process.cwd(),".data");
export const safeWorkspacePart=(v:string,max=50)=>{if(!v||v.length>max||!/^[a-z0-9_-]+$/i.test(v))throw new Error("Unsafe chart workspace key");return v};
export const workspaceKey=(exchange:string,symbol:string,timeframe:string)=>[exchange,symbol,timeframe].map(v=>safeWorkspacePart(v)).join("__");
const pathFor=(user:string,e:string,s:string,t:string)=>join(root(),"chart-workspaces",safeWorkspacePart(user),`${workspaceKey(e,s,t)}.json`);
export function emptyWorkspace(exchange:string,symbol:string,timeframe:string):ChartWorkspace{return {version:0,exchange,symbol,timeframe,drawings:[],indicators:[],updatedAt:new Date(0).toISOString()}}
export function sanitiseWorkspace(v:unknown,e:string,s:string,t:string):ChartWorkspace {if(!v||typeof v!=="object")return emptyWorkspace(e,s,t);const x=v as Record<string,unknown>;const drawings=(Array.isArray(x.drawings)?x.drawings:[]).map(sanitiseDrawing).filter((d):d is Drawing=>d!==null);const indicators=(Array.isArray(x.indicators)?x.indicators:[]).map(sanitiseIndicator).filter((d):d is UserIndicator=>d!==null);if(drawings.length>MAX_DRAWINGS||indicators.length>MAX_USER_INDICATORS)throw new RangeError("Chart workspace object limit exceeded");return {version:typeof x.version==="number"&&Number.isSafeInteger(x.version)&&x.version>=0?x.version:0,exchange:e,symbol:s,timeframe:t,drawings,indicators,updatedAt:typeof x.updatedAt==="string"?x.updatedAt:new Date(0).toISOString()}}
export async function readWorkspace(user:string,e:string,s:string,t:string){try{return sanitiseWorkspace(JSON.parse(await readFile(pathFor(user,e,s,t),"utf8")),e,s,t)}catch(error){if(error instanceof RangeError)throw error;return emptyWorkspace(e,s,t)}}
export class VersionConflictError extends Error{}
export async function writeWorkspace(user:string,e:string,s:string,t:string,input:unknown){const current=await readWorkspace(user,e,s,t),clean=sanitiseWorkspace(input,e,s,t);if(clean.version!==current.version)throw new VersionConflictError("A newer chart workspace exists");const next={...clean,version:current.version+1,updatedAt:new Date().toISOString()};const target=pathFor(user,e,s,t);await mkdir(join(root(),"chart-workspaces",safeWorkspacePart(user)),{recursive:true});const temporary=`${target}.${process.pid}.${Date.now()}.tmp`;await writeFile(temporary,`${JSON.stringify(next)}\n`,{encoding:"utf8",mode:0o600});await rename(temporary,target);return next}
