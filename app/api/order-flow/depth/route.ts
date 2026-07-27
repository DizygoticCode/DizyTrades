import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { parseRawMexcDepthCommits, parseRawMexcDepthSnapshot } from "../../../lib/order-flow/mexc-depth";
import type { DepthCommitsResponse, DepthSnapshotResponse } from "../../../lib/order-flow/types";

export const dynamic="force-dynamic";
const requests=new Map<string,number[]>(), TIMEOUT_MS=5_500;
type Failure={hostname:string;status?:number;success?:unknown;code?:unknown;message:string;kind:"http"|"timeout"|"json"|"validation"|"network";elapsedMs:number};

async function requestUpstream(url:string,symbol:string,mode:string|null){
  const startedAt=Date.now();
  const hostname=new URL(url).hostname;
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(TIMEOUT_MS),cache:"no-store",headers:{accept:"application/json"}});
    let raw:unknown;try{raw=await response.json();}catch{return {failure:{hostname,status:response.status,message:"Invalid JSON response",kind:"json",elapsedMs:Date.now()-startedAt} satisfies Failure};}
    const envelope=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
    if(!response.ok||("success" in envelope&&envelope.success===false))return {failure:{hostname,status:response.status,success:envelope.success,code:envelope.code,message:String(envelope.message??envelope.msg??response.statusText),kind:"http",elapsedMs:Date.now()-startedAt} satisfies Failure};
    if(mode==="commits"){const commits=parseRawMexcDepthCommits(raw,symbol);if(!commits.length)return {failure:{hostname,status:response.status,success:envelope.success,code:envelope.code,message:"No valid depth commits",kind:"validation",elapsedMs:Date.now()-startedAt} satisfies Failure};return {hostname,commits,diagnostics:{hostname,httpStatus:response.status,success:envelope.success??true,code:envelope.code??null,message:envelope.message??envelope.msg??null,firstCommitVersion:commits[0].version,lastCommitVersion:commits.at(-1)!.version,commits:commits.length,elapsedMs:Date.now()-startedAt}};}
    const snapshot=parseRawMexcDepthSnapshot(raw,symbol);if(!snapshot||!snapshot.bids.length||!snapshot.asks.length)return {failure:{hostname,status:response.status,success:envelope.success,code:envelope.code,message:`Malformed depth snapshot (version ${snapshot?.version??"unknown"}, bids ${snapshot?.bids.length??0}, asks ${snapshot?.asks.length??0})`,kind:"validation",elapsedMs:Date.now()-startedAt} satisfies Failure};
    return {hostname,snapshot,diagnostics:{hostname,httpStatus:response.status,success:envelope.success??true,code:envelope.code??null,message:envelope.message??envelope.msg??null,snapshotVersion:snapshot.version,snapshotBids:snapshot.bids.length,snapshotAsks:snapshot.asks.length,elapsedMs:Date.now()-startedAt}};
  }catch(error){const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");return {failure:{hostname,message:timeout?`Request timed out after ${TIMEOUT_MS}ms`:error instanceof Error?error.message:"Network failure",kind:timeout?"timeout":"network",elapsedMs:Date.now()-startedAt} satisfies Failure};}
}

export async function GET(request:Request){
  const user=await requireApiUser();if(!user)return NextResponse.json({error:"Unauthorised"},{status:401});
  const requestedAt=new Date().toISOString(),now=Date.now(),recent=(requests.get(user.id)??[]).filter(v=>v>now-60_000);if(recent.length>=20)return NextResponse.json({error:"Too many depth recovery requests.",requestedAt},{status:429});recent.push(now);requests.set(user.id,recent);
  const url=new URL(request.url),symbol=url.searchParams.get("symbol")??"",mode=url.searchParams.get("mode");
  if(!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol))return NextResponse.json({error:"Invalid contract symbol.",requestedAt},{status:400});
  if(mode!==null&&mode!=="commits")return NextResponse.json({error:"Invalid depth mode.",requestedAt},{status:400});
  const path=mode==="commits"?`/api/v1/contract/depth_commits/${encodeURIComponent(symbol)}/1000`:`/api/v1/contract/depth/${encodeURIComponent(symbol)}?limit=1000`;
  const failures:Failure[]=[];for(const host of ["api.mexc.com"]){const result=await requestUpstream(`https://${host}${path}`,symbol,mode);if(result.failure){failures.push(result.failure);continue;}if(mode==="commits"){const response:DepthCommitsResponse&{diagnostics:unknown}={success:true,symbol,source:result.hostname!,requestedAt,commits:result.commits!,diagnostics:result.diagnostics};return NextResponse.json(response)}const response:DepthSnapshotResponse&{diagnostics:unknown}={success:true,symbol,source:result.hostname!,requestedAt,snapshot:result.snapshot!,diagnostics:result.diagnostics};return NextResponse.json(response);}
  console.error("MEXC public depth request failed",{symbol,mode,requestedAt,failures});
  const permanent=failures.find(failure=>failure.status===403||failure.status===451);
  return NextResponse.json({error:permanent?`MEXC depth request returned HTTP ${permanent.status}.`:"MEXC public depth feed is unavailable.",requestedAt,failures},{status:permanent?.status??503});
}
