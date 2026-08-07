"use client";

import { useEffect, useRef } from "react";
import type { DizyBrainWorkspaceData } from "./dizybrain-shell";
import { createDizyQuantLiveSnapshot, writeDizyQuantLiveSnapshot } from "./lib/dizyquant/live-snapshot";
import {
  clearDizyQuantCampaignDepthPublication,
  isDizyQuantRuntimeCampaignSymbol,
  publishDizyQuantCampaignDepthPublication,
} from "./lib/dizyquant/campaign-runtime-feed";

export function DizyQuantSnapshotPublisher({ data }: { data: DizyBrainWorkspaceData }) {
  const lastSignature = useRef("");
  useEffect(() => {
    const signature = JSON.stringify([
      data.snapshot,
      data.liveFlow?.inputHash ?? null,
      data.liveFlow?.receivedTimeMs ?? null,
      data.symbol,
      data.market,
      data.timeframe,
      data.feedState,
      data.replay,
      data.flowEnabled,
    ]);
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    writeDizyQuantLiveSnapshot(createDizyQuantLiveSnapshot({
      snapshot: data.snapshot,
      liveFlow: data.liveFlow,
      symbol: data.symbol,
      market: data.market,
      timeframe: data.timeframe,
      feedState: data.feedState,
      replay: data.replay,
      flowEnabled: data.flowEnabled,
    }));
  }, [data]);

  useEffect(() => {
    const symbol = data.symbol.trim().toUpperCase();
    if (
      data.viewer ||
      data.replay ||
      !data.flowEnabled ||
      !isDizyQuantRuntimeCampaignSymbol(symbol)
    ) {
      clearDizyQuantCampaignDepthPublication(symbol);
      return;
    }
    let source: EventSource | null = new EventSource(
      `/api/dizyquant/evidence/stream?symbol=${encodeURIComponent(symbol)}`,
    );
    const onEvidence = (event: Event) => {
      try {
        publishDizyQuantCampaignDepthPublication(
          JSON.parse((event as MessageEvent).data),
        );
      } catch {}
    };
    const onResync = () => clearDizyQuantCampaignDepthPublication(symbol);
    source.addEventListener("evidence", onEvidence);
    source.addEventListener("resync", onResync);
    return () => {
      source?.removeEventListener("evidence", onEvidence);
      source?.removeEventListener("resync", onResync);
      source?.close();
      source = null;
      clearDizyQuantCampaignDepthPublication(symbol);
    };
  }, [data.flowEnabled, data.replay, data.symbol, data.viewer]);

  return null;
}
