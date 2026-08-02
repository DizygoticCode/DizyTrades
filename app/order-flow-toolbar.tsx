"use client";

import { useEffect, useSyncExternalStore } from "react";

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
  renderStore,
  intelligence,
}: {
  settings: OrderFlowSettings;
  onChange: (settings: OrderFlowSettings) => void;
  summary: FlowSummary;
  onHistory: () => void;
  renderStore: FlowRenderStore;
  intelligence: DizyFlowIntelligenceSnapshot | null;
}) {
  const { open, publishDepth } = useDizyBrainWorkspace();
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

  useEffect(() => publishDepth({ visible: settings.enabled && settings.marketDepthVisible, bidTotal: renderer.marketDepthBidTotal, askTotal: renderer.marketDepthAskTotal, clusters: renderer.marketDepthClusters, scaling: settings.marketDepth.scaling, displayMode: settings.marketDepth.displayMode }), [publishDepth, renderer, settings.enabled, settings.marketDepthVisible, settings.marketDepth.scaling, settings.marketDepth.displayMode]);

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
        aria-label={`Open DizyFlow Intelligence in DizyBrain${intelligence ? `, ${intelligence.intelligenceConfidence}% evidence confidence` : ""}`}
      >
        <span>{settings.enabled ? summary.status : "OFF"}</span>
        <b>{intelligence ? `${intelligence.intelligenceConfidence}%` : "—"}</b>
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
