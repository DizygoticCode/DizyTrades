import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { getMexcMarkets } from "../../../lib/market/mexc";
import { parseRawMexcDepthCommits, parseRawMexcDepthSnapshot } from "../../../lib/order-flow/mexc-depth";
import type { DepthCommitsResponse, DepthSnapshotResponse } from "../../../lib/order-flow/types";

export const dynamic="force-dynamic";
const requests=new Map<string,number[]>(), TIMEOUT_MS=5_500;
type Failure={hostname:string;status?:number;code?:unknown;message:string;kind:"http"|"timeout"|"json"|"validation"|"network"};

async function requestUpstream(url:string,symbol:string,mode:string|null){
  const hostname=new URL(url).hostname;
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(TIMEOUT_MS),cache:"no-store",headers:{accept:"application/json"}});
    let raw:unknown;try{raw=await response.json();}catch{return {failure:{hostname,status:response.status,message:"Invalid JSON response",kind:"json"} satisfies Failure};}
    const envelope=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
    if(!response.ok||("success" in envelope&&envelope.success===false))return {failure:{hostname,status:response.status,code:envelope.code,message:String(envelope.message??envelope.msg??response.statusText),kind:"http"} satisfies Failure};
    if(mode==="commits"){const commits=parseRawMexcDepthCommits(raw,symbol);if(!commits.length)return {failure:{hostname,status:response.status,message:"No valid depth commits",kind:"validation"} satisfies Failure};return {hostname,commits};}
    const snapshot=parseRawMexcDepthSnapshot(raw,symbol);if(!snapshot||!snapshot.bids.length||!snapshot.asks.length)return {failure:{hostname,status:response.status,message:"Malformed or empty depth snapshot",kind:"validation"} satisfies Failure};
    return {hostname,snapshot};
  }catch(error){const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");return {failure:{hostname,message:timeout?`Request timed out after ${TIMEOUT_MS}ms`:error instanceof Error?error.message:"Network failure",kind:timeout?"timeout":"network"} satisfies Failure};}
}

export async function GET(request:Request){
  const user=await requireApiUser();if(!user)return NextResponse.json({error:"Unauthorised"},{status:401});
  const requestedAt=new Date().toISOString(),now=Date.now(),recent=(requests.get(user.id)??[]).filter(v=>v>now-60_000);if(recent.length>=20)return NextResponse.json({error:"Too many depth recovery requests.",requestedAt},{status:429});recent.push(now);requests.set(user.id,recent);
  const url=new URL(request.url),symbol=url.searchParams.get("symbol")??"",mode=url.searchParams.get("mode");
  try{const markets=await getMexcMarkets(AbortSignal.timeout(4_500));if(!markets.some(v=>v.symbol===symbol))return NextResponse.json({error:"Unknown or unavailable symbol.",requestedAt},{status:400});}catch(error){return NextResponse.json({error:"Market validation unavailable.",detail:error instanceof Error?error.message:"Unknown failure",requestedAt},{status:503});}
  const path=mode==="commits"?`/api/v1/contract/depth_commits/${encodeURIComponent(symbol)}/1000`:`/api/v1/contract/depth/${encodeURIComponent(symbol)}?limit=1000`;
  // Render has intermittently rejected the api.mexc.com contract alias. Try it
  // first as requested by MEXC, then use the canonical public contract host.
  const failures:Failure[]=[];for(const host of ["api.mexc.com","contract.mexc.com"]){const result=await requestUpstream(`https://${host}${path}`,symbol,mode);if(result.failure){failures.push(result.failure);continue;}if(mode==="commits"){const response:DepthCommitsResponse={success:true,symbol,source:result.hostname!,requestedAt,commits:result.commits!};return NextResponse.json(response)}const response:DepthSnapshotResponse={success:true,symbol,source:result.hostname!,requestedAt,snapshot:result.snapshot!};return NextResponse.json(response);}
  console.error("MEXC public depth request failed",{symbol,mode,requestedAt,failures});
  return NextResponse.json({error:"MEXC public depth feed is unavailable.",requestedAt,failures},{status:503});
}
