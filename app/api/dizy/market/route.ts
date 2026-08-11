import { NextResponse } from "next/server";
import { DIZY_MINT, DIZY_POOL } from "../../../dizy/token-config";

const GECKOTERMINAL_API = "https://api.geckoterminal.com/api/v2";
const API_HEADERS = {
  Accept: "application/json;version=20230203",
} as const;

const RESPONSE_HEADERS = {
  "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
} as const;

type PricePayload = {
  data?: {
    attributes?: {
      token_prices?: Record<string, string | number | null>;
    };
  };
};

type OhlcvPayload = {
  data?: {
    attributes?: {
      ohlcv_list?: unknown[];
    };
  };
};

type MarketPoint = {
  timestamp: number;
  close: number;
};

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function parsePoint(value: unknown): MarketPoint | null {
  if (!Array.isArray(value) || value.length < 5) return null;

  const timestamp = finiteNumber(value[0]);
  const close = finiteNumber(value[4]);
  if (timestamp === null || close === null || close < 0) return null;

  return { timestamp, close };
}

async function fetchPrice(): Promise<number | null> {
  const response = await fetch(
    `${GECKOTERMINAL_API}/simple/networks/solana/token_price/${DIZY_MINT}`,
    {
      headers: API_HEADERS,
      next: { revalidate: 60 },
    },
  );

  if (!response.ok) {
    throw new Error(`GeckoTerminal token price returned ${response.status}`);
  }

  const payload = (await response.json()) as PricePayload;
  return finiteNumber(payload.data?.attributes?.token_prices?.[DIZY_MINT]);
}

async function fetchChart(): Promise<MarketPoint[]> {
  const params = new URLSearchParams({
    aggregate: "1",
    limit: "24",
    currency: "usd",
    token: DIZY_MINT,
    include_empty_intervals: "true",
  });
  const response = await fetch(
    `${GECKOTERMINAL_API}/networks/solana/pools/${DIZY_POOL}/ohlcv/hour?${params.toString()}`,
    {
      headers: API_HEADERS,
      next: { revalidate: 60 },
    },
  );

  if (!response.ok) {
    throw new Error(`GeckoTerminal OHLCV returned ${response.status}`);
  }

  const payload = (await response.json()) as OhlcvPayload;
  return (payload.data?.attributes?.ohlcv_list ?? [])
    .map(parsePoint)
    .filter((point): point is MarketPoint => point !== null)
    .sort((left, right) => left.timestamp - right.timestamp);
}

export async function GET() {
  const [priceResult, chartResult] = await Promise.allSettled([
    fetchPrice(),
    fetchChart(),
  ]);

  const priceFromTicker = priceResult.status === "fulfilled" ? priceResult.value : null;
  const chartPoints = chartResult.status === "fulfilled" ? chartResult.value : [];
  const lastChartPrice = chartPoints.at(-1)?.close ?? null;
  const priceUsd = priceFromTicker ?? lastChartPrice;

  if (priceUsd === null && chartPoints.length === 0) {
    return NextResponse.json(
      {
        status: "unavailable",
        source: "GeckoTerminal",
        poolAddress: DIZY_POOL,
      },
      { status: 503, headers: RESPONSE_HEADERS },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const points = [...chartPoints];
  if (priceUsd !== null) {
    const finalPoint = points.at(-1);
    if (!finalPoint || finalPoint.timestamp < now - 30) {
      points.push({ timestamp: now, close: priceUsd });
    } else {
      points[points.length - 1] = { ...finalPoint, close: priceUsd };
    }
  }

  const firstPrice = points[0]?.close ?? null;
  const change24hPct =
    firstPrice !== null && firstPrice > 0 && priceUsd !== null
      ? ((priceUsd - firstPrice) / firstPrice) * 100
      : null;

  return NextResponse.json(
    {
      status: "ok",
      source: "GeckoTerminal",
      poolAddress: DIZY_POOL,
      priceUsd,
      change24hPct,
      updatedAt: new Date().toISOString(),
      points,
    },
    { headers: RESPONSE_HEADERS },
  );
}
