import {NextResponse} from "next/server";
import {requireApiUser} from "../../../lib/auth";
import {parseRawMexcDepthCommits,parseRawMexcDepthSnapshot} from "../../../lib/order-flow/mexc-depth";

export const dynamic="force-dynamic";
const HOST="api.mexc.com",TIMEOUT_MS=5_500;
type Failure={hostname:string;kind:"http"|"timeout"|"parse"|"validation"|"network";status?:number;code?:unknown;message:string;bidCount?:number;askCount?:number};

async function diagnostic(path:string,symbol:string,commits=false){
 const hostname=HOST;
 try{
  const response=await fetch(`https://${hostname}${path}`,{cache:"no-store",signal:AbortSignal.timeout(TIMEOUT_MS),headers:{accept:"application/json"}});
  let raw:unknown;try{raw=await response.json()}catch{return{status:response.status,failure:{hostname,status:response.status,kind:"parse",message:"Upstream response was not valid JSON"} satisfies Failure}}
  const envelope=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
  if(!response.ok||envelope.success===false){const blocked=response.status===403||response.status===451;return{status:response.status,failure:{hostname,status:response.status,code:envelope.code,kind:"http",message:blocked?`MEXC blocked this deployment region (HTTP ${response.status}); use the Frankfurt deployment or a separate market-data relay.`:String(envelope.message??envelope.msg??response.statusText)} satisfies Failure}}
  if(commits){const values=parseRawMexcDepthCommits(raw,symbol);return values.length?{status:response.status,commits:values}:{status:response.status,failure:{hostname,status:response.status,kind:"validation",message:"No valid depth commits"} satisfies Failure}}
  const snapshot=parseRawMexcDepthSnapshot(raw,symbol),bidCount=snapshot?.bids.length??0,askCount=snapshot?.asks.length??0;
  return snapshot&&bidCount&&askCount?{status:response.status,snapshot}:{status:response.status,failure:{hostname,status:response.status,kind:"validation",message:"Malformed or empty depth snapshot",bidCount,askCount} satisfies Failure};
 }catch(error){const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");return{failure:{hostname,kind:timeout?"timeout":"network",message:timeout?`Request timed out after ${TIMEOUT_MS}ms`:error instanceof Error?error.message:"Network failure"} satisfies Failure}}
}

export async function GET(request:Request){
 const user=await requireApiUser();if(!user)return NextResponse.json({error:"Unauthorised"},{status:401});
 const symbol=new URL(request.url).searchParams.get("symbol")??"";if(!/^[A-Z0-9]{2,20}_[A-Z0-9]{2,20}$/.test(symbol))return NextResponse.json({error:"Invalid symbol"},{status:400});
 const started=Date.now(),snapshot=await diagnostic(`/api/v1/contract/depth/${encodeURIComponent(symbol)}?limit=1000`,symbol),commits=await diagnostic(`/api/v1/contract/depth_commits/${encodeURIComponent(symbol)}/1000`,symbol,true),values=commits.commits??[],failures=[snapshot.failure,commits.failure].filter(Boolean);
 return NextResponse.json({success:failures.length===0,symbol,primaryHost:HOST,snapshotHttpStatus:snapshot.status??null,snapshotVersion:snapshot.snapshot?.version??null,snapshotBidCount:snapshot.snapshot?.bids.length??snapshot.failure?.bidCount??0,snapshotAskCount:snapshot.snapshot?.asks.length??snapshot.failure?.askCount??0,commitHttpStatus:commits.status??null,commitCount:values.length,firstCommitVersion:values.at(0)?.version??null,lastCommitVersion:values.at(-1)?.version??null,elapsedMs:Date.now()-started,failures});
}
