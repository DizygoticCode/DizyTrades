"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

const REFRESH_MS = 60_000;

type MarketPoint = {
  timestamp: number;
  close: number;
};

type MarketPayload = {
  status: "ok";
  source: string;
  poolAddress: string;
  priceUsd: number | null;
  change24hPct: number | null;
  updatedAt: string;
  points: MarketPoint[];
};

function formatPrice(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Unavailable";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumSignificantDigits: value < 1 ? 3 : 2,
    maximumSignificantDigits: value < 1 ? 7 : 8,
  }).format(value);
}

function formatChange(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "24h unavailable";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function chartPath(points: MarketPoint[]) {
  if (points.length < 2) return "";

  const closes = points.map((point) => point.close);
  const minimum = Math.min(...closes);
  const maximum = Math.max(...closes);
  const range = maximum - minimum;
  const width = 480;
  const height = 150;
  const padding = 7;

  return points
    .map((point, index) => {
      const x = padding + (index / (points.length - 1)) * (width - padding * 2);
      const normalized = range === 0 ? 0.5 : (point.close - minimum) / range;
      const y = padding + (1 - normalized) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function DizyMarketCard() {
  const [market, setMarket] = useState<MarketPayload | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/dizy/market", { cache: "no-store" });
        if (!response.ok) throw new Error(`DIZY market route returned ${response.status}`);

        const payload = (await response.json()) as MarketPayload;
        if (payload.status !== "ok") throw new Error("DIZY market data unavailable");

        if (active) {
          setMarket(payload);
          setRefreshFailed(false);
        }
      } catch {
        if (active) setRefreshFailed(true);
      }
    };

    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const path = useMemo(() => chartPath(market?.points ?? []), [market?.points]);
  const changeClass =
    market?.change24hPct == null
      ? styles.marketNeutral
      : market.change24hPct > 0
        ? styles.marketPositive
        : market.change24hPct < 0
          ? styles.marketNegative
          : styles.marketNeutral;

  return (
    <article className={styles.marketCard} aria-labelledby="dizy-market-ticker">
      <div className={styles.marketTicker}>
        <div>
          <span className={styles.marketLabel}>DIZY / USD</span>
          <strong id="dizy-market-ticker">
            {market ? formatPrice(market.priceUsd) : refreshFailed ? "Unavailable" : "Loading…"}
          </strong>
        </div>
        <div className={`${styles.marketChange} ${changeClass}`}>
          <span>24H</span>
          <strong>{market ? formatChange(market.change24hPct) : "—"}</strong>
        </div>
      </div>

      <div className={styles.marketChart}>
        <div className={styles.marketChartHeader}>
          <span>24 hour price</span>
          <span>{market?.points.length ? `${market.points.length} points` : "Hourly"}</span>
        </div>
        {path ? (
          <svg
            viewBox="0 0 480 150"
            preserveAspectRatio="none"
            role="img"
            aria-label="DIZY 24 hour USD price chart"
          >
            <path d={path} vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <div className={styles.marketChartEmpty}>
            {refreshFailed ? "Public chart data is temporarily unavailable." : "Loading 24h chart…"}
          </div>
        )}
        <div className={styles.marketAxis} aria-hidden="true">
          <span>24h ago</span>
          <span>Now</span>
        </div>
      </div>

      <div className={styles.marketMeta}>
        <span>GeckoTerminal · canonical Raydium pool</span>
        <span>
          {market
            ? `Updated ${new Date(market.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Refreshes about once a minute"}
        </span>
      </div>
      {market && refreshFailed ? (
        <p className={styles.marketNotice}>Latest refresh failed; showing the last received market snapshot.</p>
      ) : null}
    </article>
  );
}
