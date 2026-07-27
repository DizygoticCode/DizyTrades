"use client";

import { useEffect, useRef } from "react";
import type { Candle } from "../strategy";
import { MEXC_INTERVALS } from "./mexc-shared";
import { StableClockOffset, parseMexcDeals, parseMexcKline, type MexcDeal } from "./realtime";
import type { CandleTimeframe } from "./types";
import { decodeMexcMessage, parseDepthMessage } from "../order-flow/mexc-depth";
import type { DepthUpdate } from "../order-flow/types";

export type RealtimeStatus = "connecting" | "live" | "reconnecting" | "delayed" | "offline";
type Options = { enabled: boolean; symbol: string; timeframe: CandleTimeframe; contractSize?: number; orderFlowEnabled?: boolean; onDepth?: (update: DepthUpdate) => void; onKline: (candle: Candle) => void; onDeal: (deal: MexcDeal) => void; onStatus: (status: RealtimeStatus) => void; onClockOffset: (offsetMs: number) => void; onResync: () => void };

export function useMexcRealtime(options: Options) {
  const callbacks = useRef(options);
  useEffect(() => { callbacks.current = options; });
  const generation = useRef(0);
  const clock = useRef(new StableClockOffset());
  useEffect(() => {
    if (!options.enabled) { options.onStatus("offline"); return; }
    const id = ++generation.current; clock.current.reset();
    let socket: WebSocket | null = null, heartbeat: number | undefined, staleTimer: number | undefined, reconnectTimer: number | undefined;
    let attempt = 0, stopped = false, lastActivity = Date.now();
    const valid = () => !stopped && generation.current === id;
    const clearTimers = () => { if (heartbeat) clearInterval(heartbeat); if (staleTimer) clearInterval(staleTimer); heartbeat = staleTimer = undefined; };
    const close = () => { clearTimers(); if (socket) { const old = socket; socket = null; old.onopen = old.onmessage = old.onerror = old.onclose = null; if (old.readyState === WebSocket.OPEN) { old.send(JSON.stringify({ method: "unsub.kline", param: { symbol: options.symbol, interval: MEXC_INTERVALS[options.timeframe].api } })); old.send(JSON.stringify({ method: "unsub.deal", param: { symbol: options.symbol } })); if (options.orderFlowEnabled) old.send(JSON.stringify({ method: "unsub.depth", param: { symbol: options.symbol } })); } old.close(); } };
    const reconnect = () => { if (!valid() || reconnectTimer) return; close(); callbacks.current.onStatus(attempt ? "reconnecting" : "delayed"); const base = Math.min(30_000, 1_000 * 2 ** Math.min(attempt++, 5)); reconnectTimer = window.setTimeout(() => { reconnectTimer = undefined; connect(); }, base * (0.8 + Math.random() * 0.4)); };
    const connect = () => {
      if (!valid() || socket) return;
      callbacks.current.onStatus(attempt ? "reconnecting" : "connecting");
      const current = new WebSocket("wss://contract.mexc.com/edge"); socket = current;
      current.onopen = () => { if (!valid() || socket !== current) return current.close(); lastActivity = Date.now(); current.send(JSON.stringify({ method: "sub.kline", param: { symbol: options.symbol, interval: MEXC_INTERVALS[options.timeframe].api }, gzip: false })); current.send(JSON.stringify({ method: "sub.deal", param: { symbol: options.symbol }, gzip: false })); if (options.orderFlowEnabled) current.send(JSON.stringify({ method: "sub.depth", param: { symbol: options.symbol }, gzip: false })); if (attempt) callbacks.current.onResync(); attempt = 0; heartbeat = window.setInterval(() => current.readyState === WebSocket.OPEN && current.send(JSON.stringify({ method: "ping" })), 15_000); staleTimer = window.setInterval(() => Date.now() - lastActivity > 45_000 && reconnect(), 5_000); };
      current.onmessage = async (event) => { if (!valid() || socket !== current) return; const message=await decodeMexcMessage(event.data);if(!message||!valid()||socket!==current)return; const envelope = message && typeof message === "object" ? message as Record<string, unknown> : {}; if (envelope.channel === "pong" || envelope.method === "pong" || envelope.data === "pong") { lastActivity = Date.now(); callbacks.current.onStatus("live"); } const serverTs = Number(envelope.ts); if (Number.isFinite(serverTs) && serverTs > 0) callbacks.current.onClockOffset(clock.current.add(serverTs < 1e12 ? serverTs * 1000 : serverTs, Date.now())); const kline = parseMexcKline(message, options.symbol, options.timeframe); if (kline) { lastActivity = Date.now(); callbacks.current.onStatus("live"); callbacks.current.onKline(kline); } const deals = parseMexcDeals(message, options.symbol, options.contractSize); if (deals.length) { lastActivity = Date.now(); callbacks.current.onStatus("live"); deals.forEach(callbacks.current.onDeal); } if(options.orderFlowEnabled){const depth=parseDepthMessage(message,options.symbol);if(depth){lastActivity=Date.now();callbacks.current.onDepth?.(depth);}} };
      current.onerror = reconnect; current.onclose = reconnect;
    };
    const visibility = () => { if (document.visibilityState === "visible") { callbacks.current.onResync(); if (!socket || socket.readyState > WebSocket.OPEN) reconnect(); } };
    const online = () => reconnect(); const offline = () => { callbacks.current.onStatus("offline"); close(); };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("online", online); window.addEventListener("offline", offline); connect();
    return () => { stopped = true; if (reconnectTimer) clearTimeout(reconnectTimer); close(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
    // Socket lifecycle deliberately changes only for these identity/enabled fields;
    // current callbacks are delivered through callbacks.current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.enabled, options.symbol, options.timeframe, options.orderFlowEnabled]);
}
