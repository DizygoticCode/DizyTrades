"use client";

import { useEffect, useRef } from "react";
import type { Candle } from "../strategy";
import { decodeMexcMessage } from "../order-flow/mexc-depth";
import { MEXC_INTERVALS } from "./mexc-shared";
import {
  StableClockOffset,
  parseMexcDeals,
  parseMexcKline,
  type MexcDeal,
} from "./realtime";
import type { CandleTimeframe, MarketType } from "./types";

export type RealtimeStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "delayed"
  | "offline";

type Options = {
  enabled: boolean;
  marketType: MarketType;
  symbol: string;
  timeframe: CandleTimeframe;
  contractSize?: number;
  onKline: (candle: Candle) => void;
  onDeal: (deal: MexcDeal) => void;
  onStatus: (status: RealtimeStatus) => void;
  onClockOffset: (offsetMs: number) => void;
  onResync: () => void;
};

export const MEXC_FUTURES_PUBLIC_WS_URL = "wss://contract.mexc.com/edge";
export const MEXC_SPOT_REST_REFRESH_MS = 10_000;
export const MEXC_FUTURES_SUBSCRIPTION_CONFIRM_MS = 10_000;

const subscriptionChannel = (value: unknown) =>
  typeof value === "string" && value.startsWith("rs.sub.") ? value : null;

