import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";

import type { Candle } from "../strategy.ts";
import {
  aggregateTrades,
  bubbleComposition,
  bubbleRadius,
  bubbleThreshold,
} from "../order-flow/aggregator.ts";
import {
  bookmapHeatmapCellRect,
  DEFAULT_HEATMAP_DISPLAY_TUNING,
  effectiveHeatmapPriceStep,
  heatmapColour,
  HEATMAP_DISPLAY_EVENT,
  readHeatmapDisplayTuning,
  type HeatmapDisplayTuning,
} from "../order-flow/heatmap.ts";
import { createMarketDepthModel, type MarketDepthModel } from "../order-flow/market-depth.ts";
import { percentile } from "../order-flow/normalisation.ts";
import type { FlowRenderDiagnostics, FlowRenderStore } from "../order-flow/render-store.ts";
import { candleCloseMs, timestampToLogicalPosition } from "../order-flow/time-projection.ts";
import type { CandleTimeframe } from "../market/types.ts";

type Attached = SeriesAttachedParameter<Time, "Candlestick">;
type FlowLayer = "background" | "foreground";
type PaneZOrder = "bottom" | "top";

const blendHex = (from: string, to: string, ratio: number) => {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const mix = (shift: number) =>
    Math.round(((a >> shift) & 255) * (1 - ratio) + ((b >> shift) & 255) * ratio);
  return `rgb(${mix(16)},${mix(8)},${mix(0)})`;
};

const rgba = (colour: string, alpha: number) =>
  colour.replace("rgb", "rgba").replace(")", `,${alpha})`);

class FlowRenderer implements IPrimitivePaneRenderer {
  constructor(
    private owner: DizyFlowPrimitive,
    private layer: FlowLayer,
  ) {}

  draw(target: CanvasRenderingTarget2D) {
    // Lightweight Charts projections are CSS/media pixels, so every primitive
    // dimension is painted in media space.
    target.useMediaCoordinateSpace(({ context, mediaSize }) =>
      this.owner.paintLayer(this.layer, context, mediaSize.width, mediaSize.height),
    );
  }
}

class FlowPaneView implements IPrimitivePaneView {
  private painter: FlowRenderer;

  constructor(
    owner: DizyFlowPrimitive,
    layer: FlowLayer,
    private order: PaneZOrder,
  ) {
    this.painter = new FlowRenderer(owner, layer);
  }

  zOrder() {
    return this.order;
  }

  renderer() {
    return this.painter;
  }
}

/**
 * Retained liquidity and current market-depth bars are painted on the bottom
 * pane, while executed-trade bubbles are painted on the top pane. All inputs
 * remain in exchange time/price coordinates until the active viewport paints.
 */
export class DizyFlowPrimitive implements ISeriesPrimitive<Time> {
  private attachedApi: Attached | null = null;
  private unsubscribe: (() => void) | null = null;
  private heatmapTuningListener: (() => void) | null = null;
  private heatmapTuning: HeatmapDisplayTuning = DEFAULT_HEATMAP_DISPLAY_TUNING;
  private candles: readonly Candle[] = [];
  private timeframe: CandleTimeframe = "15m";
  private projectionGeneration = 0;

  private heatSurface: HTMLCanvasElement | null = null;
  private heatSignature = "";
  private heatStaticSignature = "";
  private fullRebuilds = 0;
  private incrementalPatches = 0;
  private surfaceReuses = 0;
  private retainedMetrics: Partial<FlowRenderDiagnostics> = {};

  private depthModel: MarketDepthModel | null = null;
  private depthWidths = new Map<string, number>();
  private depthGeneration = "";
  private depthVersion = -1;
  private depthPaintAt = 0;
  private depthPaintCalls = 0;
  private depthSkipped = 0;

  private views: readonly IPrimitivePaneView[] = [
    new FlowPaneView(this, "background", "bottom"),
    new FlowPaneView(this, "foreground", "top"),
  ];

  constructor(private store: FlowRenderStore) {}

  attached(param: Attached) {
    this.attachedApi = param;
    this.unsubscribe = this.store.subscribe(param.requestUpdate);
    if (typeof window !== "undefined") {
      this.heatmapTuning = readHeatmapDisplayTuning();
      this.heatmapTuningListener = () => {
        this.heatmapTuning = readHeatmapDisplayTuning();
        this.heatSignature = "";
        param.requestUpdate();
      };
      window.addEventListener(HEATMAP_DISPLAY_EVENT, this.heatmapTuningListener);
    }
    this.store.updateDiagnostics({ primitiveAttached: true });
    param.requestUpdate();
  }

