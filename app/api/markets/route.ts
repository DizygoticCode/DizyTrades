import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/auth";
import { getMexcMarkets } from "../../lib/market/mexc";

export const dynamic = "force-dynamic";
const majors = ["BTC_USDT", "ETH_USDT", "SOL_USDT", "XRP_USDT", "BNB_USDT"];

export async function GET(request: Request) {
  if (!await requireApiUser()) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  if ((params.get("exchange") ?? "mexc") !== "mexc") return NextResponse.json({ error: "Unsupported exchange." }, { status: 400 });
  const query = (params.get("query") ?? "").trim().toUpperCase();
  if (query.length > 40) return NextResponse.json({ error: "Query is too long." }, { status: 400 });
  const favourites = new Set((params.get("favourites") ?? "").split(",").filter((s) => /^[A-Z0-9]+_[A-Z0-9]+$/.test(s)).slice(0, 50));
  try {
    const markets = (await getMexcMarkets(AbortSignal.timeout(5_500)))
      .filter((m) => !query || `${m.symbol} ${m.base} ${m.quote}`.includes(query))
      .sort((a, b) => Number(favourites.has(b.symbol)) - Number(favourites.has(a.symbol)) || (majors.indexOf(a.symbol) < 0 ? 99 : majors.indexOf(a.symbol)) - (majors.indexOf(b.symbol) < 0 ? 99 : majors.indexOf(b.symbol)) || a.symbol.localeCompare(b.symbol))
      .slice(0, 200);
    return NextResponse.json({ exchange: "mexc", marketType: "perpetual", markets, receivedAt: Date.now() });
  } catch { return NextResponse.json({ error: "MEXC market directory is unavailable." }, { status: 503 }); }
}
