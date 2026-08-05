"use client";

import { useEffect, useRef } from "react";
import type { DizyBrainWorkspaceData } from "./dizybrain-shell";
import { createDizyQuantLiveSnapshot, writeDizyQuantLiveSnapshot } from "./lib/dizyquant/live-snapshot";

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
  return null;
}