  detached() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (typeof window !== "undefined" && this.heatmapTuningListener)
      window.removeEventListener(HEATMAP_DISPLAY_EVENT, this.heatmapTuningListener);
    this.heatmapTuningListener = null;
    this.attachedApi = null;
    this.store.updateDiagnostics({ primitiveAttached: false });
  }

  paneViews() {
    return this.views;
  }

  setProjection(
    candles: readonly Candle[],
    timeframe: CandleTimeframe,
    generation: number,
    series: { count: number; finalTime: number | null; generation: number },
  ) {
    const finalTime = candles.at(-1)?.time ?? null;
    if (
      generation !== series.generation ||
      candles.length !== series.count ||
      finalTime !== series.finalTime ||
      generation < this.projectionGeneration
    )
      return false;
    this.candles = candles;
    this.timeframe = timeframe;
    this.projectionGeneration = generation;
    this.store.updateDiagnostics({ candleCount: candles.length });
    this.attachedApi?.requestUpdate();
    return true;
  }

  paintLayer(
    layer: FlowLayer,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) {
    const api = this.attachedApi;
    const snapshot = this.store.getSnapshot();
    const settings = snapshot.settings;
    const tuning = this.heatmapTuning;

    const prices = snapshot.heatmapTiles.map((value) => value.price);
    const heatTimes = snapshot.heatmapTiles.flatMap((value) => [value.fromMs, value.toMs]);
    const tradeTimes = snapshot.trades.map((value) => value.timestampMs);
    const base: Partial<FlowRenderDiagnostics> = {
      renderEnabled: snapshot.enabled,
      heatmapVisible: settings.heatmapVisible,
      bubblesVisible: settings.bubblesVisible,
      candleCount: this.candles.length,
      heatmapObservationsRetained: snapshot.heatmapTiles.length,
      rawTradesRetained: snapshot.trades.length,
      currentPriceStep: snapshot.priceStep,
      capturedDepthPriceRange: prices.length
        ? { min: Math.min(...prices), max: Math.max(...prices) }
        : null,
      firstHeatmapTimestamp: heatTimes.length ? Math.min(...heatTimes) : null,
      lastHeatmapTimestamp: heatTimes.length ? Math.max(...heatTimes) : null,
      firstTradeTimestamp: tradeTimes.length ? Math.min(...tradeTimes) : null,
      lastTradeTimestamp: tradeTimes.length ? Math.max(...tradeTimes) : null,
      lastRendererError: null,
    };

    try {
      if (!api || !snapshot.enabled || !this.candles.length) {
        if (layer === "background")
          this.store.updateDiagnostics({
            ...base,
            failure: !api
              ? "primitive detached"
              : !snapshot.enabled
                ? "render disabled"
                : "no candles",
          });
        return;
      }

      const range = api.chart.timeScale().getVisibleLogicalRange();
      if (!range) {
        if (layer === "background")
          this.store.updateDiagnostics({ ...base, failure: "visible logical range unavailable" });
        return;
      }

      const topPrice = api.series.coordinateToPrice(0);
      const bottomPrice = api.series.coordinateToPrice(height);
      const visiblePrices =
        topPrice !== null && bottomPrice !== null
          ? { min: Math.min(topPrice, bottomPrice), max: Math.max(topPrice, bottomPrice) }
          : null;
      const pricePerPixel = visiblePrices
        ? (visiblePrices.max - visiblePrices.min) / Math.max(1, height)
        : snapshot.priceStep;
      const displayStep =
        tuning.priceGrouping === "manual"
          ? tuning.manualPriceStep
          : tuning.priceGrouping === "exchange"
            ? snapshot.priceStep
            : effectiveHeatmapPriceStep(
                pricePerPixel,
                snapshot.priceStep,
                tuning.minimumPricePixels,
              );

      const from = Math.max(0, Math.floor(range.from) - 1);
      const to = Math.min(this.candles.length - 1, Math.ceil(range.to) + 1);
      const start = (this.candles[from]?.time ?? 0) * 1000;
      const atLiveEdge = range.to >= this.candles.length - 0.5;
      const end = atLiveEdge
        ? Math.max(
            candleCloseMs(this.candles[to]?.time ?? 0, this.timeframe),
            snapshot.captureEnded ?? 0,
          )
        : candleCloseMs(this.candles[to]?.time ?? 0, this.timeframe);
      const automaticTimeSlice = Math.max(
        5_000,
        Math.ceil((end - start) / Math.max(1, width) / 5_000) * 5_000,
      );
      const effectiveTimeSlice = tuning.timeSliceMs || automaticTimeSlice;

      const projectX = (timestampMs: number) => {
        const logical = timestampToLogicalPosition(this.candles, timestampMs, this.timeframe);
        if (logical === null || logical < range.from - 1 || logical > range.to + 1) return null;
        const span = Number(range.to) - Number(range.from);
        return span > 0 ? ((logical - Number(range.from)) / span) * width : null;
      };

      if (layer === "foreground") {
        this.paintBubbles(context, width, height, {
          api,
          snapshot,
          start,
          end,
          projectX,
        });
        return;
      }

      if (visiblePrices)
        this.store.requestHistory({
          from: start,
          to: end,
          minPrice: visiblePrices.min,
          maxPrice: visiblePrices.max,
          effectiveTimeBucketMs: effectiveTimeSlice,
          effectivePriceStep: displayStep,
        });

      const rowY1 = api.series.priceToCoordinate(64_000);
      const rowY2 = api.series.priceToCoordinate(64_000 + displayStep);
      const rowHeight =
        rowY1 === null || rowY2 === null ? 0 : Math.abs(Number(rowY2) - Number(rowY1));

      const diagnostics: Partial<FlowRenderDiagnostics> = {
        ...base,
        paintCallCount: this.store.getDiagnostics().paintCallCount + 1,
        visibleLogicalRange: { from: Number(range.from), to: Number(range.to) },
        visibleChartPriceRange: visiblePrices,
        exchangeTickSize: snapshot.priceStep,
        effectiveHeatmapBinSize: displayStep,
        heatmapRowHeightPx: rowHeight,
        heatmapCandidateCells: 0,
        heatmapProjectedCells: 0,
        heatmapCellsDrawn: 0,
        heatmapMinimumCellWidthPx: 0,
        heatmapMinimumCellHeightPx: 0,
        heatmapMaximumCellWidthPx: 0,
        heatmapDrawnBounds: null,
        heatmapSegmentsRetained: 0,
        heatmapSegmentsProjected: 0,
        heatmapSegmentsDrawn: 0,
        failure: null,
      };

      context.save();
      try {
        context.beginPath();
        context.rect(0, 0, width, height);
        context.clip();

        this.paintHeatmap(context, width, height, {
          api,
          snapshot,
          settings,
          tuning,
          visiblePrices,
          range: { from: Number(range.from), to: Number(range.to) },
          start,
          end,
          displayStep,
          effectiveTimeSlice,
          projectX,
          diagnostics,
        });

        this.paintMarketDepth(context, width, height, {
          api,
          snapshot,
          visiblePrices,
          diagnostics,
        });
      } finally {
        context.restore();
      }

      diagnostics.retainedFullRebuilds = this.fullRebuilds;
      diagnostics.retainedIncrementalPatches = this.incrementalPatches;
      diagnostics.retainedSurfaceReuses = this.surfaceReuses;
      diagnostics.effectiveTimeSliceMs = effectiveTimeSlice;

      if (this.store.getDiagnostics().sourceFeedConnected === false)
        diagnostics.failure = "source feed disconnected";
      else if (
        !snapshot.heatmapTiles.length &&
        !snapshot.heatmap.length &&
        !snapshot.trades.length
      )
        diagnostics.failure = "no depth observations received; no trades received";
      else if (
        snapshot.heatmapTiles.length &&
        !(diagnostics.heatmapProjectedCells ?? 0)
      )
        diagnostics.failure = "observations retained but projection failed";

      this.store.updateDiagnostics(diagnostics);
    } catch (error) {
      this.store.updateDiagnostics({
        ...base,
        lastRendererError: error instanceof Error ? error.message : String(error),
        failure: `${layer} renderer error`,
      });
    }
  }

  private paintHeatmap(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    input: {
      api: Attached;
      snapshot: ReturnType<FlowRenderStore["getSnapshot"]>;
      settings: ReturnType<FlowRenderStore["getSnapshot"]>["settings"];
      tuning: HeatmapDisplayTuning;
      visiblePrices: { min: number; max: number } | null;
      range: { from: number; to: number };
      start: number;
      end: number;
      displayStep: number;
      effectiveTimeSlice: number;
      projectX: (timestampMs: number) => number | null;
      diagnostics: Partial<FlowRenderDiagnostics>;
    },
  ) {
    const {
      api,
      snapshot,
      settings,
      tuning,
      visiblePrices,
      range,
      start,
      end,
      displayStep,
      effectiveTimeSlice,
      projectX,
      diagnostics,
    } = input;

    const staticSignature = JSON.stringify([
      width,
      height,
      range.from.toFixed(3),
      range.to.toFixed(3),
      visiblePrices?.min.toPrecision(8),
      visiblePrices?.max.toPrecision(8),
      displayStep,
      effectiveTimeSlice,
      settings.heatmapVisible,
      settings.heatmap,
      tuning,
    ]);
    const heatSignature = `${staticSignature}:${snapshot.generation}:${snapshot.heatmapRevision}:${snapshot.heatmapTiles.length}:${snapshot.captureEnded}`;
    const canRetain = typeof document !== "undefined";

    if (
      canRetain &&
      (!this.heatSurface ||
        this.heatSurface.width !== Math.ceil(width) ||
        this.heatSurface.height !== Math.ceil(height))
    ) {
      this.heatSurface = document.createElement("canvas");
      this.heatSurface.width = Math.ceil(width);
      this.heatSurface.height = Math.ceil(height);
      this.heatSignature = "";
    }

    const rebuildHeatmap = !canRetain || heatSignature !== this.heatSignature;
    const liveOnly = this.heatStaticSignature === staticSignature && this.heatSignature !== "";
    const surfaceContext =
      rebuildHeatmap && this.heatSurface
        ? (this.heatSurface.getContext("2d") ?? context)
        : context;

    if (rebuildHeatmap && surfaceContext !== context)
      surfaceContext.clearRect(0, 0, width, height);

    if (settings.heatmapVisible && rebuildHeatmap) {
      const segments = snapshot.heatmapTiles.filter(
        (value) => value.toMs >= start && value.fromMs <= end,
      );
      const selectedQuantity = (bid: number, ask: number) =>
        settings.heatmap.side === "bids"
          ? bid
          : settings.heatmap.side === "asks"
            ? ask
            : bid + ask;
      const quantities = segments
        .map((value) => selectedQuantity(value.bidQuantity, value.askQuantity))
        .filter(
          (quantity, index) =>
            quantity > 0 && quantity * segments[index].price >= settings.heatmap.minimumNotional,
        );
      const lowClip = percentile(quantities, settings.heatmap.lowerPercentile) || 0;
      const highClip = percentile(quantities, settings.heatmap.upperPercentile) || 0;

      diagnostics.heatmapCandidateCells = segments.length;
      diagnostics.heatmapSegmentsRetained = segments.length;

      let minX = Infinity;
      let maxX = -Infinity;
      let minAlpha = Infinity;
      let minCellWidth = Infinity;
      let minCellHeight = Infinity;
      let maxCellWidth = 0;

      for (const segment of segments) {
        const quantity = selectedQuantity(segment.bidQuantity, segment.askQuantity);
        if (
          quantity <= 0 ||
          quantity * segment.price < settings.heatmap.minimumNotional
        )
          continue;

        const x1 = projectX(segment.fromMs);
        const x2 = projectX(segment.toMs - 1);
        const y1 = api.series.priceToCoordinate(segment.price);
        const y2 = api.series.priceToCoordinate(segment.price + displayStep);
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue;

        const rect = bookmapHeatmapCellRect(
          x1,
          x2,
          Number(y1),
          Number(y2),
          tuning.minimumTimePixels,
          tuning.minimumPricePixels,
        );
        if (!rect) continue;

        // A tiny overlap removes anti-aliased seams between consecutive retained
        // time slices without turning the display into coarse square blocks.
        const overlapX = Math.min(1.25, rect.width * 0.08);
        const overlapY = Math.min(0.75, rect.height * 0.06);
        const left = Math.max(0, rect.left - overlapX);
        const right = Math.min(width, rect.left + rect.width + overlapX);
        const top = Math.max(0, rect.top - overlapY);
        const bottom = Math.min(height, rect.top + rect.height + overlapY);
        const cellWidth = right - left;
        const cellHeight = bottom - top;
        if (cellWidth <= 0 || cellHeight <= 0) continue;

        diagnostics.heatmapProjectedCells = (diagnostics.heatmapProjectedCells ?? 0) + 1;
        diagnostics.heatmapSegmentsProjected =
          (diagnostics.heatmapSegmentsProjected ?? 0) + 1;

        let normal =
          highClip - lowClip <= Number.EPSILON
            ? 0.68
            : Math.max(0, Math.min(1, (quantity - lowClip) / (highClip - lowClip)));
        if (settings.heatmap.intensity === "log")
          normal = Math.log1p(normal * 9) / Math.log(10);
        normal = Math.max(
          0,
          Math.min(1, (normal - 0.5) * settings.heatmap.contrast + 0.5),
        );
        normal = Math.min(
          1,
          settings.heatmap.brightness *
            settings.heatmap.intensityMultiplier *
            Math.pow(normal, settings.heatmap.gamma),
        );

        const alpha = Math.min(
          1,
          settings.heatmap.opacity * (0.42 + normal * 0.58),
        );
        const colour = heatmapColour(Math.max(0.18, normal), tuning.palette);
        surfaceContext.fillStyle = rgba(colour, alpha);
        surfaceContext.fillRect(left, top, cellWidth, cellHeight);

        minAlpha = Math.min(minAlpha, alpha);
        minX = Math.min(minX, left);
        maxX = Math.max(maxX, right);
        minCellWidth = Math.min(minCellWidth, cellWidth);
        minCellHeight = Math.min(minCellHeight, cellHeight);
        maxCellWidth = Math.max(maxCellWidth, cellWidth);
        diagnostics.heatmapCellsDrawn = (diagnostics.heatmapCellsDrawn ?? 0) + 1;
        diagnostics.heatmapSegmentsDrawn =
          (diagnostics.heatmapSegmentsDrawn ?? 0) + 1;
      }

      if (Number.isFinite(minX)) diagnostics.heatmapDrawnBounds = { minX, maxX };
      diagnostics.heatmapMinimumCellWidthPx = Number.isFinite(minCellWidth)
        ? minCellWidth
        : 0;
      diagnostics.heatmapMinimumCellHeightPx = Number.isFinite(minCellHeight)
        ? minCellHeight
        : 0;
      diagnostics.heatmapMaximumCellWidthPx = maxCellWidth;
      if (segments.length && Number.isFinite(minAlpha) && minAlpha < 0.1)
        diagnostics.failure = "heatmap cells are below visible alpha";
    }

    if (rebuildHeatmap) {
      this.heatSignature = heatSignature;
      this.heatStaticSignature = staticSignature;
      if (liveOnly) this.incrementalPatches++;
      else this.fullRebuilds++;
      this.retainedMetrics = {
        heatmapCandidateCells: diagnostics.heatmapCandidateCells,
        heatmapProjectedCells: diagnostics.heatmapProjectedCells,
        heatmapCellsDrawn: diagnostics.heatmapCellsDrawn,
        heatmapMinimumCellWidthPx: diagnostics.heatmapMinimumCellWidthPx,
        heatmapMinimumCellHeightPx: diagnostics.heatmapMinimumCellHeightPx,
        heatmapMaximumCellWidthPx: diagnostics.heatmapMaximumCellWidthPx,
        heatmapSegmentsRetained: diagnostics.heatmapSegmentsRetained,
        heatmapSegmentsProjected: diagnostics.heatmapSegmentsProjected,
        heatmapSegmentsDrawn: diagnostics.heatmapSegmentsDrawn,
        heatmapDrawnBounds: diagnostics.heatmapDrawnBounds,
      };
    } else {
      this.surfaceReuses++;
      Object.assign(diagnostics, this.retainedMetrics);
    }

    if (settings.heatmapVisible && this.heatSurface)
      context.drawImage(this.heatSurface, 0, 0, width, height);
  }

  private paintMarketDepth(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    input: {
      api: Attached;
      snapshot: ReturnType<FlowRenderStore["getSnapshot"]>;
      visiblePrices: { min: number; max: number } | null;
      diagnostics: Partial<FlowRenderDiagnostics>;
    },
  ) {
    const { api, snapshot, visiblePrices, diagnostics } = input;
    const settings = snapshot.settings;
    if (!settings.marketDepthVisible || !snapshot.bookValid) return;

    const now = Date.now();
    const changed =
      snapshot.generation !== this.depthGeneration ||
      snapshot.book.version !== this.depthVersion;

    if (
      snapshot.generation !== this.depthGeneration ||
      snapshot.book.version < this.depthVersion
    ) {
      this.depthWidths.clear();
      this.depthModel = null;
      this.depthPaintAt = 0;
    }

    if (
      changed &&
      now - this.depthPaintAt >= settings.marketDepth.updateThrottleMs
    ) {
      this.depthModel = createMarketDepthModel(
        snapshot.book,
        {
          levels: settings.marketDepth.levels,
          scaling: settings.marketDepth.scaling,
          displayMode: settings.marketDepth.displayMode,
          clusterMultiple: settings.marketDepth.clusterMultiple,
          clusterMinimumSamples: settings.marketDepth.clusterMinimumSamples,
          highlightClusters: settings.marketDepth.highlightClusters,
        },
        visiblePrices,
      );
      this.depthGeneration = snapshot.generation;
      this.depthVersion = snapshot.book.version;
      this.depthPaintAt = now;
    } else if (changed) {
      this.depthSkipped++;
    }

    const model = this.depthModel;
    if (!model) return;

    const maxWidth = Math.min(
      settings.marketDepth.width,
      Math.max(60, width * 0.28),
    );
    const step = Math.max(1e-8, snapshot.priceStep);

    context.save();
    context.globalAlpha = settings.marketDepth.opacity;
    for (const bar of [...model.bids, ...model.asks]) {
      const y = api.series.priceToCoordinate(bar.price);
      const next = api.series.priceToCoordinate(bar.price + step);
      if (y === null) continue;

      const row = Math.max(
        2,
        Math.min(10, next === null ? 4 : Math.abs(Number(next) - Number(y))),
      );
      const key = `${bar.side}:${bar.price}`;
      const previous = this.depthWidths.get(key) ?? bar.scaledWidth;
      const target = bar.scaledWidth;
      const smoothed =
        previous + (target - previous) * (1 - settings.marketDepth.smoothing);
      this.depthWidths.set(key, smoothed);

      const barWidth = Math.max(bar.rawSize > 0 ? 1 : 0, smoothed * maxWidth);
      const left = width - barWidth;
      const top = Math.max(0, Math.min(height - row, Number(y) - row / 2));

      context.fillStyle =
        bar.side === "bid"
          ? settings.marketDepth.bidColour
          : settings.marketDepth.askColour;
      context.fillRect(left, top, barWidth, row);

      if (bar.best) {
        context.globalAlpha = Math.min(1, settings.marketDepth.opacity + 0.4);
        context.strokeStyle =
          bar.side === "bid"
            ? settings.marketDepth.bidColour
            : settings.marketDepth.askColour;
        context.strokeRect(left + 0.5, top + 0.5, Math.max(0, barWidth - 1), Math.max(0, row - 1));
        context.globalAlpha = settings.marketDepth.opacity;
      }

      if (bar.largeCluster) {
        context.globalAlpha = Math.min(1, settings.marketDepth.opacity + 0.5);
        context.fillStyle = "#f7b955";
        context.fillRect(Math.max(0, left - 3), top, 3, row);
        context.globalAlpha = settings.marketDepth.opacity;
      }
    }
    context.restore();

    this.depthPaintCalls++;
    diagnostics.marketDepthVisibleBids = model.bids.length;
    diagnostics.marketDepthVisibleAsks = model.asks.length;
    diagnostics.marketDepthBidTotal = model.imbalance.bidTotal;
    diagnostics.marketDepthAskTotal = model.imbalance.askTotal;
    diagnostics.marketDepthMaximumSize = model.maximumSize;
    diagnostics.marketDepthClusters = model.clusterCount;
    diagnostics.marketDepthPaintCalls = this.depthPaintCalls;
    diagnostics.marketDepthSkippedRedraws = this.depthSkipped;
    diagnostics.marketDepthScaling = settings.marketDepth.scaling;
    diagnostics.marketDepthLastUpdateAgeMs =
      snapshot.depthReceivedAt === null
        ? null
        : Math.max(0, now - snapshot.depthReceivedAt);
    diagnostics.marketDepthSymbol = snapshot.generation;
  }

  private paintBubbles(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    input: {
      api: Attached;
      snapshot: ReturnType<FlowRenderStore["getSnapshot"]>;
      start: number;
      end: number;
      projectX: (timestampMs: number) => number | null;
    },
  ) {
    const { api, snapshot, start, end, projectX } = input;
    const settings = snapshot.settings;
    const diagnostics: Partial<FlowRenderDiagnostics> = {
      bubbleGroupsProduced: 0,
      bubblesRejectedBelowThreshold: 0,
      bubblesRejectedByTimeProjection: 0,
      bubblesRejectedByPriceProjection: 0,
      bubblesDrawn: 0,
      bubbleXCoordinates: [],
      bubbleStableIds: [],
      stableBubbleGroupsRetained: 0,
      bubbleGroupsVisible: 0,
      rejectionReasons: { time: 0, price: 0, threshold: 0 },
    };

    if (!settings.bubblesVisible) {
      this.store.updateDiagnostics(diagnostics);
      return;
    }

    const bubbleStep =
      settings.bubbles.priceMode === "fixed"
        ? settings.bubbles.fixedPriceStep
        : snapshot.priceStep;
    const groups = aggregateTrades(
      snapshot.trades,
      snapshot.generation || "UNKNOWN",
      settings.bubbles.timeBucketMs,
      bubbleStep,
    );
    const visible = groups.filter((value) => value.timeMs >= start && value.timeMs < end);
    const totals = groups.map((value) => value.buyNotional + value.sellNotional);
    const threshold = bubbleThreshold(totals, settings.bubbles);
    const xs: number[] = [];

    diagnostics.bubbleGroupsProduced = groups.length;
    diagnostics.stableBubbleGroupsRetained = groups.length;
    diagnostics.bubbleGroupsVisible = visible.length;
    diagnostics.bubbleStableIds = groups.map((value) => value.id);

    context.save();
    try {
      context.beginPath();
      context.rect(0, 0, width, height);
      context.clip();

      for (const bubble of visible) {
        const x = projectX(bubble.timeMs);
        const y = api.series.priceToCoordinate(bubble.price);
        const composition = bubbleComposition(bubble);
        const radius = bubbleRadius(
          composition.total,
          threshold,
          settings.bubbles.minimumRadius,
          settings.bubbles.maximumRadius,
        );

        if (!radius) {
          diagnostics.bubblesRejectedBelowThreshold =
            (diagnostics.bubblesRejectedBelowThreshold ?? 0) + 1;
          continue;
        }
        if (x === null) {
          diagnostics.bubblesRejectedByTimeProjection =
            (diagnostics.bubblesRejectedByTimeProjection ?? 0) + 1;
          continue;
        }
        if (y === null || !Number.isFinite(Number(y))) {
          diagnostics.bubblesRejectedByPriceProjection =
            (diagnostics.bubblesRejectedByPriceProjection ?? 0) + 1;
          continue;
        }

        context.save();
        context.globalAlpha = settings.bubbles.opacity;
        context.fillStyle = blendHex(
          settings.bubbles.sellColour,
          settings.bubbles.buyColour,
          composition.buyRatio,
        );
        context.beginPath();
        context.arc(x, Number(y), radius, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = settings.bubbles.outlineOpacity;
        context.strokeStyle = settings.bubbles.outlineColour;
        context.stroke();
        context.restore();

        xs.push(x);
        diagnostics.bubblesDrawn = (diagnostics.bubblesDrawn ?? 0) + 1;
      }
    } finally {
      context.restore();
    }

    diagnostics.bubbleXCoordinates = xs;
    diagnostics.rejectionReasons = {
      time: groups.length - visible.length,
      price: diagnostics.bubblesRejectedByPriceProjection ?? 0,
      threshold: diagnostics.bubblesRejectedBelowThreshold ?? 0,
    };

    this.store.updateDiagnostics(diagnostics);
  }
}
