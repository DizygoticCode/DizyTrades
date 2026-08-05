"use client";

import { useEffect, useSyncExternalStore } from "react";

import { useDizyBrainWorkspace } from "./dizybrain-shell";
import { formatOrderImbalance } from "./lib/order-flow/imbalance";
import type { DizyFlowIntelligenceSnapshot } from "./lib/order-flow/intelligence";
import { flowPresentation } from "./lib/order-flow/presentation";
import type { FlowRenderStore } from "./lib/order-flow/render-store";
import type { OrderFlowSettings } from "./lib/order-flow/settings";
import type { FlowSummary } from "./lib/order-flow/use-order-flow";

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
  const imbalance = settings.enabled ? summary.imbalance : null;
  const imbalanceLabel = formatOrderImbalance(imbalance);
  const imbalanceColour =
    imbalance === null ? "#81899c" : imbalance >= 0 ? "#66e0b2" : "#ff7186";
  const presentation = flowPresentation({
    enabled: settings.enabled,
    status: summary.status,
    confidence: intelligence?.intelligenceConfidence ?? null,
    hasValidBook: summary.levels > 0,
    lastValidUpdate: summary.lastValidUpdate,
  });

  useEffect(
    () =>
      publishFlowDiagnostics({
        summary,
        renderer,
        marketDepthVisible: settings.enabled && settings.marketDepthVisible,
        displayMode: settings.marketDepth.displayMode,
        retry: onRetry,
      }),
    [
      publishFlowDiagnostics,
      summary,
      renderer,
      settings.enabled,
      settings.marketDepthVisible,
      settings.marketDepth.displayMode,
      onRetry,
    ],
  );

  return (
    <div
      className={`dizyflow-controls ${presentation.recovering ? "recovering" : ""}`}
      data-flow-bubbles-drawn={renderer.bubblesDrawn}
      data-flow-effective-time-slice-ms={renderer.effectiveTimeSliceMs}
      data-flow-heatmap-cells-drawn={renderer.heatmapCellsDrawn}
      data-flow-heatmap-segments-drawn={renderer.heatmapSegmentsDrawn}
      data-flow-paint-call-count={renderer.paintCallCount}
      data-flow-presentation={presentation.statusLabel.toLowerCase()}
      data-flow-primitive-attached={String(renderer.primitiveAttached)}
      data-flow-render-bubbles-visible={String(renderer.bubblesVisible)}
      data-flow-render-enabled={String(renderer.renderEnabled)}
      data-flow-render-heatmap-visible={String(renderer.heatmapVisible)}
    >
      <button
        aria-pressed={settings.enabled}
        className={`dizyflow-master ${settings.enabled ? "active" : ""}`}
        onClick={() => toggle("enabled")}
        title={
          presentation.recovering
            ? "DizyFlow is retaining the last valid book while the public depth transport resynchronises"
            : "Toggle DizyFlow public-data subscription"
        }
      >
        <b>DIZYFLOW</b>
        <span>{presentation.statusLabel}</span>
      </button>
      <button
        className="dizyflow-brain-open"
        type="button"
        onClick={(event) => open("flow", event.currentTarget)}
        aria-label={`Open DizyFlow Intelligence in DizyBrain, ${presentation.statusLabel}, ${presentation.metricLabel}${intelligence ? ` evidence confidence ${intelligence.intelligenceConfidence}%` : ""}, 25-level order imbalance ${imbalanceLabel}`}
        style={{ gridTemplateColumns: "auto auto auto" }}
      >
        <span>{presentation.statusLabel.toUpperCase()}</span>
        <b>{presentation.metricLabel}</b>
        <em
          className="dizyflow-imbalance-ticker"
          title="25-level order imbalance. Positive means displayed bid notional outweighs displayed ask notional."
          style={{
            color: imbalanceColour,
            fontSize: 8,
            fontStyle: "normal",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 750,
          }}
        >
          IMB {imbalanceLabel}
        </em>
        <small>{presentation.recovering ? "Resync" : "Open"}</small>
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
        <button
          className="flow-history-button"
          onClick={onHistory}
          title="Open bounded alert history"
        >
          History
        </button>
      </div>
    </div>
  );
}
