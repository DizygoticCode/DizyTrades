import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/auth";
import { getMexcMarkets } from "../../lib/market/mexc";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!await requireApiUser()) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  if ((params.get("exchange") ?? "mexc") !== "mexc") return NextResponse.json({ error: "Unsupported exchange." }, { status: 400 });
  try {
    const markets = await getMexcMarkets(AbortSignal.timeout(5_500));
    return NextResponse.json({ exchange: "mexc", markets, receivedAt: Date.now() });
  } catch { return NextResponse.json({ error: "MEXC market directory is unavailable." }, { status: 503 }); }
}