export function useMexcRealtime(options: Options) {
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });
  const generation = useRef(0);
  const clock = useRef(new StableClockOffset());

  useEffect(() => {
    if (!options.enabled) {
      options.onStatus("offline");
      return;
    }

    const id = ++generation.current;
    clock.current.reset();
    let stopped = false;
    const valid = () => !stopped && generation.current === id;

    // MEXC Spot public pushes are protobuf. Until the protobuf schema is compiled
    // into this client, keep Spot honest and bounded by using the existing REST
    // reconciliation path instead of pretending binary frames are JSON.
    if (options.marketType === "spot") {
      callbacks.current.onStatus("delayed");
      const resync = () => {
        if (!valid() || document.visibilityState !== "visible" || !navigator.onLine)
          return;
        callbacks.current.onResync();
      };
      const timer = window.setInterval(resync, MEXC_SPOT_REST_REFRESH_MS);
      const visibility = () => {
        if (document.visibilityState === "visible") resync();
      };
      const online = () => {
        callbacks.current.onStatus("delayed");
        resync();
      };
      const offline = () => callbacks.current.onStatus("offline");
      document.addEventListener("visibilitychange", visibility);
      window.addEventListener("online", online);
      window.addEventListener("offline", offline);
      return () => {
        stopped = true;
        window.clearInterval(timer);
        document.removeEventListener("visibilitychange", visibility);
        window.removeEventListener("online", online);
        window.removeEventListener("offline", offline);
      };
    }

    let socket: WebSocket | null = null;
    let heartbeat: number | undefined;
    let staleTimer: number | undefined;
    let confirmationTimer: number | undefined;
    let reconnectTimer: number | undefined;
    let attempt = 0;
    let lastActivity = Date.now();
    let feedConfirmed = false;
    const confirmedSubscriptions = new Set<string>();

    const clearTimers = () => {
      if (heartbeat) clearInterval(heartbeat);
      if (staleTimer) clearInterval(staleTimer);
      if (confirmationTimer) clearTimeout(confirmationTimer);
      heartbeat = staleTimer = confirmationTimer = undefined;
    };

    const close = () => {
      clearTimers();
      if (!socket) return;
      const old = socket;
      socket = null;
      old.onopen = old.onmessage = old.onerror = old.onclose = null;
      if (old.readyState === WebSocket.OPEN) {
        old.send(
          JSON.stringify({
            method: "unsub.kline",
            param: {
              symbol: options.symbol,
              interval: MEXC_INTERVALS[options.timeframe].api,
            },
          }),
        );
        old.send(
          JSON.stringify({
            method: "unsub.deal",
            param: { symbol: options.symbol },
          }),
        );
      }
      old.close();
    };

    const confirmFeed = () => {
      if (feedConfirmed || !valid()) return;
      feedConfirmed = true;
      if (confirmationTimer) clearTimeout(confirmationTimer);
      confirmationTimer = undefined;
      const recovered = attempt > 0;
      attempt = 0;
      callbacks.current.onStatus("live");
      if (recovered) callbacks.current.onResync();
    };

    const reconnect = () => {
      if (!valid() || reconnectTimer) return;
      close();
      callbacks.current.onStatus(attempt ? "reconnecting" : "delayed");
      const base = Math.min(30_000, 1_000 * 2 ** Math.min(attempt++, 5));
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, base * (0.8 + Math.random() * 0.4));
    };

    const connect = () => {
      if (!valid() || socket) return;
      callbacks.current.onStatus(attempt ? "reconnecting" : "connecting");
      feedConfirmed = false;
      confirmedSubscriptions.clear();
      const current = new WebSocket(MEXC_FUTURES_PUBLIC_WS_URL);
      socket = current;

      current.onopen = () => {
        if (!valid() || socket !== current) return current.close();
        lastActivity = Date.now();
        current.send(
          JSON.stringify({
            method: "sub.kline",
            param: {
              symbol: options.symbol,
              interval: MEXC_INTERVALS[options.timeframe].api,
            },
            gzip: false,
          }),
        );
        current.send(
          JSON.stringify({
            method: "sub.deal",
            param: { symbol: options.symbol },
            gzip: false,
            compress: false,
          }),
        );
        confirmationTimer = window.setTimeout(() => {
          if (valid() && socket === current && !feedConfirmed) reconnect();
        }, MEXC_FUTURES_SUBSCRIPTION_CONFIRM_MS);
        heartbeat = window.setInterval(() => {
          if (current.readyState === WebSocket.OPEN)
            current.send(JSON.stringify({ method: "ping" }));
        }, 15_000);
        staleTimer = window.setInterval(() => {
          if (Date.now() - lastActivity > 45_000) reconnect();
        }, 5_000);
      };

      current.onmessage = async (event) => {
        if (!valid() || socket !== current) return;
        const message = await decodeMexcMessage(event.data);
        if (!message || !valid() || socket !== current) return;
        lastActivity = Date.now();
        const envelope =
          message && typeof message === "object"
            ? (message as Record<string, unknown>)
            : {};
        const serverTs = Number(envelope.ts ?? envelope.t);
        if (Number.isFinite(serverTs) && serverTs > 0) {
          callbacks.current.onClockOffset(
            clock.current.add(
              serverTs < 1e12 ? serverTs * 1000 : serverTs,
              Date.now(),
            ),
          );
        }

        // Pong proves the transport is alive, not that market subscriptions were
        // accepted. Do not promote a failed/empty market feed to LIVE on heartbeat.
        if (
          envelope.channel === "pong" ||
          envelope.method === "pong" ||
          envelope.data === "pong"
        )
          return;

        if (envelope.channel === "rs.error") {
          callbacks.current.onStatus("delayed");
          reconnect();
          return;
        }

        const acknowledgement = subscriptionChannel(envelope.channel);
        if (acknowledgement) {
          if (String(envelope.data ?? "").toLowerCase() !== "success") {
            callbacks.current.onStatus("delayed");
            reconnect();
            return;
          }
          confirmedSubscriptions.add(acknowledgement);
          if (
            confirmedSubscriptions.has("rs.sub.kline") &&
            confirmedSubscriptions.has("rs.sub.deal")
          )
            confirmFeed();
          return;
        }

        const kline = parseMexcKline(
          message,
          options.symbol,
          options.timeframe,
        );
        if (kline) {
          confirmFeed();
          callbacks.current.onKline(kline);
        }
        const deals = parseMexcDeals(
          message,
          options.symbol,
          callbacks.current.contractSize,
        );
        if (deals.length) {
          confirmFeed();
          deals.forEach(callbacks.current.onDeal);
        }
      };

      current.onerror = reconnect;
      current.onclose = reconnect;
    };

    const visibility = () => {
      if (document.visibilityState !== "visible") return;
      callbacks.current.onResync();
      if (!socket || socket.readyState > WebSocket.OPEN) reconnect();
    };
    const online = () => {
      if (!socket || socket.readyState >= WebSocket.CLOSING) reconnect();
      else if (socket.readyState === WebSocket.OPEN && feedConfirmed)
        callbacks.current.onResync();
    };
    const offline = () => {
      callbacks.current.onStatus("offline");
      close();
    };

    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      close();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
    // Socket lifecycle deliberately changes only for these identity/enabled fields;
    // current callbacks are delivered through callbacks.current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.enabled, options.marketType, options.symbol, options.timeframe]);
}
