import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { documentedDexProvider } from "../../../lib/dex/providers";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  if(!await requireApiUser())return NextResponse.json({error:"Unauthorised"},{status:401});
  const p=new URL(request.url).searchParams, query=(p.get("query")??"").trim(), chain=p.get("chain")||undefined;
  if(query.length>100||!(!chain||chain==="solana"||chain==="bsc"))return NextResponse.json({error:"Invalid DEX discovery query."},{status:400});
  try{return NextResponse.json(await documentedDexProvider.discover({query,chain:chain as "solana"|"bsc"|undefined,cursor:p.get("cursor")??undefined},AbortSignal.timeout(6500)));}
  catch(error){return NextResponse.json({markets:[],provider:documentedDexProvider.id,degraded:error instanceof Error?error.message:"Provider unavailable",receivedAt:0},{status:503});}
}
