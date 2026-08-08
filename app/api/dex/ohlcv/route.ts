import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { DIZY_MINT, DIZY_USDT_POOL, padDexOhlcv } from "../../../lib/dex/dizy";
import { documentedDexProvider, raydiumMintPrice } from "../../../lib/dex/providers";
import type { CandleTimeframe } from "../../../lib/market/types";

const intervals = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);

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
    const tokenAddress = chain === "solana" && pool === DIZY_USDT_POOL ? DIZY_MINT : undefined;
    const rawCandles = await documentedDexProvider.candles(
      { chain, poolAddress: pool, tokenAddress, interval, limit },
      AbortSignal.timeout(6500),
    );
    let currentPrice: number | undefined;
    if (tokenAddress) {
      try {
        currentPrice = await raydiumMintPrice(tokenAddress, AbortSignal.timeout(4500));
      } catch {
        // OHLCV remains usable when Raydium's UI price endpoint has a transient miss.
      }
    }
    const candles = tokenAddress
      ? padDexOhlcv(rawCandles, interval as CandleTimeframe, Date.now(), currentPrice)
      : rawCandles;
    return NextResponse.json({
      source: tokenAddress
        ? "GeckoTerminal OHLCV + Raydium API v3 price"
        : "GeckoTerminal documented OHLCV API",
      marketKey: `${chain}:${pool}`,
      candles,
      tradeCandleCount: rawCandles.length,
      currentPrice: currentPrice ?? rawCandles.at(-1)?.close ?? null,
      insufficientHistory: rawCandles.length < 20,
      receivedAt: Date.now(),
    });
  } catch {
    return NextResponse.json({ source: "GeckoTerminal unavailable", candles: [], error: "DEX pool history is unavailable." }, { status: 503 });
  }
}
