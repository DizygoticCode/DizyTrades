import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/auth";
import type { Candle } from "../../lib/strategy";

export const dynamic = "force-dynamic";

const intervals: Record<string, { mexc: string; seconds: number }> = {
  "5m": { mexc: "Min5", seconds: 300 },
  "15m": { mexc: "Min15", seconds: 900 },
  "1h": { mexc: "Min60", seconds: 3600 },
  "4h": { mexc: "Hour4", seconds: 14_400 },
};

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const url = new URL(request.url);
  const timeframe = url.searchParams.get("timeframe") ?? "15m";
  const selected = intervals[timeframe] ?? intervals["15m"];
  const symbol = (url.searchParams.get("symbol") ?? "BTC_USDT").replace(
    /[^A-Z0-9_]/g,
    "",
  );
  const end = Math.floor(Date.now() / 1000);
  const start = end - selected.seconds * 650;
  const endpoint = new URL(
    `https://contract.mexc.com/api/v1/contract/kline/${symbol}`,
  );
  endpoint.searchParams.set("interval", selected.mexc);
  endpoint.searchParams.set("start", String(start));
  endpoint.searchParams.set("end", String(end));

  try {
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_500),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`MEXC returned ${response.status}`);
    const payload = (await response.json()) as {
      success?: boolean;
      data?: {
        time?: number[];
        open?: number[];
        high?: number[];
        low?: number[];
        close?: number[];
        vol?: number[];
      };
    };
    const data = payload.data;
    if (!payload.success || !data?.time?.length) throw new Error("No MEXC candle data");
    const candles: Candle[] = data.time.map((time, index) => ({
      time,
      open: Number(data.open?.[index]),
      high: Number(data.high?.[index]),
      low: Number(data.low?.[index]),
      close: Number(data.close?.[index]),
      volume: Number(data.vol?.[index] ?? 0),
    })).filter(
      (candle) =>
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close),
    );
    return NextResponse.json({
      source: "MEXC futures",
      symbol,
      timeframe,
      candles,
      receivedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        source: "unavailable",
        symbol,
        timeframe,
        candles: [],
        error: error instanceof Error ? error.message : "Market data unavailable",
      },
      { status: 503 },
    );
  }
}
