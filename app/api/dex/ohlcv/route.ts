import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { documentedDexProvider } from "../../../lib/dex/providers";

const intervals = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "8h", "1d"]);

export async function GET(request: Request) {
  if (!await requireApiUser()) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const p = new URL(request.url).searchParams;
  const chain = p.get("chain");
  const pool = p.get("pool") ?? "";
  const interval = p.get("interval") ?? "15m";
  const limit = Math.min(1000, Number(p.get("limit") ?? 400));
  if ((chain !== "solana" && chain !== "bsc") || pool.length < 10 || pool.length > 100 || !intervals.has(interval) || !Number.isInteger(limit) || limit < 1) {
    return NextResponse.json({ error: "Invalid pool candle request." }, { status: 400 });
  }
  try {
    const candles = await documentedDexProvider.candles({ chain, poolAddress: pool, interval, limit }, AbortSignal.timeout(6500));
    return NextResponse.json({
      source: "GeckoTerminal documented OHLCV API",
      marketKey: `${chain}:${pool}`,
      candles,
      insufficientHistory: candles.length < 20,
      receivedAt: Date.now(),
    });
  } catch {
    return NextResponse.json({ source: "GeckoTerminal unavailable", candles: [], error: "DEX pool history is unavailable." }, { status: 503 });
  }
}
