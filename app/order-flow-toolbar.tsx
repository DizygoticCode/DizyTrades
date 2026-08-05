"use client";

import { useEffect, useSyncExternalStore } from "react";

import { formatOrderImbalance } from "./lib/order-flow/imbalance";
import type { OrderFlowSettings } from "./lib/order-flow/settings";
import type { FlowRenderStore } from "./lib/order-flow/render-store";
import type { FlowSummary } from "./lib/order-flow/use-order-flow";
import type { DizyFlowIntelligenceSnapshot } from "./lib/order-flow/intelligence";
import { useDizyBrainWorkspace } from "./dizybrain-shell";

export function OrderFlowToolbar({
  settings,
  onChange,
  summary,
  onHistory,
  onRetry,
  renderStore,
  intelligence,
}: {
  settings: OrderFlowSettings;
  onChange: (settings: OrderFlowSettings) => void;
  summary: FlowSummary;
  onHistory: () => void;
  onRetry: () => void;
  renderStore: FlowRenderStore;
  intelligence: DizyFlowIntelligenceSnapshot | null;
}) {
  const { open, publishFlowDiagnostics } = useDizyBrainWorkspace();
  const renderer = useSyncExternalStore(
    renderStore.subscribeDiagnostics,
    renderStore.getDiagnostics,
    renderStore.getDiagnostics,
  );
  const toggle = (
    key:
      | "enabled"
      | "marketDepthVisible"
      | "heatmapVisible"
      | "bubblesVisible"
      | "domVisible"
      | "alertsVisible"
      | "imbalanceVisible",
  ) => onChange({ ...settings, [key]: !settings[key] });
  const imbalance=settings.enabled?summary.imbalance:null,imbalanceLabel=formatOrderImbalance(imbalance),imbalanceColour=imbalance===null?"#81899c":imbalance>=0?"#66e0b2":"#ff7186";

  useEffect(() => publishFlowDiagnostics({ summary, renderer, marketDepthVisible: settings.enabled && settings.marketDepthVisible, displayMode: settings.marketDepth.displayMode, retry: onRetry }), [publishFlowDiagnostics, summary, renderer, settings.enabled, settings.marketDepthVisible, settings.marketDepth.displayMode, onRetry]);

  return (
    <div className="dizyflow-controls">
      <button
        aria-pressed={settings.enabled}
        className={`dizyflow-master ${settings.enabled ? "active" : ""}`}
        onClick={() => toggle("enabled")}
        title="Toggle DizyFlow public-data subscription"
      >
        <b>DIZYFLOW</b>
        <span>{settings.enabled ? summary.status : "Off"}</span>
      </button>
      <button
        className="dizyflow-brain-open"
        type="button"
        onClick={event => open("flow", event.currentTarget)}
        aria-label={`Open DizyFlow Intelligence in DizyBrain${intelligence ? `, ${intelligence.intelligenceConfidence}% evidence confidence` : ""}, 25-level order imbalance ${imbalanceLabel}`}
        style={{gridTemplateColumns:"auto auto auto"}}
      >
        <span>{settings.enabled ? summary.status : "OFF"}</span>
        <b>{intelligence ? `${intelligence.intelligenceConfidence}%` : "—"}</b>
        <em className="dizyflow-imbalance-ticker" title="25-level order imbalance. Positive means displayed bid notional outweighs displayed ask notional." style={{color:imbalanceColour,fontSize:8,fontStyle:"normal",fontVariantNumeric:"tabular-nums",fontWeight:750}}>IMB {imbalanceLabel}</em>
        <small>Open</small>
      </button>

      <div
        aria-label="DizyFlow components"
        className="flow-component-toggles"
        role="group"
      >
        {[
          ["marketDepthVisible", "Market Depth"],
          ["heatmapVisible", "Heatmap"],
          ["bubblesVisible", "Bubbles"],
          ["domVisible", "DOM"],
          ["alertsVisible", "Alerts"],
          ["imbalanceVisible", "Imbalance"],
        ].map(([key, label]) => (
          <button
            aria-pressed={settings[key as keyof OrderFlowSettings] as boolean}
            key={key}
            onClick={() => toggle(key as "heatmapVisible")}
            title={`${label}: show or hide without discarding captured data`}
          >
            {label}
          </button>
        ))}
        <button className="flow-history-button" onClick={onHistory} title="Open bounded alert history">
          History
        </button>
      </div>
    </div>
  );
}
