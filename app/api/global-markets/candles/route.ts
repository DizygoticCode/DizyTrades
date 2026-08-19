import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { getTwelveDataCandles } from "../../../lib/market/twelve-data";
import { CANDLE_TIMEFRAMES, type CandleTimeframe } from "../../../lib/market/types";

export const dynamic = "force-dynamic";

const validSymbol = (value: string) => /^[A-Z0-9./:_-]{1,60}$/.test(value);
const validVenue = (value: string) => /^[A-Za-z0-9 ._&()/-]{1,80}$/.test(value);
const validMic = (value: string) => /^[A-Z0-9]{2,24}$/.test(value);

export async function GET(request: Request) {
  if (!await requireApiUser()) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const symbol = (params.get("symbol") ?? "").trim().toUpperCase();
  const exchange = (params.get("exchange") ?? "GLOBAL").trim();
  const micCode = (params.get("mic") ?? "").trim().toUpperCase();
  const timeframe = params.get("timeframe") ?? "15m";
  const limit = Number(params.get("limit") ?? "800");
  if (!validSymbol(symbol)) return NextResponse.json({ error: "Invalid global symbol." }, { status: 400 });
  if (exchange !== "GLOBAL" && !validVenue(exchange)) return NextResponse.json({ error: "Invalid global exchange." }, { status: 400 });
  if (micCode && !validMic(micCode)) return NextResponse.json({ error: "Invalid market identifier." }, { status: 400 });
  if (!CANDLE_TIMEFRAMES.includes(timeframe as CandleTimeframe)) return NextResponse.json({ error: "Unsupported timeframe." }, { status: 400 });
  if (!Number.isInteger(limit) || limit < 1 || limit > 2000) return NextResponse.json({ error: "Limit must be between 1 and 2,000." }, { status: 400 });
  try {
    const result = await getTwelveDataCandles({
      symbol,
      exchange,
      micCode: micCode || undefined,
      timeframe: timeframe as CandleTimeframe,
      limit,
      signal: AbortSignal.timeout(6_500),
    });
    return NextResponse.json(result);
  } catch (error) {
    const unconfigured = error instanceof Error && error.message === "Twelve Data API key is not configured";
    return NextResponse.json({
      source: "unavailable",
      provider: "twelvedata",
      symbol,
      timeframe,
      candles: [],
      receivedAt: Date.now(),
      error: unconfigured ? "Global candle provider is not configured." : "Global candle data is temporarily unavailable.",
    }, { status: 503 });
  }
}
