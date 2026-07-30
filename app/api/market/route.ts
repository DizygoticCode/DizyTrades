import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/auth";
import { getMarketProvider } from "../../lib/market";
import { getMexcMarkets, isCandleTimeframe } from "../../lib/market/mexc";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await requireApiUser()) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const exchange = params.get("exchange") ?? "mexc";
  const symbol = params.get("symbol") ?? "BTC_USDT";
  const marketType = params.get("marketType") === "spot" ? "spot" : "futures";
  const timeframe = params.get("timeframe") ?? "15m";
  const limitRaw = params.get("limit") ?? "800";
  const endRaw = params.get("end");
  const limit = Number(limitRaw);
  const end = endRaw === null ? undefined : Number(endRaw);
  if (exchange !== "mexc") return NextResponse.json({ error: "Unsupported exchange." }, { status: 400 });
  if (!isCandleTimeframe(timeframe)) return NextResponse.json({ error: "Unsupported timeframe." }, { status: 400 });
  if (!Number.isInteger(limit) || limit < 1 || limit > 2000) return NextResponse.json({ error: "Limit must be between 1 and 2,000." }, { status: 400 });
  if (end !== undefined && (!Number.isInteger(end) || end < 1 || end > Math.floor(Date.now() / 1000))) return NextResponse.json({ error: "Invalid end cursor." }, { status: 400 });
  try {
    const instrument = (await getMexcMarkets(AbortSignal.timeout(5_500))).find((market) => market.sourceSymbol === symbol && market.marketType === marketType);
    if (!instrument) return NextResponse.json({ error: "Unknown or unavailable market." }, { status: 400 });
    const result = await getMarketProvider("mexc").getCandles({ exchange: "mexc", instrument, timeframe, limit, end }, AbortSignal.timeout(6_500));
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ source: "unavailable", exchange: "mexc", symbol, timeframe, candles: [], receivedAt: Date.now(), error: "MEXC public candle feed is unavailable." }, { status: 503 });
  }
}
