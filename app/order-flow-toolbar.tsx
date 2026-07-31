"use client";

import { useState, useSyncExternalStore } from "react";

import type { OrderFlowSettings } from "./lib/order-flow/settings";
import type { FlowRenderStore } from "./lib/order-flow/render-store";
import type { FlowSummary } from "./lib/order-flow/use-order-flow";

const clock = (value: number | null) =>
  value ? `${new Date(value).toISOString().slice(11, 19)} UTC` : "—";

const money = (value: number) =>
  `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const duration = (start: number | null) =>
  start ? `${Math.floor((Date.now() - start) / 60_000)}m capture` : "not capturing";

const coverage = (summary: FlowSummary, target: number) => {
  const milliseconds =
    summary.archiveStartMs && summary.archiveEndMs
      ? summary.archiveEndMs - summary.archiveStartMs
      : 0;
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const label =
    minutes >= 60
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;

  return `Liquidity history: ${label} captured · ${
    summary.historyGaps
      ? "gaps present"
      : minutes < target
        ? `building to ${Math.floor(target / 60)}h`
        : "retention ready"
  }`;
};

export function OrderFlowToolbar({
  settings,
  onChange,
  summary,
  onHistory,
  onRetry,
  renderStore,
}: {
  settings: OrderFlowSettings;
  onChange: (settings: OrderFlowSettings) => void;
  summary: FlowSummary;
  onHistory: () => void;
  onRetry: () => void;
  renderStore: FlowRenderStore;
}) {
  const [diagnostics, setDiagnostics] = useState(false);
  const renderer = useSyncExternalStore(
    renderStore.subscribeDiagnostics,
    renderStore.getDiagnostics,
    renderStore.getDiagnostics,
  );
  const toggle = (
    key:
      | "enabled"
      | "heatmapVisible"
      | "bubblesVisible"
      | "domVisible"
      | "alertsVisible"
      | "imbalanceVisible",
  ) => onChange({ ...settings, [key]: !settings[key] });

  const heatmapStatus = renderer.lastRendererError
    ? `renderer error: ${renderer.lastRendererError}`
    : renderer.failure ?? "OK";

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

      <div
        aria-label="DizyFlow components"
        className="flow-component-toggles"
        role="group"
      >
        {[
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
        <button
          aria-expanded={diagnostics}
          onClick={() => setDiagnostics((value) => !value)}
        >
          Diagnostics
        </button>
      </div>

      {settings.enabled && settings.heatmapVisible ? (
        <small>{coverage(summary, settings.heatmap.historyMinutes)}</small>
      ) : null}

      {settings.enabled && settings.heatmapVisible ? (
        <small data-testid="heatmap-render-pipeline">
          Heatmap render: {renderer.heatmapObservationsRetained} tiles →{" "}
          {renderer.heatmapCandidateCells} candidates →{" "}
          {renderer.heatmapProjectedCells} projected →{" "}
          {renderer.heatmapCellsDrawn} drawn · {heatmapStatus}
        </small>
      ) : null}

      <small>
        {settings.imbalanceVisible && summary.imbalance !== null
          ? `${summary.imbalance > 0 ? "+" : ""}${summary.imbalance.toFixed(0)}% · `
          : ""}
        {money(summary.spread)} spread · {duration(summary.captureStarted)}
      </small>

      {diagnostics ? (
        <div className="flow-diagnostics">
          <span>
            Depth transport <b>{summary.wsState}</b>
          </span>
          <span>
            Symbol <b>{summary.activeSymbol}</b>
          </span>
          <span>
            Server snapshot / local{" "}
            <b>
              {summary.snapshotVersion} / {summary.version}
            </b>
          </span>
          <span>
            Buffered <b>{summary.bufferedUpdates}</b>
          </span>
          <span>
            Snapshot bids / asks{" "}
            <b>
              {summary.snapshotBids} / {summary.snapshotAsks}
            </b>
          </span>
          <span>
            Book bids / asks{" "}
            <b>
              {summary.bookBids} / {summary.bookAsks}
            </b>
          </span>
          <span>
            Heatmap retained / visible{" "}
            <b>
              {summary.heatmapCellsRetained} / {summary.heatmapCellsVisible}
            </b>
          </span>
          <span>
            Depth received / applied / gaps{" "}
            <b>
              {summary.depthMessagesReceived} / {summary.depthMessagesApplied} /{" "}
              {summary.versionGaps}
            </b>
          </span>
          <span>
            Last recovery error <b>{summary.lastRecoveryError ?? "none"}</b>
          </span>
          <span>
            Last snapshot <b>{clock(summary.lastValidUpdate)}</b>
            <br />
            <span>
              Snapshot age{" "}
              <b>
                {summary.lastValidUpdate
                  ? `${(summary.latencyMs / 1000).toFixed(1)}s`
                  : "—"}
              </b>
            </span>
          </span>
          <span>
            Last deal <b>{clock(summary.lastTradeEvent)}</b>
          </span>
          <span>
            Recovery attempts <b>{summary.recoveryAttempts}</b>
          </span>
          <button type="button" onClick={onRetry}>
            Retry feed
          </button>
          <span>
            Gap <b>{summary.currentGap ?? "none"}</b>
          </span>
          <span>
            REST / WS / duplicates{" "}
            <b>
              {summary.restTradesLoaded} / {summary.dealsReceived} /{" "}
              {summary.duplicatesRejected}
            </b>
          </span>
          <span>
            Accepted / rejected / below threshold{" "}
            <b>
              {summary.dealsAccepted} / {summary.rejectedTimestamps} /{" "}
              {summary.belowThresholdDeals}
            </b>
          </span>
          {summary.lastUpstreamError ? (
            <span className="negative">
              Upstream <b>{summary.lastUpstreamError}</b>
            </span>
          ) : null}
          <span>
            Primitive / enabled{" "}
            <b>
              {String(renderer.primitiveAttached)} / {String(renderer.renderEnabled)}
            </b>
          </span>
          <span>
            Heatmap / bubbles visible{" "}
            <b>
              {String(renderer.heatmapVisible)} / {String(renderer.bubblesVisible)}
            </b>
          </span>
          <span>
            Paint calls / candles{" "}
            <b>
              {renderer.paintCallCount} / {renderer.candleCount}
            </b>
          </span>
          <span>
            Logical range{" "}
            <b>
              {renderer.visibleLogicalRange
                ? `${renderer.visibleLogicalRange.from.toFixed(1)}–${renderer.visibleLogicalRange.to.toFixed(1)}`
                : "—"}
            </b>
          </span>
          <span>
            Tile cells / visible / projected / drawn{" "}
            <b>
              {renderer.heatmapObservationsRetained} /{" "}
              {renderer.heatmapCandidateCells} / {renderer.heatmapProjectedCells} /{" "}
              {renderer.heatmapCellsDrawn}
            </b>
          </span>
          <span>
            Trades / groups / drawn{" "}
            <b>
              {renderer.rawTradesRetained} / {renderer.bubbleGroupsProduced} /{" "}
              {renderer.bubblesDrawn}
            </b>
          </span>
          <span>
            Bubble rejects threshold / time / price{" "}
            <b>
              {renderer.bubblesRejectedBelowThreshold} /{" "}
              {renderer.bubblesRejectedByTimeProjection} /{" "}
              {renderer.bubblesRejectedByPriceProjection}
            </b>
          </span>
          <span>
            Captured archive{" "}
            <b>
              {renderer.archiveHistoryRange
                ? `${clock(renderer.archiveHistoryRange.from)}–${clock(renderer.archiveHistoryRange.to)}`
                : "—"}
            </b>
          </span>
          <span>
            Loaded tile coverage{" "}
            <b>
              {renderer.loadedHistoryRange
                ? `${clock(renderer.loadedHistoryRange.from)}–${clock(renderer.loadedHistoryRange.to)}`
                : "—"}
            </b>
          </span>
          <span>
            Raw history pages / tile cells{" "}
            <b>
              {renderer.cachedHistoryPages} / {renderer.browserCacheRecords}
            </b>
          </span>
          <span>
            Tile requests started / completed / aborted / failed{" "}
            <b>
              {renderer.tileRequestsStarted} / {renderer.tileRequestsCompleted} /{" "}
              {renderer.tileRequestsAborted} / {renderer.tileRequestsFailed}
            </b>
          </span>
          <span>
            Tile cache hits / misses{" "}
            <b>
              {renderer.tileCacheHits} / {renderer.tileCacheMisses}
            </b>
          </span>
          <span>
            Last requested tile range{" "}
            <b>
              {renderer.lastRequestedTileRange
                ? `${clock(renderer.lastRequestedTileRange.from)}–${clock(renderer.lastRequestedTileRange.to)}`
                : "—"}
            </b>
          </span>
          <span>
            Last successful tile range{" "}
            <b>
              {renderer.lastSuccessfulTileRange
                ? `${clock(renderer.lastSuccessfulTileRange.from)}–${clock(renderer.lastSuccessfulTileRange.to)}`
                : "—"}
            </b>
          </span>
          <span>
            Last tile HTTP / error{" "}
            <b>
              {renderer.lastTileHttpStatus ?? "—"} /{" "}
              {renderer.lastTileError ?? "none"}
            </b>
          </span>
          <span>
            Live sequence / state{" "}
            <b>
              {renderer.liveSequence ?? "—"} / {renderer.liveState}
            </b>
          </span>
          <span>
            Effective tile time / price bins{" "}
            <b>
              {renderer.effectiveTimeSliceMs / 1000}s /{" "}
              {renderer.effectiveHeatmapBinSize}
            </b>
          </span>
          <span>
            Visible cells <b>{renderer.heatmapCellsDrawn}</b>
          </span>
          <span>
            Retained rebuild / patch / reuse{" "}
            <b>
              {renderer.retainedFullRebuilds} /{" "}
              {renderer.retainedIncrementalPatches} /{" "}
              {renderer.retainedSurfaceReuses}
            </b>
          </span>
          <span>
            Price step <b>{renderer.currentPriceStep}</b>
          </span>
          <span>
            Drawing status <b>{renderer.failure ?? "OK"}</b>
          </span>
          <span>
            Renderer error <b>{renderer.lastRendererError ?? "none"}</b>
          </span>
        </div>
      ) : null}
    </div>
  );
}
