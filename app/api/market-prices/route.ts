import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/auth";
import { getMexcMarkets } from "../../lib/market/mexc";
import { emptyPriceSnapshot, mergePriceSnapshot, parseMexcPriceMessage } from "../../lib/market/price-sources";

export const dynamic = "force-dynamic";
export async function GET(request:Request){
  if(!await requireApiUser())return NextResponse.json({error:"Unauthorised"},{status:401});
  const params=new URL(request.url).searchParams,symbol=params.get("symbol")??"",marketType=params.get("marketType")==="spot"?"spot":"futures";
  const instrument=(await getMexcMarkets(AbortSignal.timeout(5_500))).find(item=>item.sourceSymbol===symbol&&item.marketType===marketType);
  if(!instrument)return NextResponse.json({error:"Unknown market"},{status:400});
  const snapshot=emptyPriceSnapshot(instrument.key),receivedAt=Date.now();
  try{
    if(marketType==="spot")return NextResponse.json(snapshot);
    const [ticker,fair]=await Promise.allSettled([fetch(`https://contract.mexc.com/api/v1/contract/ticker?symbol=${encodeURIComponent(symbol)}`,{cache:"no-store",signal:AbortSignal.timeout(5_000)}),fetch(`https://contract.mexc.com/api/v1/contract/fair_price/${encodeURIComponent(symbol)}`,{cache:"no-store",signal:AbortSignal.timeout(5_000)})]);
    let result=snapshot;
    for(const settled of [ticker,fair])if(settled.status==="fulfilled"&&settled.value.ok){const body=await settled.value.json() as {data?:unknown};result=mergePriceSnapshot(result,parseMexcPriceMessage({data:body.data},instrument.key,symbol,receivedAt));}
    return NextResponse.json(result);
  }catch{return NextResponse.json(snapshot);}
}
