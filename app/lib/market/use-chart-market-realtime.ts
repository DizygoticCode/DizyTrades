"use client";

import { useEffect, useRef } from "react";
import type { Candle } from "../strategy";
import type { MexcDeal } from "./realtime";
import { useMexcRealtime } from "./use-mexc-realtime";
import type { CandleTimeframe } from "./types";
import type { ChartMarketInstrument } from "./chart-market";

export type RealtimeStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "delayed"
  | "offline";

export type MarketRealtimeDeal = MexcDeal;

type Options = {
  enabled: boolean;
  market: ChartMarketInstrument;
  timeframe: CandleTimeframe;
  onKline: (candle: Candle) => void;
  onDeal: (deal: MarketRealtimeDeal) => void;
  onStatus: (status: RealtimeStatus) => void;
  onClockOffset: (offsetMs: number) => void;
  onResync: () => void;
};

export function useChartMarketRealtime(options: Options) {
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });

  const mexc = options.market.provider.id === "mexc";
  useMexcRealtime({
    enabled: options.enabled && mexc,
    symbol: options.market.providerSymbol,
    marketType: options.market.marketType ?? "futures",
    timeframe: options.timeframe,
    contractSize: options.market.contractSize,
    onKline: (candle) => callbacks.current.onKline(candle),
    onDeal: (deal) => callbacks.current.onDeal(deal),
    onStatus: (status) => {
      if (mexc) callbacks.current.onStatus(status);
    },
    onClockOffset: (offsetMs) => {
      if (mexc) callbacks.current.onClockOffset(offsetMs);
    },
    onResync: () => {
      if (mexc) callbacks.current.onResync();
    },
  });

  useEffect(() => {
    if (options.market.provider.id === "mexc") return;
    if (!options.enabled) {
      callbacks.current.onStatus("offline");
      return;
    }
    if (options.market.capabilities.realtime !== "refresh") {
      callbacks.current.onStatus("offline");
      return;
    }

    callbacks.current.onStatus("delayed");
    const refresh = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      callbacks.current.onResync();
    };
    const refreshMs = options.market.capabilities.refreshMs;
    const timer = refreshMs === null ? null : window.setInterval(refresh, refreshMs);
    const visibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const online = () => {
      callbacks.current.onStatus("delayed");
      refresh();
    };
    const offline = () => callbacks.current.onStatus("offline");
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
    // Provider identity and declared capability own the refresh lifecycle. Callback
    // identity changes are delivered through callbacks.current without restarting it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.enabled,
    options.market.key,
    options.market.provider.id,
    options.market.capabilities.realtime,
    options.market.capabilities.refreshMs,
  ]);
}
