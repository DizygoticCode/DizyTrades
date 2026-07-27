import {NextResponse} from "next/server";
import {requireApiUser} from "../../../lib/auth";
import {getMexcMarkets} from "../../../lib/market/mexc";
import {parseMexcRecentDeals} from "../../../lib/market/realtime";

export const dynamic="force-dynamic";
export async function GET(request:Request){
 const user=await requireApiUser();if(!user)return NextResponse.json({error:"Unauthorised"},{status:401});
 const url=new URL(request.url),symbol=url.searchParams.get("symbol")??"",limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit"))||100));
 try{
  const market=(await getMexcMarkets(AbortSignal.timeout(4500))).find(value=>value.symbol===symbol);
  if(!market)return NextResponse.json({error:"Unknown or unavailable symbol."},{status:400});
  const response=await fetch(`https://contract.mexc.com/api/v1/contract/deals/${encodeURIComponent(symbol)}?limit=${limit}`,{signal:AbortSignal.timeout(5500),cache:"no-store",headers:{accept:"application/json"}});
  const raw:unknown=await response.json();if(!response.ok)throw Error(`MEXC HTTP ${response.status}`);
  // Returning the normalised public fields keeps exchange quirks out of browser
  // code. No credentials are used or accepted by this route.
  const deals=parseMexcRecentDeals(raw,symbol,market.contractSize).map(deal=>({p:deal.price,v:deal.contractQuantity,T:deal.side==="buy"?1:2,i:deal.tradeId,t:deal.timeMs,cts:deal.engineTimeMs}));
  return NextResponse.json({success:true,symbol,data:deals});
 }catch(error){return NextResponse.json({error:"MEXC recent trades are unavailable.",detail:error instanceof Error?error.message:"Unknown failure"},{status:503})}
}
