import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { searchTwelveDataMarkets } from "../../../lib/market/twelve-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await requireApiUser()) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (query.length < 2 || query.length > 80)
    return NextResponse.json({ error: "Search query must contain between 2 and 80 characters." }, { status: 400 });
  try {
    const result = await searchTwelveDataMarkets(query, AbortSignal.timeout(5_500));
    return NextResponse.json({ provider: "twelvedata", ...result });
  } catch (error) {
    const unconfigured = error instanceof Error && error.message === "Twelve Data API key is not configured";
    return NextResponse.json({
      provider: "twelvedata",
      markets: [],
      receivedAt: Date.now(),
      cached: false,
      error: unconfigured ? "Global Search is not configured." : "Global market search is temporarily unavailable.",
    }, { status: 503 });
  }
}
