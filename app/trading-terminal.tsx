"use client";

import { SCHOOL_DISPLAY_NAME } from "@/app/lib/branding";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type Logical,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  analyzeStrategy,
  generateDemoCandles,
  type Candle,
  type StrategyAnalysis,
  formatLevelLabel,
} from "./lib/strategy";
import type { AuthUser } from "./lib/auth";
import { simulateConfirmedSignals } from "./lib/backtest";
import type { BacktestSummary } from "./lib/backtest";
import { initialSimulationState, simulationFingerprint, simulationReducer } from "./lib/paper-simulation";
import {
  DEFAULT_RISK,
  DEFAULT_STRATEGY,
  DEFAULT_VIEW,
  DEFAULT_ORDER_FLOW_SETTINGS,
  type RiskSettings,
  type UserTerminalSettings,
  type ViewSettings,
} from "./lib/config";
import type { OrderFlowSettings } from "./lib/order-flow/settings";
import type { FlowRenderStore } from "./lib/order-flow/render-store";
import { DizyFlowPrimitive } from "./lib/chart/dizyflow-primitive";
import { StrategyWorldLinesPrimitive, type StrategyWorldLinesModel, type StrategyWorldLineEntry } from "./lib/chart/strategy-world-lines-primitive";
import { DizyFlowDom } from "./dizyflow-dom";
import { DizyFlowAlertHistory, DizyFlowToastRail } from "./dizyflow-toast-rail";
import { DizyBrainSnapshotPublisher, DizyBrainWorkspace } from "./dizybrain-shell";
import { DizyQuantSnapshotPublisher } from "./dizyquant-snapshot-publisher";
import { createDizyBrainSnapshot } from "./lib/dizybrain-snapshot";
import { toDizyFlowEvidenceReference } from "./lib/order-flow/intelligence";
import type { MarketDescriptor } from "./lib/market/types";
import type { DexMarket } from "./lib/dex/types";
import { DIZY_USDT_POOL, splitDexOhlcv, supportsDexChartTimeframe } from "./lib/dex/dizy";
import { marketBadge } from "./lib/market/catalogue";
import type { CandleTimeframe } from "./lib/market/types";
import {
  useMexcRealtime,
  type RealtimeStatus,
} from "./lib/market/use-mexc-realtime";
import {
  calculateExchangeAlignedCountdownSeconds,
  defaultVisibleCandleCount,
  formatCountdown,
  startAlignedSecondClock,
  updatePriceLineCountdownTitle,
} from "./lib/market/realtime";
import {
  APPEARANCE_PRESETS,
  hexToRgba,
  type ChartAppearanceSettings,
} from "./lib/chart/appearance";
import {
  calculateAutoFit,
  calculateChartLayout,
  calculateFibLabelLayout,
  calculateGoToLive,
  calculateHorizontalLineExtent,
  extendLineToPlot,
  calculateProfileRowGeometry,
  patternLabelPosition,
  stackLabels,
} from "./lib/chart/chart-layout";
import {
  ALL_TIMEFRAMES,
  PROFILE_BAR_PRESETS,
  profileBarPreset,
  TIMEFRAME_TITLES,
} from "./lib/chart/toolbar";
import { ChartToolsLayer } from "./chart-tools-layer";
import { chartSeriesSyncKey, planSeriesSync } from "./lib/chart/series-sync";
import { type MarketLoadReason } from "./lib/market/reconciliation";
import {buildPineParityReport} from "./lib/pine-parity";
import { stableLabelLane } from "./lib/chart/world-projection";
import { livePaperSnapshot } from "./lib/paper-performance";
import { createReplaySession, createReplaySnapshot, jumpReplay, prepareReplayCandles, progressReplay, replayDelayMs, replayIdentityChanged, replayPrefix, replayRangeForCandles, stepReplay, validReplaySpeed, type ReplaySession } from "./lib/replay";
import type { HistoricalDizyFlowMemory } from "./lib/historical-dizyflow";
import { buildHistoricalFlowReplayView, type HistoricalDizyFlowReplayView } from "./lib/historical-dizyflow-replay";
import { coordinateJournalReplayLaunch, JournalReplayLaunchLifecycle } from "./lib/journal-trade-import";
import { validJournalMarketKey } from "./lib/journal-validation";
import { PaperPerformanceToolbar } from "./paper-performance-toolbar";
import { ManualPaperTicket } from "./manual-paper-ticket";
import { OrderFlowToolbar } from "./order-flow-toolbar";
import { useOrderFlow } from "./lib/order-flow/use-order-flow";
import {
  buildDisplayTimeline,
  marketTimelineReducer,
} from "./lib/market/timeline";
import { ChartErrorBoundary } from "./chart-error-boundary";
import { MarketBrowser } from "./market-browser";
import {
  resolveStrategySettings,
  strategyHistoryCapacity,
  strategyModeLabel,
  type StrategyMode,
} from "./lib/strategy-presets";

const EMPTY_BACKTEST: BacktestSummary = { initialEquity: 1000, endingEquity: 1000, returnPct: 0, maxDrawdownPct: 0, trades: 0, wins: 0, winRatePct: 0, profitFactor: null, closedTrades: [] };

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const signed = (value: number) =>
  Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : "—";

function IndicatorToggle({
  checked,
  label,
  colour,
  onChange,
}: {
  checked: boolean;
  label: string;
  colour: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="indicator-toggle">
      <span className="indicator-dot" style={{ backgroundColor: colour }} />
      <span>{label}</span>
      <input
        aria-label={`Show ${label}`}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" className="switch" />
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <span className="number-shell">
        <input
          aria-label={label}
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="number"
          value={value}
        />
        {suffix ? <em>{suffix}</em> : null}
      </span>
    </label>
  );
}

function chartLayout(
  canvas: HTMLCanvasElement,
  chart: IChartApi,
  view: ViewSettings,
) {
  const rect = canvas.getBoundingClientRect();
  return calculateChartLayout({
    width: rect.width,
    height: rect.height,
    priceScaleWidth: chart.priceScale("right").width(),
    profileEnabled: view.volumeProfile,
    profileWidthPct: view.profileWidthPct,
    profileMaxWidth: view.profileMaxWidth,
    profileInset: view.profileInset,
    rightLabels:
      view.supportResistance &&
      view.srLabelPlacement === "right-before-profile",
  });
}

function PlacementField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ViewSettings["srLabelPlacement"];
  onChange: (value: ViewSettings["srLabelPlacement"]) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value as ViewSettings["srLabelPlacement"])
        }
      >
        <option value="right-before-profile">Right — before profile</option>
        <option value="left-edge">Left edge</option>
        <option value="near-latest">Near latest candle</option>
        <option value="hidden">Hidden labels</option>
      </select>
    </label>
  );
}

function ExtensionField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ViewSettings["srLineExtension"];
  onChange: (value: ViewSettings["srLineExtension"]) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value as ViewSettings["srLineExtension"])
        }
      >
        <option value="none">None</option>
        <option value="left">Left</option>
        <option value="right">Right</option>
        <option value="both">Both</option>
      </select>
    </label>
  );
}

function strategyWorldLinesModel(candles:Candle[],analysis:StrategyAnalysis,view:ViewSettings):StrategyWorldLinesModel {
  const indexByTime=new Map(candles.map((candle,index)=>[candle.time,index]));
  const extension=(individual:ViewSettings["srLineExtension"])=>view.globalLineExtensionOverride==="individual"?individual:view.globalLineExtensionOverride;
  const fontSize=view.labelSize==="Small"?10:view.labelSize==="Large"?14:12;
  const make=(id:string,points:{time:number;value:number}[],group:StrategyWorldLineEntry["group"],colour:string,width:number,style:StrategyWorldLineEntry["style"]["style"],halo:boolean,label:boolean,lanePriority:number):StrategyWorldLineEntry|null=>{
    if(points.length<2)return null;const start=indexByTime.get(points[0].time),end=indexByTime.get(points[1].time);if(start==null||end==null||start===end)return null;
    return {line:{id,start:{index:start,time:points[0].time,price:points[0].value},end:{index:end,time:points[1].time,price:points[1].value},createdAt:points[1].time,status:"confirmed"},extension:extension(group.startsWith("lr-")?view.lrChannelExtension:view.pivotTrendlineExtension),style:{colour,width,style,halo,haloColour:view.appearance.indicators.trendlineHalo,label,labelText:id,labelTextColour:view.appearance.chart.background},lanePriority,group};
  };
  const lines=[
    ...(view.channels&&analysis.activeChannel?[make("LR Upper",analysis.activeChannel.upper,"lr-upper",view.appearance.indicators.regressionUpper,view.lrBoundaryWidth,view.lrBoundaryStyle,false,view.showLrChannelLabels,5),make("LR Basis",analysis.activeChannel.basis,"lr-basis",view.appearance.indicators.regressionBasis,view.lrBasisWidth,"solid",view.lrBasisHalo,view.showLrChannelLabels,6),make("LR Lower",analysis.activeChannel.lower,"lr-lower",view.appearance.indicators.regressionLower,view.lrBoundaryWidth,view.lrBoundaryStyle,false,view.showLrChannelLabels,7)]:[]),
    ...(view.trendlines?[make("Upper trend",analysis.upperTrendline,"trend",view.appearance.indicators.bearTrendline,view.pivotTrendlineWidth,view.pivotTrendlineStyle,view.trendlineHalo,view.showTrendlineLabels,8),make("Lower trend",analysis.lowerTrendline,"trend",view.appearance.indicators.bullTrendline,view.pivotTrendlineWidth,view.pivotTrendlineStyle,view.trendlineHalo,view.showTrendlineLabels,9)]:[]),
  ].filter((line):line is StrategyWorldLineEntry=>line!==null);
  return {lines,channelFill:{visible:view.channels&&view.showLrChannelFill,colour:view.appearance.indicators.regressionFill,opacity:view.lrChannelFillOpacity},fontSize,labelPadding:view.labelPadding,compactLabels:view.compactLabels,latestLogicalIndex:candles.length-1,volumeProfile:view.volumeProfile,profileWidthPct:view.profileWidthPct,profileMaxWidth:view.profileMaxWidth,profileInset:view.profileInset,supportResistance:view.supportResistance,srLabelPlacement:view.srLabelPlacement,labelOffset:view.labelOffset};
}

function drawChartOverlay(
  canvas: HTMLCanvasElement,
  chart: IChartApi,
  candleSeries: ISeriesApi<"Candlestick">,
  candles: Candle[],
  analysis: StrategyAnalysis,
  view: ViewSettings,
) {
  const rect = canvas.getBoundingClientRect(),
    dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(dpr, dpr);
  context.clearRect(0, 0, rect.width, rect.height);
  const a = view.appearance,
    layout = chartLayout(canvas, chart, view);
  const extension = (individual: ViewSettings["srLineExtension"]) =>
    view.globalLineExtensionOverride === "individual"
      ? individual
      : view.globalLineExtensionOverride;
  const fontSize =
    view.labelSize === "Small" ? 10 : view.labelSize === "Large" ? 14 : 12;
  const labelHeight =
    fontSize + (view.compactLabels ? 4 : view.labelPadding * 2);
  context.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  context.textBaseline = "middle";
  if (view.completedPatternFills)
    analysis.completedPatterns.forEach((region) => {
      if (region.status !== "confirmed") return;
      const start = chart
          .timeScale()
          .timeToCoordinate(region.startTime as UTCTimestamp),
        end = chart
          .timeScale()
          .timeToCoordinate(region.endTime as UTCTimestamp),
        top = candleSeries.priceToCoordinate(region.high),
        bottom = candleSeries.priceToCoordinate(region.low);
      if (start == null || end == null || top == null || bottom == null) return;
      const colour =
        region.family === "elliott"
          ? a.structure.elliottFill
          : region.direction === "bullish" ||
              region.direction === "accumulation"
            ? a.structure.wyckoffAccumulationFill
            : a.structure.wyckoffDistributionFill;
      context.fillStyle = hexToRgba(colour, a.opacity.completedPatterns);
      if (region.points?.length) {
        context.beginPath();
        region.points.forEach((p, i) => {
          const x = chart.timeScale().timeToCoordinate(p.time as UTCTimestamp),
            y = candleSeries.priceToCoordinate(p.price);
          if (x != null && y != null) {
            if (i) context.lineTo(x, y);
            else context.moveTo(x, y);
          }
        });
        context.lineTo(Number(end), Number(bottom));
        context.lineTo(Number(start), Number(bottom));
        context.closePath();
        context.fill();
      } else
        context.fillRect(
          Number(start),
          Number(top),
          Number(end) - Number(start),
          Number(bottom) - Number(top),
        );
    });
  if (view.supportResistance) {
    const drawable = analysis.levels
      .map((level, index) => ({
        level,
        id: `${level.kind}-${index}`,
        y: candleSeries.priceToCoordinate(level.price),
      }))
      .filter((item): item is typeof item & { y: number } => item.y != null);
    const stacked = stackLabels(
      drawable.map(({ id, y }) => ({ id, y })),
      rect.height,
      labelHeight,
      3,
    );
    drawable.forEach((item) => {
      const support = item.level.kind === "support",
        placed = stacked.find((label) => label.id === item.id)!;
      context.fillStyle = hexToRgba(
        support ? a.structure.supportZone : a.structure.resistanceZone,
        a.opacity.zones,
      );
      context.fillRect(
        layout.candles.x,
        item.y - 7,
        Math.max(0, layout.priceScale.x - layout.candles.x),
        14,
      );
      const fallbackStart = candles[Math.max(0, candles.length - 60)]?.time,
        fallbackEnd = candles.at(-1)?.time;
      const startX =
        chart
          .timeScale()
          .timeToCoordinate(
            (item.level.startTime ?? fallbackStart) as UTCTimestamp,
          ) ?? layout.candles.x;
      const endX =
        chart
          .timeScale()
          .timeToCoordinate(
            (item.level.endTime ?? fallbackEnd) as UTCTimestamp,
          ) ?? layout.candles.x + layout.candles.width;
      const extent = calculateHorizontalLineExtent(
        startX,
        endX,
        layout.candles,
        extension(view.srLineExtension),
      );
      context.strokeStyle = support
        ? a.structure.supportLine
        : a.structure.resistanceLine;
      context.setLineDash([7, 5]);
      context.beginPath();
      if (extent) {
        context.moveTo(extent.startX, item.y);
        context.lineTo(extent.endX, item.y);
        context.stroke();
      }
      context.setLineDash([]);
      if (view.srLabelPlacement === "hidden") return;
      const text = formatLevelLabel(item.level, view.showLevelTouches);
      const width = context.measureText(text).width + view.labelPadding * 2;
      let x = layout.rightLabels.x + layout.rightLabels.width - width - 4;
      if (view.srLabelPlacement === "left-edge") x = layout.leftLabels.x;
      if (view.srLabelPlacement === "near-latest") {
        const latestX =
          chart
            .timeScale()
            .timeToCoordinate(candles.at(-1)?.time as UTCTimestamp) ??
          layout.candles.x;
        x = Math.min(layout.profile.x - width - 4, latestX + view.labelOffset);
      }
      x = Math.max(layout.candles.x, Math.min(x, layout.profile.x - width - 4));
      if (placed.displaced) {
        context.strokeStyle = hexToRgba(
          support ? a.structure.supportLine : a.structure.resistanceLine,
          0.55,
        );
        context.beginPath();
        context.moveTo(x, placed.placedY);
        context.lineTo(x - 10, item.y);
        context.stroke();
      }
      context.fillStyle = hexToRgba(
        support
          ? a.structure.supportLabelBackground
          : a.structure.resistanceLabelBackground,
        a.opacity.labels,
      );
      context.fillRect(x, placed.placedY - labelHeight / 2, width, labelHeight);
      context.fillStyle = support
        ? a.structure.supportLabelText
        : a.structure.resistanceLabelText;
      context.fillText(text, x + view.labelPadding, placed.placedY);
    });
  }
  if (view.fibonacci) {
    context.save();
    const fibs = analysis.fibs
      .map((fib) => ({ fib, y: candleSeries.priceToCoordinate(fib.price) }))
      .filter((item): item is typeof item & { y: number } => item.y != null);
    const latestX =
      chart
        .timeScale()
        .timeToCoordinate(candles.at(-1)?.time as UTCTimestamp) ??
      layout.candles.x;
    const labels = calculateFibLabelLayout({
      levels: fibs.map(({ fib, y }) => ({
        ratio: fib.ratio,
        label: fib.label,
        lineY: y,
        textWidth: context.measureText(fib.label).width,
      })),
      placement: view.fibLabelPlacement,
      plot: layout.candles,
      leftX: layout.leftLabels.x,
      rightBoundary: layout.profile.x - 4,
      latestX,
      offset: view.labelOffset,
      labelHeight,
      horizontalPadding: Math.max(6, view.labelPadding),
      top: Math.max(layout.leftLabels.y, 44),
      bottom: Math.min(
        layout.leftLabels.y + layout.leftLabels.height,
        layout.candles.y + layout.candles.height - 24,
      ),
      gap: 3,
    });
    fibs.forEach(({ fib, y }) => {
      const emphasis = fib.ratio === 0.618 ? 2 : fib.ratio === 0.5 ? 1 : 0;
      context.strokeStyle = hexToRgba(
        a.structure.fibonacciLine,
        emphasis === 2 ? 0.8 : emphasis === 1 ? 0.6 : 0.38,
      );
      context.lineWidth = emphasis === 2 ? 1.5 : 1;
      context.setLineDash([3, 5]);
      const fallbackStart = candles[Math.max(0, candles.length - 100)]?.time,
        fallbackEnd = candles.at(-1)?.time;
      const startX =
          chart
            .timeScale()
            .timeToCoordinate(
              (fib.startTime ?? fallbackStart) as UTCTimestamp,
            ) ?? layout.candles.x,
        endX =
          chart
            .timeScale()
            .timeToCoordinate((fib.endTime ?? fallbackEnd) as UTCTimestamp) ??
          layout.candles.x + layout.candles.width;
      const extent = calculateHorizontalLineExtent(
        startX,
        endX,
        layout.candles,
        extension(view.fibLineExtension),
      );
      context.beginPath();
      if (extent) {
        context.moveTo(extent.startX, y);
        context.lineTo(extent.endX, y);
        context.stroke();
      }
    });
    context.setLineDash([]);
    labels.forEach((label) => {
      if (label.connector) {
        context.strokeStyle = hexToRgba(a.structure.fibonacciLabelBorder, 0.72);
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(label.x, label.centreY);
        context.lineTo(Math.max(layout.candles.x, label.x - 10), label.lineY);
        context.stroke();
      }
      context.beginPath();
      context.roundRect(label.x, label.y, label.width, label.height, 6);
      context.fillStyle = hexToRgba(
        a.structure.fibonacciLabelBackground,
        label.emphasis ? 1 : a.opacity.labels,
      );
      context.fill();
      context.strokeStyle = a.structure.fibonacciLabelBorder;
      context.lineWidth =
        label.emphasis === 2 ? 2 : label.emphasis === 1 ? 1.5 : 1;
      context.stroke();
      context.fillStyle = a.structure.fibonacciText;
      context.fillText(
        label.text,
        label.x + Math.max(6, view.labelPadding),
        label.centreY,
      );
    });
    context.restore();
  }
  const indexByTime = new Map(candles.map((candle,index)=>[candle.time,index]));
  if (view.volumeProfile && candles.length && layout.profileContent.width > 0) {
    const sample = candles.slice(-Math.min(view.volumeBars, candles.length)),
      min = Math.min(...sample.map((c) => c.low)),
      max = Math.max(...sample.map((c) => c.high)),
      size = (max - min) / view.volumeRows || 1;
    const buckets = Array.from({ length: view.volumeRows }, (_, i) => ({
      price: min + size * (i + 0.5),
      up: 0,
      down: 0,
    }));
    sample.forEach((c) => {
      const i = Math.min(
        buckets.length - 1,
        Math.max(0, Math.floor(((c.high + c.low + c.close) / 3 - min) / size)),
      );
      if (c.close >= c.open) buckets[i].up += c.volume;
      else buckets[i].down += c.volume;
    });
    const maximum = Math.max(1, ...buckets.map((b) => b.up + b.down));
    context.save();
    context.beginPath();
    context.rect(
      layout.profileContent.x,
      layout.profileContent.y,
      layout.profileContent.width,
      layout.profileContent.height,
    );
    context.clip();
    buckets.forEach((b) => {
      const top = candleSeries.priceToCoordinate(b.price + size / 2),
        bottom = candleSeries.priceToCoordinate(b.price - size / 2);
      if (top == null || bottom == null) return;
      const total = ((b.up + b.down) / maximum) * layout.profileContent.width,
        up = total * (b.up / Math.max(1, b.up + b.down)),
        x = layout.profileContent.x + layout.profileContent.width - total,
        row = calculateProfileRowGeometry(top, bottom, view.volumeRows);
      context.fillStyle = hexToRgba(a.profile.bear, view.profileOpacity);
      context.fillRect(x, row.y, total - up, row.height);
      context.fillStyle = hexToRgba(a.profile.bull, view.profileOpacity);
      context.fillRect(x + total - up, row.y, up, row.height);
    });
    context.restore();
    if (view.showProfileHeading) {
      context.save();
      context.beginPath();
      context.rect(layout.profile.x, 0, layout.profile.width, 28);
      context.clip();
      context.fillStyle = a.profile.heading;
      context.font = `600 ${Math.min(10, fontSize)}px Inter`;
      context.textBaseline = "alphabetic";
      context.fillText(
        `VOLUME PROFILE · ${sample.length} candles · ${view.volumeRows} price bars`,
        layout.profile.x + view.profileInset,
        18,
      );
      context.restore();
    }
  }
  if (view.triangles) {
    analysis.triangles.forEach((triangle) => {
      const pts = triangle.points
        .map((point) => ({
          x: chart.timeScale().timeToCoordinate(point.time as UTCTimestamp),
          y: candleSeries.priceToCoordinate(point.price),
        }))
        .filter((p) => p.x != null && p.y != null)
        .map((p) => ({ x: Number(p.x), y: Number(p.y) }));
      if (pts.length !== 3) return;
      const bullish = triangle.direction === "bullish",
        border = bullish
          ? a.structure.bullishTriangleBorder
          : a.structure.bearishTriangleBorder;
      context.save();
      context.beginPath();
      context.rect(
        layout.candles.x,
        layout.candles.y,
        layout.candles.width,
        layout.candles.height,
      );
      context.clip();
      context.fillStyle = hexToRgba(
        bullish
          ? a.structure.bullishTriangleFill
          : a.structure.bearishTriangleFill,
        a.opacity.triangles,
      );
      context.strokeStyle = border;
      context.beginPath();
      context.moveTo(pts[0].x, pts[0].y);
      context.lineTo(pts[1].x, pts[1].y);
      context.lineTo(pts[2].x, pts[2].y);
      context.closePath();
      context.fill();
      context.stroke();
      if (extension(view.triangleLineExtension) !== "none") {
        [pts[0], pts[1]].forEach((anchor) => {
          const ray = extendLineToPlot(
            [anchor, pts[2]],
            layout.candles,
            extension(view.triangleLineExtension),
          );
          if (ray) {
            context.beginPath();
            context.moveTo(ray.start.x, ray.start.y);
            context.lineTo(ray.end.x, ray.end.y);
            context.stroke();
          }
        });
      }
      context.restore();
      if (view.patternLabelPlacement === "hidden") return;
      const text = `${bullish ? "▲" : "▼"} ${triangle.label}`,
        width = context.measureText(text).width + 12,
        minX = Math.min(...pts.map((p) => p.x)),
        maxX = Math.max(...pts.map((p) => p.x)),
        minY = Math.min(...pts.map((p) => p.y)),
        maxY = Math.max(...pts.map((p) => p.y)),
        position = patternLabelPosition(
          { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
          view.patternLabelPlacement,
          { width, height: labelHeight },
          layout.candles,
          view.labelOffset,
        );
      context.fillStyle = bullish
        ? a.structure.bullishTriangleText
        : a.structure.bearishTriangleText;
      context.fillText(text, position.x + 6, position.y + labelHeight / 2);
    });
  }
  if(view.waves&&view.indicatorPackage){
    (["elliott","wyckoff"] as const).forEach(family=>{
      const stages=analysis.patternStages.filter(stage=>stage.family===family&&(view.provisionalStages||stage.status==="confirmed"));
      if(stages.length<2)return;
      context.save();context.beginPath();context.rect(layout.candles.x,layout.candles.y,layout.candles.width,layout.candles.height);context.clip();context.lineWidth=family==="elliott"?2.5:2;context.strokeStyle=family==="elliott"?a.structure.waveMarker:stages[0].direction==="accumulation"?a.structure.wyckoffAccumulation:a.structure.wyckoffDistribution;
      stages.forEach((stage,index)=>{const logical=indexByTime.get(stage.time),x=logical==null?null:chart.timeScale().logicalToCoordinate(logical as Logical),y=candleSeries.priceToCoordinate(stage.price);if(x==null||y==null)return;context.setLineDash(stage.status==="forming"?[7,5]:[]);if(index===0){context.beginPath();context.moveTo(Number(x),Number(y));}else{context.lineTo(Number(x),Number(y));context.stroke();context.beginPath();context.moveTo(Number(x),Number(y));}context.beginPath();context.arc(Number(x),Number(y),3,0,Math.PI*2);context.fillStyle=context.strokeStyle;context.fill();});context.restore();
    });
  }
  const candleByTime = new Map(candles.map((candle) => [candle.time, candle]));
  const drawBubbles = (
    source: {
      id: string;
      time: number;
      price: number;
      label: string;
      status?: "forming" | "confirmed";
      direction?: string;
      confluence?: number;
    }[],
    signal = false,
  ) => {
    const signalSizes = {
      Tiny: 8,
      Small: 10,
      Medium: 11,
      Large: 13,
      "Extra Large": 15,
    } as const;
    const size = signal
      ? signalSizes[view.signalBubbleSize]
      : view.patternBubbleSize === "Small"
        ? 10
        : view.patternBubbleSize === "Medium"
          ? 12
          : 14;
    context.font = `700 ${size}px Inter, system-ui`;
    const items = source
      .map((item) => {
        const candle = candleByTime.get(item.time),
          buy = item.direction === "buy";
        const side = signal
          ? view.signalPlacement === "side-aware"
            ? buy
              ? "below"
              : "above"
            : view.signalPlacement
          : "above";
        const anchorPrice =
          signal && candle
            ? side === "below"
              ? candle.low
              : candle.high
            : item.price;
        const logical = indexByTime.get(item.time),
          x = logical == null ? null : chart.timeScale().logicalToCoordinate(logical as Logical),
          y = candleSeries.priceToCoordinate(anchorPrice);
        const text =
          signal && view.signalDetail === "Direction + confluence"
            ? `${item.label} ${item.confluence ?? 0}/5`
            : item.label;
        return x == null || y == null
          ? null
          : {
              ...item,
              text,
              side,
              anchorX: Number(x),
              anchorY:
                Number(y) +
                (side === "below" ? view.signalDistance : -view.signalDistance),
              width: context.measureText(text).width + (signal ? 12 : 14),
              height: size + (signal ? 8 : 10),
            };
      })
      .filter((i): i is NonNullable<typeof i> => Boolean(i));
    const positions = items.map(item => { const lane=stableLabelLane(item.id,signal?11:5,4), gap=item.height+4, y=item.side==="below"?item.anchorY+lane*gap:item.anchorY-item.height-lane*gap; return {...item,x:item.anchorX-item.width/2,y}; }).filter(item=>item.x+item.width>=layout.candles.x&&item.x<=layout.candles.x+layout.candles.width);
    positions.forEach((p) => {
      const meta = items.find((item) => item.id === p.id)!;
      const provisional = meta.status === "forming",
        buy = meta.direction === "buy";
      const background = signal
        ? buy
          ? a.structure.buyMarker
          : a.structure.sellMarker
        : provisional
          ? a.structure.provisionalBackground
          : meta.direction === "accumulation"
            ? a.structure.wyckoffAccumulation
            : meta.direction === "distribution"
              ? a.structure.wyckoffDistribution
              : a.structure.waveMarker;
      const border = provisional
        ? a.structure.provisionalBorder
        : signal
          ? background
          : a.structure.elliottBorder;
      context.globalAlpha = provisional ? 0.65 : 1;
      context.strokeStyle = border;
      context.fillStyle = background;
      context.setLineDash(provisional ? [4, 3] : []);
      if (!signal && view.showPatternConnectors) {
        context.beginPath();
        context.moveTo(p.anchorX, p.anchorY);
        context.lineTo(p.anchorX, p.side === "below" ? p.y : p.y + p.height);
        context.stroke();
      }
      context.beginPath();
      context.roundRect(p.x, p.y, p.width, p.height, 5);
      context.fill();
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = signal
        ? buy
          ? a.structure.buyText
          : a.structure.sellText
        : a.structure.elliottText;
      context.fillText(meta.text, p.x + (signal ? 6 : 7), p.y + p.height / 2);
      context.globalAlpha = 1;
    });
  };
  if (view.waves && view.indicatorPackage)
    drawBubbles(
      analysis.patternStages.filter(
        (stage) => view.provisionalStages || stage.status === "confirmed",
      ),
    );
  if (view.signals && view.indicatorPackage)
    drawBubbles(
      view.showHistoricalSignals
        ? analysis.tradeSignals
        : analysis.tradeSignals.slice(-1),
      true,
    );
}

export type ChartControls = { resetView: () => void; goToLive: () => void };
const DizyChart = forwardRef<
  ChartControls,
  {
    displayCandles: Candle[];
    liveCandle: Candle | null;
    analysis: StrategyAnalysis;
    view: ViewSettings;
    resetKey: number;
    countdownSeconds: number | null;
    symbol: string;
    timeframe: string;
    exchange?: string;
    readOnly: boolean;
    applyDefaultsNonce: number;
    flowStore: FlowRenderStore;
    replayMode?: boolean;
  }
>(function DizyChart(
  {
    displayCandles,
    liveCandle,
    analysis,
    view,
    resetKey,
    countdownSeconds,
    symbol,
    timeframe,
    exchange = "mexc",
    readOnly,
    applyDefaultsNonce,
    flowStore,
    replayMode=false,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null),
    markerRef = useRef<HTMLDivElement>(null),
    overlayRef = useRef<HTMLCanvasElement>(null),
    chartRef = useRef<IChartApi | null>(null),
    candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null),
    volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null),
    priceLineRef = useRef<IPriceLine | null>(null),
    indicatorsRef = useRef(new Map<string, ISeriesApi<"Line">>()),
    previousDisplayRef = useRef<Candle[]>([]),
    marketKeyRef = useRef(""),
    projectionGenerationRef = useRef(0),
    redrawFrameRef = useRef<number | null>(null),
    flowPrimitiveRef = useRef<DizyFlowPrimitive | null>(null),
    strategyLinesPrimitiveRef = useRef<StrategyWorldLinesPrimitive | null>(null),
    latestRef = useRef({ candles: displayCandles, analysis, view });
  useEffect(() => {
    latestRef.current = { candles: displayCandles, analysis, view };
  });
  const [chartError, setChartError] = useState<Error | null>(null);
  const [chartIncarnation, setChartIncarnation] = useState(0);
  const redraw = useCallback(() => {
    if (redrawFrameRef.current !== null) return;
    redrawFrameRef.current = requestAnimationFrame(() => {
      redrawFrameRef.current = null;
      const chart = chartRef.current,
        series = candleRef.current,
        canvas = overlayRef.current;
      if (chart && series && canvas)
        drawChartOverlay(
          canvas,
          chart,
          series,
          latestRef.current.candles,
          latestRef.current.analysis,
          latestRef.current.view,
        );
    });
  }, []);
  const resetView = useCallback(() => {
    const chart = chartRef.current,
      element = containerRef.current,
      canvas = overlayRef.current;
    if (!chart || !element || !canvas || !latestRef.current.candles.length)
      return;
    const layout = chartLayout(canvas, chart, view),
      count = defaultVisibleCandleCount(
        element.clientWidth,
        latestRef.current.candles.length,
      ),
      range = calculateAutoFit({
        candleCount: latestRef.current.candles.length,
        desiredCount: count,
        barSpacing: 7,
        layout,
      });
    chart.priceScale("right").applyOptions({ autoScale: true });
    chart
      .timeScale()
      .setVisibleLogicalRange({ from: range.from, to: range.to });
    requestAnimationFrame(redraw);
  }, [view, redraw]);
  const goToLive = useCallback(() => {
    const chart = chartRef.current,
      canvas = overlayRef.current;
    if (!chart || !canvas || !latestRef.current.candles.length) return;
    const range = calculateGoToLive({
      candleCount: latestRef.current.candles.length,
      currentRange: chart.timeScale().getVisibleLogicalRange(),
      barSpacing: 7,
      layout: chartLayout(canvas, chart, view),
    });
    chart.priceScale("right").applyOptions({ autoScale: true });
    chart
      .timeScale()
      .setVisibleLogicalRange({ from: range.from, to: range.to });
    requestAnimationFrame(redraw);
  }, [view, redraw]);
  useImperativeHandle(ref, () => ({ resetView, goToLive }), [
    resetView,
    goToLive,
  ]);
  useEffect(() => {
    if (!containerRef.current) return;
    indicatorsRef.current.clear();
    const element = containerRef.current,
      a = latestRef.current.view.appearance,
      chart = createChart(element, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: a.chart.background },
          textColor: a.chart.axisText,
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 11,
          panes: { separatorColor: "#1b2233", enableResize: true },
        },
        grid: {
          vertLines: { color: hexToRgba(a.chart.grid, a.opacity.grid) },
          horzLines: { color: hexToRgba(a.chart.grid, a.opacity.grid) },
        },
        rightPriceScale: {
          borderColor: a.chart.priceScaleBorder,
          scaleMargins: { top: 0.08, bottom: 0.18 },
        },
        timeScale: {
          borderColor: a.chart.timeScaleBorder,
          timeVisible: true,
          rightOffset: 8,
          barSpacing: 7,
        },
      });
    const candles = chart.addSeries(CandlestickSeries, {
        priceLineVisible: false,
        lastValueVisible: false,
        borderVisible: false,
      }),
      volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "",
        lastValueVisible: false,
        priceLineVisible: false,
      });
    const flowPrimitive = new DizyFlowPrimitive(flowStore);
    const strategyLinesPrimitive = new StrategyWorldLinesPrimitive();
    flowPrimitiveRef.current = flowPrimitive;
    strategyLinesPrimitiveRef.current = strategyLinesPrimitive;
    if(!replayMode)candles.attachPrimitive(flowPrimitive);
    candles.attachPrimitive(strategyLinesPrimitive);
    strategyLinesPrimitive.setModel(strategyWorldLinesModel(latestRef.current.candles,latestRef.current.analysis,latestRef.current.view));
    volume
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;
    setChartIncarnation((value) => value + 1);
    const observer = new ResizeObserver(() => {
      redraw();
    });
    observer.observe(element);
    const scheduleRedraw = () => requestAnimationFrame(redraw);
    element.addEventListener("wheel", scheduleRedraw, { passive: true });
    element.addEventListener("pointermove", scheduleRedraw, { passive: true });
    element.addEventListener("pointerup", scheduleRedraw, { passive: true });
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", scheduleRedraw);
      element.removeEventListener("pointermove", scheduleRedraw);
      element.removeEventListener("pointerup", scheduleRedraw);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(redraw);
      if (priceLineRef.current) candles.removePriceLine(priceLineRef.current);
      if(!replayMode)candles.detachPrimitive(flowPrimitive);
      candles.detachPrimitive(strategyLinesPrimitive);
      flowPrimitiveRef.current = null;
      strategyLinesPrimitiveRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      priceLineRef.current = null;
      if (redrawFrameRef.current !== null)
        cancelAnimationFrame(redrawFrameRef.current);
    };
  }, [redraw, flowStore, replayMode]);
  useEffect(()=>{
    strategyLinesPrimitiveRef.current?.setModel(strategyWorldLinesModel(displayCandles,analysis,view));
  },[displayCandles,analysis,view]);
  useEffect(() => {
    const chart = chartRef.current,
      c = candleRef.current,
      v = volumeRef.current,
      a = view.appearance;
    if (!chart || !c || !v) return;
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: a.chart.background },
        textColor: a.chart.axisText,
      },
      grid: {
        vertLines: { color: hexToRgba(a.chart.grid, a.opacity.grid) },
        horzLines: { color: hexToRgba(a.chart.grid, a.opacity.grid) },
      },
      crosshair: {
        vertLine: { color: a.chart.crosshair },
        horzLine: { color: a.chart.crosshair },
      },
      rightPriceScale: { borderColor: a.chart.priceScaleBorder },
      timeScale: { borderColor: a.chart.timeScaleBorder },
    });
    c.applyOptions({
      upColor: a.candles.bull,
      downColor: a.candles.bear,
      wickUpColor: a.candles.bullWick,
      wickDownColor: a.candles.bearWick,
    });
    requestAnimationFrame(redraw);
  }, [view.appearance, redraw]);
  useEffect(() => {
    const c = candleRef.current,
      v = volumeRef.current;
    if (!c || !v) return;
    const a = view.appearance,
      key = chartSeriesSyncKey(symbol, timeframe, chartIncarnation),
      previous = previousDisplayRef.current,
      plan = planSeriesSync(
        previous,
        displayCandles,
        Boolean(marketKeyRef.current && marketKeyRef.current !== key),
      );
    const candleData = displayCandles.map((item) => ({
      ...item,
      time: item.time as UTCTimestamp,
    }));
    const volumeFor = (item: Candle) => ({
      time: item.time as UTCTimestamp,
      value: item.volume,
      color: hexToRgba(
        item.close >= item.open ? a.candles.bullVolume : a.candles.bearVolume,
        0.23,
      ),
    });
    try {
      if (plan.operation === "setData") {
        const range = chartRef.current?.timeScale().getVisibleLogicalRange();
        c.setData(candleData);
        v.setData(displayCandles.map(volumeFor));
        if (range && marketKeyRef.current === key)
          chartRef.current?.timeScale().setVisibleLogicalRange(range);
      } else if (plan.operation === "update") {
        c.update({ ...plan.point, time: plan.point.time as UTCTimestamp });
        v.update(volumeFor(plan.point));
      }
      previousDisplayRef.current = displayCandles;
      marketKeyRef.current = key;
      const generation=++projectionGenerationRef.current;
      flowPrimitiveRef.current?.setProjection(displayCandles,timeframe as CandleTimeframe,generation,{count:displayCandles.length,finalTime:displayCandles.at(-1)?.time??null,generation});
      redraw();
    } catch (error) {
      console.error("Chart sync error", {
        operation: plan.operation,
        market: key,
        previousFinal: previous.at(-1)?.time,
        nextFinal: displayCandles.at(-1)?.time,
        previousSize: previous.length,
        nextSize: displayCandles.length,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      queueMicrotask(() =>
        setChartError(
          error instanceof Error ? error : new Error(String(error)),
        ),
      );
    }
  }, [
    displayCandles,
    symbol,
    timeframe,
    view.appearance,
    redraw,
    chartIncarnation,
  ]);
  const livePrice = liveCandle?.close ?? null;
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    if (livePrice === null) {
      if (priceLineRef.current) series.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
      return;
    }
    if (!priceLineRef.current)
      priceLineRef.current = series.createPriceLine({
        price: livePrice,
        color: view.appearance.chart.livePrice,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
    priceLineRef.current.applyOptions({
      price: livePrice,
      color: view.appearance.chart.livePrice,
    });
  }, [livePrice, view.appearance.chart.livePrice]);
  useEffect(() => {
    updatePriceLineCountdownTitle(priceLineRef.current, countdownSeconds, false);
    const marker=markerRef.current, series=candleRef.current;
    if(marker&&series&&livePrice!==null){const y=series.priceToCoordinate(livePrice),height=marker.parentElement?.clientHeight??0;if(y!==null)marker.style.top=`${Math.max(2,Math.min(height-48,Number(y)-18))}px`;}
  }, [countdownSeconds, view.countdownPriceMarker, livePrice]);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const desired = new Map<
      string,
      { data: { time: number; value: number }[]; color: string }
    >([
      [
        "trend",
        { data: analysis.trend, color: view.appearance.indicators.trendMa },
      ],
    ]);
    if (view.vwap)
      desired.set("vwap", {
        data: analysis.vwap,
        color: view.appearance.indicators.vwap,
      });
    indicatorsRef.current.forEach((series, key) => {
      if (!desired.has(key)) {
        chart.removeSeries(series);
        indicatorsRef.current.delete(key);
      }
    });
    desired.forEach((item, key) => {
      let series = indicatorsRef.current.get(key);
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: item.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        indicatorsRef.current.set(key, series);
      } else series.applyOptions({ color: item.color });
      series.setData(
        item.data
          .filter((p) => Number.isFinite(p.value))
          .map((p) => ({ ...p, time: p.time as UTCTimestamp })),
      );
    });
    redraw();
  }, [
    analysis.trend,
    analysis.vwap,
    displayCandles,
    view.vwap,
    view.appearance.indicators,
    redraw,
  ]);
  useEffect(() => {
    requestAnimationFrame(resetView);
  }, [resetKey, resetView]);
  useEffect(() => {
    requestAnimationFrame(redraw);
  }, [view.volumeRows, redraw]);
  if (chartError) throw chartError;
  return (
    <div className="chart-tools-grid">
      <ChartToolsLayer
        applyDefaultsNonce={applyDefaultsNonce}
        candles={displayCandles}
        chart={() => chartRef.current}
        defaults={{
          trendLine: view.manualTrendLineExtension,
          ray: view.manualRayExtension,
          horizontalLine: view.manualHorizontalLineExtension,
          parallelChannel: view.manualChannelExtension,
          fibonacci: view.manualFibonacciExtension,
        }}
        exchange={exchange}
        fadeExtendedPortions={view.fadeExtendedPortions}
        globalExtension={view.globalLineExtensionOverride}
        readOnly={readOnly}
        series={() => candleRef.current}
        symbol={symbol}
        timeframe={timeframe}
      />
      <div className="chart-wrap">
        <div className="chart-canvas" ref={containerRef} />
        <canvas aria-hidden="true" className="chart-overlay" ref={overlayRef} />
          {livePrice!==null&&view.countdownPriceMarker?<div className={`live-price-marker ${liveCandle&&liveCandle.close>liveCandle.open?"up":liveCandle&&liveCandle.close<liveCandle.open?"down":"neutral"}`} ref={markerRef}><strong>{currency.format(livePrice)}</strong><small>{countdownSeconds===null?"—":formatCountdown(countdownSeconds,timeframe as CandleTimeframe)}</small></div>:null}
        <div className="chart-legend">
          <span>
            <i className="legend-vwap" />
            VWAP {analysis.vwap.at(-1)?.value.toFixed(1)}
          </span>
          <span>
            <i className="legend-trend" />
            Trend MA {analysis.trend.at(-1)?.value.toFixed(1)}
          </span>
          <span>
            <i className="legend-channel" />
            LinReg channel
          </span>
        </div>
      </div>
    </div>
  );
});

export default function TradingTerminal({ user }: { user: AuthUser }) {
  const [timeframe, setTimeframe] = useState("15m");
  const [symbol, setSymbol] = useState("BTC_USDT");
  const [selectedMarketKey, setSelectedMarketKey] = useState("mexc:futures:BTC_USDT");
  const [selectedDexMarket, setSelectedDexMarket] = useState<DexMarket | null>(null);
  const replayLaunchLifecycle=useRef(new JournalReplayLaunchLifecycle());
  const historicalFlowRequest=useRef(0);
  const marketKey = `${selectedMarketKey}:${timeframe}`;
  const [timeline, dispatchTimeline] = useReducer(
    marketTimelineReducer,
    undefined,
    () => ({
      marketKey,
      closed: generateDemoCandles(),
      live: null,
      lastPrice: null,
      rolloverSequence: 0,
    }),
  );
  const {
    closed: closedCandles,
    live: liveCandle,
    lastPrice: liveLastPrice,
  } = timeline;
  const [replayCandles,setReplayCandles]=useState<ReadonlyArray<Candle>>([]);
  const [replaySession,setReplaySession]=useState<ReplaySession|null>(null);
  const [journalReplayNotice,setJournalReplayNotice]=useState("");
  const [historicalFlow,setHistoricalFlow]=useState<{status:"unavailable";reason:string}|{status:"loading";memoryId:string}|{status:"available";memory:HistoricalDizyFlowMemory}|{status:"error";message:string}>({status:"unavailable",reason:"Historical DizyFlow was not retained for this trade."});
  const activeReplaySession=replaySession&&!replayIdentityChanged(replaySession,symbol,timeframe as CandleTimeframe)?replaySession:null;
  const replayActive=activeReplaySession!==null;
  const replayClosedCandles=useMemo(()=>activeReplaySession?[...replayPrefix(replayCandles,activeReplaySession.cursorIndex)]:closedCandles,[replayCandles,activeReplaySession,closedCandles]);
  const displayCandles = useMemo(
    () => replayActive ? replayClosedCandles : buildDisplayTimeline(closedCandles, liveCandle),
    [replayActive,replayClosedCandles,closedCandles, liveCandle],
  );
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatus>("connecting");
  const [clockOffset, setClockOffset] = useState(0);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [viewportReset, setViewportReset] = useState(0);
  const [applyDrawingDefaultsNonce, setApplyDrawingDefaultsNonce] = useState(0);
  const [dataSource, setDataSource] = useState("MEXC PUBLIC DATA");
  const [feedError, setFeedError] = useState("");
  const [markets, setMarkets] = useState<MarketDescriptor[]>([]);
  const [orderFlowSettings,setOrderFlowSettings]=useState<OrderFlowSettings>(DEFAULT_ORDER_FLOW_SETTINGS);
  const [flowHistoryOpen,setFlowHistoryOpen]=useState(false);
  const selectedMarket=markets.find((market)=>market.key===selectedMarketKey);
  const dexSelected=selectedDexMarket!==null;
  const futuresSelected=!dexSelected&&selectedMarket?.marketType!=="spot";
  const orderFlow=useOrderFlow({settings:orderFlowSettings,paused:!futuresSelected,symbol,contractSize:selectedMarket?.contractSize??1,priceUnit:selectedMarket?.priceUnit,priceScale:selectedMarket?.priceScale,marketKey:selectedMarket?.key,marketType:selectedMarket?.marketType,reference:liveCandle?.close?{price:liveCandle.close,source:"last"}:undefined});
  const [selectorOpen, setSelectorOpen] = useState(false);
  const marketTrigger = useRef<HTMLButtonElement>(null);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [terminalTab, setTerminalTab] = useState<"charts" | "explorer">(
    "charts",
  );
  const marketRequest = useRef(0);
  const marketAbort = useRef<AbortController | null>(null);
  const chartControls = useRef<ChartControls>(null);
  const timeframeStrip = useRef<HTMLDivElement>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [resultMarketKey, setResultMarketKey] = useState("");
  const [simulation, dispatchSimulation] = useReducer(simulationReducer, initialSimulationState);
  const simulationRequest = useRef(0);
  const [simulationRetry, setSimulationRetry] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<
    "visuals" | "strategy" | "risk" | "dizyflow"
  >("visuals");
  const [visualTab, setVisualTab] = useState<
    "layers" | "layout" | "lines" | "colours"
  >("layers");
  const [executionMode, setExecutionMode] = useState<"Off" | "Paper">("Paper");
  const [view, setView] = useState<ViewSettings>(DEFAULT_VIEW);
  const [strategy, setStrategy] = useState(DEFAULT_STRATEGY);
  const [risk, setRisk] = useState<RiskSettings>(() => ({
    ...DEFAULT_RISK,
    riskPct: DEFAULT_RISK.riskPct,
    maxNotional: DEFAULT_RISK.maxNotional,
  }));
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  useEffect(() => {
    timeframeStrip.current
      ?.querySelector<HTMLElement>("[aria-pressed='true']")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [timeframe]);

  const liveAnalysis = useMemo(() => analyzeStrategy(closedCandles, strategy), [closedCandles, strategy]);
  const effectiveStrategy = useMemo(
    () => resolveStrategySettings(strategy),
    [strategy],
  );
  const replaySnapshot=useMemo(()=>activeReplaySession?createReplaySnapshot({session:activeReplaySession,candles:replayCandles,strategy,risk}):null,[activeReplaySession,replayCandles,strategy,risk]);
  const historicalFlowReplay=useMemo<HistoricalDizyFlowReplayView|null>(()=>activeReplaySession&&activeReplaySession.cursorTimeMs!==null&&historicalFlow.status==="available"?buildHistoricalFlowReplayView(historicalFlow.memory,activeReplaySession.cursorTimeMs,activeReplaySession.previousCursorTimeMs??activeReplaySession.cursorTimeMs):null,[activeReplaySession,historicalFlow]);
  const analysis = replaySnapshot?.signalAnalysis ?? liveAnalysis;
  const dizyBrainSnapshot = replaySnapshot?.dizyBrainSnapshot ?? createDizyBrainSnapshot({analysis,strategy,risk,latestClosedCandleTime:closedCandles.at(-1)?.time??null,dizyFlowEvidence:toDizyFlowEvidenceReference(orderFlow.intelligence)});
  const replayTimer=useRef<number|null>(null);
  useEffect(()=>{
    if(!activeReplaySession||activeReplaySession.status!=="playing")return;
    const sessionId=activeReplaySession.id;
    replayTimer.current=window.setTimeout(()=>{
      setReplaySession(current=>{
        if(!current||current.id!==sessionId||current.status!=="playing")return current;
        return progressReplay(current,replayCandles);
      });
    },replayDelayMs(activeReplaySession.speed));
    return()=>{if(replayTimer.current!==null)window.clearTimeout(replayTimer.current);replayTimer.current=null;};
  },[activeReplaySession?.id,activeReplaySession?.status,activeReplaySession?.speed,activeReplaySession?.cursorIndex,replayCandles]);
  useEffect(()=>{const pause=()=>{if(document.visibilityState==="hidden")setReplaySession(current=>current?.status==="playing"?{...current,status:"paused"}:current);};document.addEventListener("visibilitychange",pause);return()=>document.removeEventListener("visibilitychange",pause);},[]);
  useEffect(()=>()=>{if(replayTimer.current!==null)window.clearTimeout(replayTimer.current);},[]);
  const enterReplay=()=>{const candles=Object.freeze(closedCandles.map(c=>Object.freeze({...c})));if(!candles.length)return;const now=Date.now(),range=replayRangeForCandles(candles,timeframe as CandleTimeframe);setHistoricalFlow({status:"unavailable",reason:"Historical DizyFlow was not retained for this trade."});setReplayCandles(candles);setReplaySession(createReplaySession({id:`replay-${now}`,symbol,timeframe:timeframe as CandleTimeframe,...range,startedAt:now,candles,speed:1}));setViewportReset(v=>v+1);};
  useEffect(()=>{const controller=new AbortController(),lifecycle=replayLaunchLifecycle.current;let token:number|null=null;const timer=window.setTimeout(()=>{if(lifecycle.launchHandled)return;const query=new URLSearchParams(window.location.search),requestedMarketKey=query.get("replayMarketKey"),requestedSymbol=query.get("replaySymbol"),requestedTimeframe=query.get("replayTimeframe") as CandleTimeframe|null,at=Number(query.get("replayAt")),memoryId=query.get("replayMemory"),entryId=query.get("journalEntry"),flowMemoryId=query.get("replayFlowMemory"),flowTradeId=query.get("replayTrade");if(!requestedMarketKey&&!requestedSymbol&&!requestedTimeframe)return;if(!validJournalMarketKey(requestedMarketKey)||!requestedSymbol||!requestedTimeframe||!Number.isFinite(at)){token=lifecycle.begin();if(token!==null&&lifecycle.complete(token))setJournalReplayNotice("Replay data is unavailable for this trade.");return;}if(selectedMarketKey!==requestedMarketKey||symbol!==requestedSymbol||timeframe!==requestedTimeframe){setSelectedMarketKey(requestedMarketKey);setSymbol(requestedSymbol);setTimeframe(requestedTimeframe);return;}if(resultMarketKey!==marketKey)return;token=lifecycle.begin();if(token===null)return;const attemptToken=token,rolling=Object.freeze(closedCandles.map(c=>Object.freeze({...c})));const clearQuery=()=>{for(const key of ["replayMarketKey","replaySymbol","replayTimeframe","replayAt","replayMemory","journalEntry","replayFlowMemory","replayTrade"])query.delete(key);window.history.replaceState(null,"",`${window.location.pathname}${query.size?`?${query}`:""}`);};void coordinateJournalReplayLaunch({signal:controller.signal,request:{marketKey:requestedMarketKey,symbol:requestedSymbol,timeframe:requestedTimeframe,timestampMs:at},identity:{marketKey:requestedMarketKey,symbol:requestedSymbol,timeframe:requestedTimeframe},rollingCandles:rolling,loadRetained:memoryId&&entryId?async()=>{if(lifecycle.isCurrent(attemptToken))setJournalReplayNotice("Loading retained replay memory…");const response=await fetch(`/api/replay-memory/${encodeURIComponent(memoryId)}?journalEntry=${encodeURIComponent(entryId)}`,{signal:controller.signal});if(!response.ok)throw new Error("Retained memory unavailable");const {memory}=await response.json();if(memory.marketKey!==requestedMarketKey||memory.symbol!==requestedSymbol||memory.timeframe!==requestedTimeframe)throw new Error("Retained memory identity mismatch");return prepareReplayCandles(memory.candles,{symbol:requestedSymbol,timeframe:requestedTimeframe},{symbol:memory.symbol,timeframe:memory.timeframe});}:undefined}).then(result=>{if(result.source==="cancelled"){lifecycle.cancel(attemptToken);return;}if(!lifecycle.complete(attemptToken))return;clearQuery();if(result.source==="unavailable"){setJournalReplayNotice("Replay data is unavailable for this trade.");return;}const range=replayRangeForCandles(result.candles,requestedTimeframe),session=createReplaySession({id:`journal-${result.source}-${Date.now()}`,symbol:requestedSymbol,timeframe:requestedTimeframe,...range,startedAt:Date.now(),candles:result.candles,speed:1});setReplayCandles(result.candles);setReplaySession(jumpReplay(session,result.candles,result.cursor));if(flowMemoryId&&flowTradeId){const flowRequest=++historicalFlowRequest.current;setHistoricalFlow({status:"loading",memoryId:flowMemoryId});setJournalReplayNotice(`${result.source==="retained-memory"?"Replay source: Retained memory.":"Replay source: Current history."} Loading Historical DizyFlow…`);void fetch(`/api/historical-dizyflow/${encodeURIComponent(flowMemoryId)}`,{signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error("Historical DizyFlow could not be loaded.");const memory=body.memory as HistoricalDizyFlowMemory;if(memory.id!==flowMemoryId||memory.tradeId!==flowTradeId||memory.marketKey!==requestedMarketKey||memory.symbol!==requestedSymbol)throw new Error("Historical DizyFlow identity mismatch.");if(flowRequest!==historicalFlowRequest.current)return;setHistoricalFlow({status:"available",memory});setJournalReplayNotice(`${result.source==="retained-memory"?"Replay source: Retained memory.":"Replay source: Current history."} Historical DizyFlow available.`);}).catch(error=>{if(error instanceof DOMException&&error.name==="AbortError")return;if(flowRequest!==historicalFlowRequest.current)return;setHistoricalFlow({status:"error",message:"Historical DizyFlow could not be loaded."});setJournalReplayNotice(`${result.source==="retained-memory"?"Replay source: Retained memory.":"Replay source: Current history."} Historical DizyFlow could not be loaded.`);});}else{historicalFlowRequest.current+=1;setHistoricalFlow({status:"unavailable",reason:"Historical DizyFlow was not retained for this trade."});setJournalReplayNotice(`${result.source==="retained-memory"?"Replay source: Retained memory.":memoryId?"Replay source: Current history. Retained memory was unavailable.":"Replay source: Current history."} Historical DizyFlow was not retained for this trade.`);}setViewportReset(v=>v+1);});},0);return()=>{window.clearTimeout(timer);controller.abort();if(token!==null&&lifecycle.cancel(token))queueMicrotask(()=>{if(!lifecycle.launchInFlight&&!lifecycle.launchHandled)setJournalReplayNotice("");});};},[selectedMarketKey,symbol,timeframe,closedCandles,resultMarketKey,marketKey]);
  const exitReplay=useCallback(()=>{historicalFlowRequest.current+=1;setReplaySession(null);setReplayCandles([]);setHistoricalFlow({status:"unavailable",reason:"Historical DizyFlow was not retained for this trade."});setViewportReset(v=>v+1);},[]);
  useEffect(()=>{if(!replaySession||!replayIdentityChanged(replaySession,symbol,timeframe as CandleTimeframe))return;const cleanup=window.setTimeout(exitReplay,0);return()=>window.clearTimeout(cleanup);},[replaySession,symbol,timeframe,exitReplay]);
  const historyCapacity = useMemo(
    () => strategyHistoryCapacity(strategy),
    [strategy],
  );
  const simulationInput = useMemo(() => {
    if (timeline.marketKey !== marketKey || resultMarketKey !== marketKey) return null;
    return simulationFingerprint({ marketKey: selectedMarketKey, timeframe, strategy, risk, candles: closedCandles });
  }, [timeline.marketKey, marketKey, resultMarketKey, selectedMarketKey, timeframe, strategy, risk, closedCandles]);
  useEffect(() => {
    if (!simulationInput) {
      dispatchSimulation({ type: "awaiting-input" });
      return;
    }
    const requestId = ++simulationRequest.current;
    dispatchSimulation({ type: "start", requestId, fingerprint: simulationInput });
    if (closedCandles.length < 40) {
      dispatchSimulation({ type: "insufficient", requestId });
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        const result = simulateConfirmedSignals(closedCandles, analysis, risk);
        dispatchSimulation({ type: "success", requestId, fingerprint: simulationInput, result });
      } catch (error) {
        dispatchSimulation({ type: "failure", requestId, message: error instanceof Error ? error.message : "Simulation failed." });
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // The fingerprint represents these values. Object identity changes with the same
    // confirmed inputs must not restart a historical simulation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationInput, simulationRetry]);
  const backtest: BacktestSummary = simulation.result ?? EMPTY_BACKTEST;
  const parityReport=useMemo(()=>buildPineParityReport({candles:closedCandles,analysis,datasetSource:dataSource,symbol,timeframe,backtest,compatibilityMode:strategyModeLabel(strategy.mode)}),[closedCandles,analysis,dataSource,symbol,timeframe,backtest,strategy.mode]);
  const [paperMark, setPaperMark] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setPaperMark(
          executionMode === "Paper"
            ? (liveLastPrice ?? liveCandle?.close ?? null)
            : null,
        ),
      225,
    );
    return () => window.clearTimeout(timer);
  }, [executionMode, liveLastPrice, liveCandle?.close]);
  const paperSnapshot = useMemo(
    () => livePaperSnapshot(backtest, paperMark, executionMode === "Paper"),
    [backtest, paperMark, executionMode],
  );
  const paperCompletionIdentity=useMemo(()=>JSON.stringify({selectedMarketKey,timeframe,strategy,risk}),[selectedMarketKey,timeframe,strategy,risk]);
  const last = liveCandle ?? closedCandles.at(-1);
  const firstVisible = closedCandles.at(-97);
  const change =
    last && firstVisible
      ? ((last.close - firstVisible.close) / firstVisible.close) * 100
      : 0;
  const signalColour =
    analysis.bias === "Bullish"
      ? "positive"
      : analysis.bias === "Bearish"
        ? "negative"
        : "neutral";

  const loadMarketData = useCallback(
    async ({
      reason,
      resetView,
    }: {
      reason: MarketLoadReason;
      resetView: boolean;
    }) => {
      const requestId = ++marketRequest.current,
        requestKey = `${selectedMarketKey}:${timeframe}`;
      marketAbort.current?.abort();
      const controller = new AbortController();
      marketAbort.current = controller;
      const blocking = reason === "initial" || reason === "market-change";
      if (blocking) setInitialLoading(true);
      else setBackgroundSyncing(true);
      if (blocking) setFeedError("");
      try {
        const dexRequest = selectedDexMarket;
        if (dexRequest && !supportsDexChartTimeframe(timeframe))
          throw new Error("Unsupported DEX timeframe");
        const endpoint = dexRequest
          ? `/api/dex/ohlcv?chain=${encodeURIComponent(dexRequest.chain)}&pool=${encodeURIComponent(dexRequest.poolAddress)}&interval=${encodeURIComponent(timeframe)}&limit=${Math.min(historyCapacity, 1000)}`
          : `/api/market?exchange=mexc&marketType=${selectedMarket?.marketType ?? "futures"}&symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${historyCapacity}`;
        const response = await fetch(endpoint, { signal: controller.signal });
        if (!response.ok) throw new Error("Feed unavailable");
        const payload = (await response.json()) as { source: string; candles: Candle[] };
        if (!payload.candles.length || (!dexRequest && payload.candles.length < 20))
          throw new Error("Insufficient candle history");
        if (
          requestId !== marketRequest.current ||
          requestKey !== `${selectedMarketKey}:${timeframe}`
        )
          return;
        const dexTimeline = dexRequest
          ? splitDexOhlcv(payload.candles, timeframe as CandleTimeframe)
          : { closed: payload.candles, live: null as Candle | null };
        dispatchTimeline(
          reason === "market-change" || reason === "initial"
            ? { type: "replaceMarket", marketKey: requestKey, closed: dexTimeline.closed, limit: historyCapacity }
            : { type: "reconcileClosed", marketKey: requestKey, closed: dexTimeline.closed, limit: historyCapacity },
        );
        if (dexRequest) {
          dispatchTimeline(dexTimeline.live
            ? { type: "kline", marketKey: requestKey, candle: dexTimeline.live }
            : { type: "clearLive", marketKey: requestKey });
        }
        if (resetView && view.autoFitOnMarketChange)
          setViewportReset((value) => value + 1);
        setDataSource(dexRequest ? `${payload.source.toUpperCase()} · RAYDIUM` : payload.source.toUpperCase());
        setResultMarketKey(requestKey);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (requestId !== marketRequest.current) return;
        const dexFailure = selectedDexMarket !== null;
        setFeedError(
          error instanceof Error && error.message === "Unsupported DEX timeframe"
            ? "That timeframe is not available for on-chain pool candles."
            : error instanceof Error && error.message === "Insufficient candle history"
              ? dexFailure ? "DIZY pool candles are still building." : "Insufficient confirmed candle history."
              : dexFailure ? "Raydium / GeckoTerminal candle data is currently unavailable." : "MEXC candle data is currently unavailable.",
        );
        if (blocking) setDataSource(dexFailure ? "DEX DATA UNAVAILABLE" : "MEXC UNAVAILABLE");
      } finally {
        if (requestId === marketRequest.current) {
          setInitialLoading(false);
          setBackgroundSyncing(false);
          marketAbort.current = null;
        }
      }
    },
    [symbol, selectedMarketKey, selectedMarket, selectedDexMarket, timeframe, view.autoFitOnMarketChange, historyCapacity],
  );

  const demo = dataSource === "DEMONSTRATION DATA";
  useMexcRealtime({
    enabled: terminalTab === "charts" && !dexSelected && !demo && !replayActive && view.realtimeChartUpdates,
    symbol,
    marketType: selectedMarket?.marketType ?? "futures",
    timeframe: timeframe as CandleTimeframe,
    contractSize:selectedMarket?.contractSize??1,
    onStatus: setRealtimeStatus,
    onClockOffset: setClockOffset,
    onResync: () =>
      void loadMarketData({ reason: "reconnect", resetView: false }),
    onKline: (incoming) =>
      dispatchTimeline({ type: "kline", marketKey, candle: incoming }),
    onDeal: (deal) => {
      orderFlow.onDeal(deal);
      dispatchTimeline({
        type: "deal",
        marketKey,
        deal,
        timeframe: timeframe as CandleTimeframe,
      });},
  });

  useEffect(() => {
    if (!dexSelected || terminalTab !== "charts" || replayActive || !view.realtimeChartUpdates) return;
    const timer = window.setInterval(
      () => void loadMarketData({ reason: "reconnect", resetView: false }),
      15_000,
    );
    return () => window.clearInterval(timer);
  }, [dexSelected, terminalTab, replayActive, view.realtimeChartUpdates, loadMarketData]);

  useEffect(() => {
    if (!timeline.rolloverSequence || timeline.marketKey !== marketKey) return;
    const timer = window.setTimeout(
      () => void loadMarketData({ reason: "rollover", resetView: false }),
      750,
    );
    return () => window.clearTimeout(timer);
  }, [
    timeline.rolloverSequence,
    timeline.marketKey,
    marketKey,
    loadMarketData,
  ]);

  useEffect(() => () => marketAbort.current?.abort(), []);

  const countdownActive = !replayActive &&
    view.candleCountdown &&
    liveCandle !== null &&
    (view.countdownToolbar || view.countdownPriceMarker);
  useEffect(() => {
    if (!countdownActive) return;
    return startAlignedSecondClock({ document, onTick: setCountdownNow });
  }, [countdownActive, symbol, timeframe]);
  const countdownSeconds = countdownActive
    ? calculateExchangeAlignedCountdownSeconds({
        timeframe: timeframe as CandleTimeframe,
        clientNowMs: countdownNow,
        clockOffsetMs: clockOffset,
      })
    : null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setResultMarketKey("");
      void loadMarketData({ reason: "market-change", resetView: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMarketData]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/profile", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Profile unavailable");
        return response.json() as Promise<{ settings: UserTerminalSettings }>;
      })
      .then((payload) => {
        setView(payload.settings.view);
        setStrategy(payload.settings.strategy);
        setRisk(payload.settings.risk);
        setOrderFlowSettings(payload.settings.orderFlow);
        const stored =
          user.role === "viewer"
            ? JSON.parse(sessionStorage.getItem("dizy-viewer-market") || "null")
            : payload.settings.market;
        if (stored) {
          const storedKey = stored.marketKey || (String(stored.symbol).startsWith("mexc:") ? stored.symbol : `mexc:futures:${stored.symbol || "BTC_USDT"}`);
          setSelectedMarketKey(storedKey);
          setSymbol(storedKey.split(":").at(-1) || "BTC_USDT");
          setTimeframe(stored.timeframe || "15m");
          setFavourites(stored.favourites || []);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setSaveState("error");
      });
    return () => controller.abort();
  }, [user.role]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/markets?exchange=mexc`,
        { signal: controller.signal },
      )
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((payload: { markets: MarketDescriptor[] }) =>
          setMarkets(payload.markets),
        )
        .catch(() => {
          if (!controller.signal.aborted) setMarkets([]);
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (user.role === "viewer")
      sessionStorage.setItem(
        "dizy-viewer-market",
        JSON.stringify({ symbol, marketKey: selectedMarketKey, timeframe, favourites }),
      );
  }, [favourites, symbol, selectedMarketKey, timeframe, user.role]);

  const applyPaperSettings = async () => {
    setSaveState("saving");
    try {
      const profileResponse = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          view,
          strategy,
          risk,
          orderFlow: orderFlowSettings,
          market: { exchange: "mexc", symbol, marketKey: selectedMarketKey, timeframe, favourites },
        }),
      });
      if (!profileResponse.ok) throw new Error("Could not save settings");
      if (executionMode === "Paper") {
        const paperResponse = await fetch("/api/paper", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            symbol: selectedMarketKey,
            timeframe,
            summary: backtest,
          }),
        });
        if (!paperResponse.ok) throw new Error("Could not save paper run");
      }
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 2200);
    } catch {
      setSaveState("error");
    }
  };

  const resetPreset = () => {
    setView(DEFAULT_VIEW);
    setStrategy(DEFAULT_STRATEGY);
    setRisk({
      ...DEFAULT_RISK,
      riskPct: DEFAULT_RISK.riskPct,
      maxNotional: DEFAULT_RISK.maxNotional,
    });
    setOrderFlowSettings(DEFAULT_ORDER_FLOW_SETTINGS);
    setSaveState("idle");
  };

  const setViewKey = <K extends keyof ViewSettings>(
    key: K,
    value: ViewSettings[K],
  ) => setView((current) => ({ ...current, [key]: value }));
  const setStrategyValue = <K extends keyof typeof strategy>(
    key: K,
    value: (typeof strategy)[K],
  ) => setStrategy((current) => ({ ...current, mode: "custom", [key]: value }));
  const setStrategyMode = (mode: StrategyMode) =>
    setStrategy((current) => ({ ...current, mode }));
  const setAppearanceColour = (
    group: "chart" | "candles" | "indicators" | "structure" | "profile",
    key: string,
    value: string,
  ) =>
    setView((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        preset: "custom",
        [group]: { ...current.appearance[group], [key]: value },
      },
    }));
  const applyAppearancePreset = (
    preset: Exclude<ChartAppearanceSettings["preset"], "custom">,
  ) =>
    setView((current) => ({
      ...current,
      appearance: structuredClone(APPEARANCE_PRESETS[preset]),
    }));

  return (
    <main className="terminal-shell">
      <DizyBrainSnapshotPublisher data={{ snapshot: dizyBrainSnapshot, liveFlow: replayActive?null:orderFlow.intelligence?.symbol === symbol ? orderFlow.intelligence : null, historicalFlowReplay, historicalFlowState:historicalFlow, replaySession:activeReplaySession, symbol, market: selectedMarket?.displayName ?? selectedMarketKey, timeframe, feedState: demo ? "Demo" : realtimeStatus, replay: replayActive, flowEnabled: orderFlowSettings.enabled, viewer: user.role === "viewer" }} />
      <DizyQuantSnapshotPublisher data={{ snapshot: dizyBrainSnapshot, liveFlow: replayActive?null:orderFlow.intelligence?.symbol === symbol ? orderFlow.intelligence : null, historicalFlowReplay, historicalFlowState:historicalFlow, replaySession:activeReplaySession, symbol, market: selectedMarket?.displayName ?? selectedMarketKey, timeframe, feedState: demo ? "Demo" : realtimeStatus, replay: replayActive, flowEnabled: orderFlowSettings.enabled, viewer: user.role === "viewer" }} />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>DizyTrades</strong>
            <small>&amp; DizySignals</small>
          </div>
        </div>
        <div className="system-strip">
          <button
            className={terminalTab === "charts" ? "nav-tab active" : "nav-tab"}
            onClick={() => {
              setTerminalTab("charts");
              if (view.autoFitOnMarketChange)
                setViewportReset((value) => value + 1);
            }}
            type="button"
          >
            DizyCharts
          </button>
          <button
            className={
              terminalTab === "explorer" ? "nav-tab active" : "nav-tab"
            }
            onClick={() => setTerminalTab("explorer")}
            type="button"
          >
            TradingView Explorer
          </button>
          <a className="nav-tab school-terminal-link" href="/school" target="_blank" rel="noopener noreferrer" title={`Open ${SCHOOL_DISPLAY_NAME} in a new tab`}>
            {SCHOOL_DISPLAY_NAME} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span>
          </a>
          <span
            className={`connection realtime-${demo ? "demo" : realtimeStatus}`}
          >
            <i />{" "}
            {demo
              ? "DEMO"
              : realtimeStatus === "live"
                ? "LIVE"
                : realtimeStatus === "delayed"
                  ? "DELAYED / REST ONLY"
                  : realtimeStatus.toUpperCase()}
          </span>
          <span className="confirmed">
            Confirmed candles · Live market data · simulation only
          </span>
          <span className="test-mode">Private test mode</span>
          <span className="lock-status">Live execution locked</span>
          
          {user.role === "viewer" ? (
            <span className="viewer-badge">VIEWER — READ ONLY</span>
          ) : null}
        </div>
        <div className="profile">
          <div className="account-switch static-account">
            <span>{user.name.slice(0, 1)}</span>
            <b>{user.name}</b>
            <em>{user.role}</em>
          </div>
          {user.role !== "viewer" ? (
            <button
              aria-label="Open settings"
              className="icon-button"
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              ⚙
            </button>
          ) : null}
          <a
            aria-label={user.role === "viewer" ? "Exit viewer" : "Sign out"}
            className="icon-button signout-button"
            href="/api/auth/logout"
          >
            ↗
          </a>
        </div>
      </header>

      <div className="terminal-body-layout">
      <section className="terminal-primary-column" aria-label="Trading terminal workspace">
      <section className={`replay-controls ${replayActive?"active":""}`} aria-label="Replay controls" tabIndex={replayActive?0:undefined} aria-keyshortcuts="Space ArrowLeft ArrowRight Home End" onKeyDown={event=>{if(!activeReplaySession)return;const target=event.target as HTMLElement;if(target.matches("input,textarea,select,[contenteditable='true']"))return;const actions:Record<string,()=>void>={" ":()=>setReplaySession(s=>s?{...s,status:s.status==="playing"?"paused":s.cursorIndex===replayCandles.length-1?"ended":"playing"}:s),ArrowLeft:()=>setReplaySession(s=>s?stepReplay({...s,status:"paused"},replayCandles,-1):s),ArrowRight:()=>setReplaySession(s=>s?stepReplay({...s,status:"paused"},replayCandles,1):s),Home:()=>setReplaySession(s=>s?jumpReplay(s,replayCandles,0):s),End:()=>setReplaySession(s=>s?jumpReplay(s,replayCandles,replayCandles.length-1):s)};if(actions[event.key]){event.preventDefault();actions[event.key]();}}}>
        {journalReplayNotice?<span role="status">{journalReplayNotice}</span>:null}
        {!activeReplaySession?<button type="button" onClick={enterReplay} disabled={!closedCandles.length}>Enter Replay</button>:<>
          <strong>REPLAY MODE</strong><span>{activeReplaySession.symbol} · {activeReplaySession.timeframe}</span>
          <button aria-label="Jump to beginning" disabled={activeReplaySession.cursorIndex<=0} type="button" onClick={()=>setReplaySession(s=>s?jumpReplay(s,replayCandles,0):s)}>⏮</button>
          <button aria-label="Previous candle" disabled={activeReplaySession.cursorIndex<=0} type="button" onClick={()=>setReplaySession(s=>s?stepReplay({...s,status:"paused"},replayCandles,-1):s)}>◀</button>
          <button aria-label={activeReplaySession.status==="playing"?"Pause replay":activeReplaySession.status==="ended"?"Replay complete":"Play replay"} aria-pressed={activeReplaySession.status==="playing"} disabled={activeReplaySession.status==="ended"} type="button" onClick={()=>setReplaySession(s=>s?{...s,status:s.status==="playing"?"paused":"playing"}:s)}>{activeReplaySession.status==="playing"?"Pause":activeReplaySession.status==="ended"?"Replay Complete":"Play"}</button>
          <button aria-label="Next candle" disabled={activeReplaySession.cursorIndex>=replayCandles.length-1} type="button" onClick={()=>setReplaySession(s=>s?stepReplay({...s,status:"paused"},replayCandles,1):s)}>▶</button>
          <button aria-label="Jump to end" disabled={activeReplaySession.cursorIndex>=replayCandles.length-1} type="button" onClick={()=>setReplaySession(s=>s?jumpReplay(s,replayCandles,replayCandles.length-1):s)}>⏭</button>
          <label>Speed <select value={String(activeReplaySession.speed)} onChange={event=>setReplaySession(s=>s?{...s,speed:validReplaySpeed(event.target.value)}:s)}>{[0.25,0.5,1,2,5,10].map(speed=><option value={speed} key={speed}>{speed}×</option>)}</select></label>
          <progress aria-label="Replay progress" max={replayCandles.length} value={activeReplaySession.visibleCandles}/>
          <time dateTime={activeReplaySession.cursorTimeMs?new Date(activeReplaySession.cursorTimeMs).toISOString():undefined}>{activeReplaySession.cursorTimeMs?`${new Date(activeReplaySession.cursorTimeMs).toISOString().replace("T"," ").slice(0,16)} UTC`:"No candles"}</time>
          <span>Candle {activeReplaySession.visibleCandles} / {activeReplaySession.candlesLoaded} · {activeReplaySession.candlesLoaded?((activeReplaySession.visibleCandles/activeReplaySession.candlesLoaded)*100).toFixed(1):"0.0"}% · {activeReplaySession.status} · {activeReplaySession.speed}×</span>
          <span className="replay-flow-note">{historicalFlow.status==="loading"?"Loading Historical DizyFlow…":historicalFlow.status==="error"?historicalFlow.message:historicalFlow.status==="unavailable"?historicalFlow.reason:historicalFlowReplay?.status==="unavailable"?(historicalFlowReplay.unavailableReason==="sample-too-old"?"The latest retained DizyFlow sample is outside the permitted historical matching window.":"No retained DizyFlow sample is available for this point."):`Historical DizyFlow · ${historicalFlowReplay?.status}`}</span>
          <button type="button" onClick={exitReplay}>Exit Replay</button>
        </>}
      </section>

      {terminalTab === "explorer" ? (
        <TradingViewExplorer
          nativeChart={
            <DizyChart
              applyDefaultsNonce={applyDrawingDefaultsNonce}
              analysis={analysis}
              displayCandles={displayCandles}
              countdownSeconds={countdownSeconds}
              liveCandle={liveCandle}
              readOnly={user.role === "viewer"}
              exchange={dexSelected ? "raydium" : "mexc"}
              resetKey={viewportReset}
              symbol={symbol}
              timeframe={timeframe}
              flowStore={orderFlow.renderStore}
              replayMode={replayActive}
              view={view}
            />
          }
          symbol={symbol}
          timeframe={timeframe}
        />
      ) : (
        <>
          <section className="market-toolbar">
            <div className="symbol-block">
              <button
                aria-expanded={selectorOpen}
                aria-label="Search MEXC and DizyDEX markets"
                className="symbol-selector"
                ref={marketTrigger}
                onClick={() => setSelectorOpen((value) => !value)}
                type="button"
              >
                <span className="coin">{(selectedDexMarket?.symbol ?? selectedMarket?.baseAsset ?? symbol.split("_")[0]).slice(0, 1)}</span>
                <span>
                  <strong>{selectedDexMarket ? `${selectedDexMarket.symbol} / ${selectedDexMarket.quoteSymbol}` : selectedMarket?.displayName ?? symbol.replace("_", " / ")}</strong>
                  <small>{selectedDexMarket ? `${selectedDexMarket.dex.toUpperCase()} · ${selectedDexMarket.chain.toUpperCase()} DEX` : `MEXC · ${selectedMarket ? marketBadge(selectedMarket) : "PERP"}`} ▾</small>
                </span>
              </button>
              {selectorOpen ? (
                <MarketBrowser
                  anchorRef={marketTrigger}
                  markets={markets}
                  selectedMarketKey={selectedMarketKey}
                  selectedDexMarketKey={selectedDexMarket?.key}
                  favourites={favourites}
                  onFavourite={(key)=>setFavourites(items=>items.includes(key)?items.filter(item=>item!==key):[...items,key])}
                  onClose={()=>{setSelectorOpen(false);requestAnimationFrame(()=>marketTrigger.current?.focus())}}
                  onSelect={(market)=>{
                    setSelectedDexMarket(null);
                    setSymbol(market.sourceSymbol);
                    setSelectedMarketKey(market.key);
                    setSettingsOpen(false);
                    setSelectorOpen(false);
                    requestAnimationFrame(()=>marketTrigger.current?.focus());
                  }}
                  onSelectDex={(market)=>{
                    setSelectedDexMarket(market);
                    setRealtimeStatus("delayed");
                    setSymbol(`${market.symbol}_${market.quoteSymbol}`);
                    setSelectedMarketKey(`dex:${market.key}`);
                    if (market.poolAddress===DIZY_USDT_POOL || !supportsDexChartTimeframe(timeframe)) setTimeframe("1m");
                    setExecutionMode("Off");
                    setSettingsOpen(false);
                    setSelectorOpen(false);
                    requestAnimationFrame(()=>marketTrigger.current?.focus());
                  }}
                />
              ) : null}
            </div>
            {user.role!=="viewer" && futuresSelected?<div className="manual-quick"><span>MANUAL PAPER</span><button className="sell" onClick={()=>window.dispatchEvent(new CustomEvent("manual-paper-quick",{detail:"short"}))}>SELL</button><b>{last?currency.format(liveLastPrice??last.close):"—"}</b><button className="buy" onClick={()=>window.dispatchEvent(new CustomEvent("manual-paper-quick",{detail:"long"}))}>BUY</button></div>:null}
        <div className="quote-block">
              <strong>
                {last ? currency.format(liveLastPrice ?? last.close) : "—"}
              </strong>
              <span className={change >= 0 ? "positive" : "negative"}>
                {signed(change)}
              </span>
              {view.countdownToolbar && countdownSeconds !== null ? (
                <small
                  className={
                    countdownSeconds <= 10 ? "countdown closing" : "countdown"
                  }
                >
                  Candle closes in{" "}
                  {formatCountdown(
                    countdownSeconds,
                    timeframe as CandleTimeframe,
                  )}
                </small>
              ) : null}
            </div>
            <div className="toolbar-divider" />
            <div
              className="timeframes"
              aria-label="Chart timeframe"
              ref={timeframeStrip}
              role="group"
              tabIndex={0}
            >
              {ALL_TIMEFRAMES.filter((item) => !dexSelected || supportsDexChartTimeframe(item)).map((item) => (
                <button
                  aria-pressed={timeframe === item}
                  className={timeframe === item ? "active" : ""}
                  key={item}
                  onClick={() => {setTimeframe(item);setSettingsOpen(false)}}
                  title={TIMEFRAME_TITLES[item]}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <div
              className="chart-view-actions"
              aria-label="Chart view controls"
            >
              <button
                aria-label="Reset chart view"
                onClick={() => chartControls.current?.resetView()}
                title="Reset view — automatically fit candles and overlays"
                type="button"
              >
                Reset view
              </button>
              <button
                aria-label="Go to live chart position"
                onClick={() => chartControls.current?.goToLive()}
                title="Go to live — move to the latest candle (does not enable live trading)"
                type="button"
              >
                Go to live
              </button>
            </div>
            <div className="toolbar-divider" />
            <label className="preset-button">
              <span>Preset</span>
              <select
                aria-label="Strategy preset"
                value={strategy.mode}
                onChange={(e) =>
                  setStrategyMode(e.target.value as StrategyMode)
                }
              >
                <option value="scalp-15m">Scalping · 15m</option>
                <option value="pine-v1-exact">Pine V1 Exact</option>
                <option value="swing-1h-4h">Swing · 1H/4H</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <button
              className="refresh-button"
              disabled={backgroundSyncing}
              onClick={() =>
                void loadMarketData({ reason: "manual", resetView: false })
              }
              type="button"
            >
              {backgroundSyncing ? "Syncing…" : "Refresh data"}
            </button>
            <div className="toolbar-spacer" />
            {!replayActive && !dexSelected ? <OrderFlowToolbar settings={orderFlowSettings} onChange={setOrderFlowSettings} summary={orderFlow.summary} intelligence={orderFlow.intelligence} renderStore={orderFlow.renderStore} onRetry={orderFlow.retry} onHistory={()=>setFlowHistoryOpen(true)} /> : null}
            {!replayActive && !dexSelected ? <DizyFlowToastRail alerts={orderFlow.summary.alerts} settings={orderFlowSettings} onHistory={()=>setFlowHistoryOpen(true)} /> : null}
            <div className="mode-control" aria-label="Execution mode">
              {(["Off", "Paper"] as const).map((mode) => (
                <button
                  className={executionMode === mode ? "active" : ""}
                  key={mode}
                  onClick={() => setExecutionMode(mode)}
                  type="button"
                >
                  {mode}
                </button>
              ))}
              <button
                className="live-disabled"
                disabled
                title="Live trading is deliberately unavailable in this review build"
                type="button"
              >
                Live 🔒
              </button>
            </div>
          </section>
          <DizyFlowAlertHistory alerts={orderFlow.summary.alerts} open={flowHistoryOpen} onClose={()=>setFlowHistoryOpen(false)} onClear={orderFlow.clear}/>
          {view.showSimulationPerformance ? (
            <PaperPerformanceToolbar
              enabled={executionMode === "Paper"}
              readOnly={user.role === "viewer"}
              completionIdentity={paperCompletionIdentity}
              journalContext={{symbol,market:selectedMarket?.displayName??symbol,marketKey:selectedMarketKey,timeframe:timeframe as CandleTimeframe,replay:{marketKey:selectedMarketKey,symbol,timeframe:timeframe as CandleTimeframe,candles:closedCandles}}}
              error={resultMarketKey !== marketKey ? feedError : null}
              onRetry={() => {
                if (resultMarketKey !== marketKey) void loadMarketData({ reason: "reconnect", resetView: false });
                else setSimulationRetry(value => value + 1);
              }}
              snapshot={simulation.result ? paperSnapshot : null}
              status={resultMarketKey !== marketKey && feedError === "Insufficient confirmed candle history." ? "insufficient-history" : resultMarketKey !== marketKey && feedError ? "error" : simulation.status}
            />
          ) : null}

          <div className={`workspace ${settingsOpen ? "" : "panel-closed"}`}>
            {!replayActive&&orderFlowSettings.enabled&&orderFlowSettings.domVisible&&selectedMarket?<DizyFlowDom store={orderFlow.renderStore} summary={orderFlow.summary} contractSize={selectedMarket?.contractSize??1} market={selectedMarket!} onGrouping={step=>setOrderFlowSettings(value=>({...value,dom:{...value.dom,groupingBySymbol:{...value.dom.groupingBySymbol,[symbol]:step}}}))} onWidth={width=>setOrderFlowSettings(value=>({...value,dom:{...value.dom,width}}))} onDomSettings={patch=>setOrderFlowSettings(value=>({...value,dom:{...value.dom,...patch}}))} onClose={()=>setOrderFlowSettings(value=>({...value,domVisible:false}))}/>:null}
            <section className="chart-section">
              <div className="chart-status-row">
                <div>
                  <span className={`bias-pill ${signalColour}`}>
                    {analysis.bias} bias
                  </span>
                  <strong>
                    Confluence{" "}
                    {Math.max(analysis.scoreLong, analysis.scoreShort)} / 5
                  </strong>
                  <span>{analysis.phase}</span>
                </div>
                <div>
                  <span>{dataSource}</span>
                  <span>{closedCandles.length} confirmed bars</span>
                  <span>Last signal: {analysis.lastSignal}</span>
                </div>
              </div>
              {feedError ? (
                <div className="feed-error" role="alert">
                  <strong>{feedError}</strong>
                  <span>Real data was not replaced automatically.</span>
                  <button
                    onClick={() => {
                      dispatchTimeline({
                        type: "demonstrationData",
                        marketKey,
                        closed: generateDemoCandles(),
                      });
                      setDataSource("DEMONSTRATION DATA");
                      setFeedError("");
                    }}
                    type="button"
                  >
                    Use demonstration data
                  </button>
                </div>
              ) : initialLoading && !closedCandles.length ? (
                <div className="chart-skeleton">Loading closed candles…</div>
              ) : (
                <><ChartErrorBoundary
                  marketKey={marketKey}
                  onReload={() => setViewportReset((value) => value + 1)}
                >
                  <DizyChart
                    key={viewportReset}
                    applyDefaultsNonce={applyDrawingDefaultsNonce}
                    analysis={analysis}
                    displayCandles={displayCandles}
                    countdownSeconds={countdownSeconds}
                    liveCandle={liveCandle}
                    readOnly={user.role === "viewer"}
                    exchange={dexSelected ? "raydium" : "mexc"}
                    ref={chartControls}
                    resetKey={viewportReset}
                    symbol={symbol}
                    timeframe={timeframe}
                    flowStore={orderFlow.renderStore}
                    replayMode={replayActive}
                    view={view}
                  />
                </ChartErrorBoundary></>
              )}
              <div className="signal-dock">
                <article>
                  <span>Current setup</span>
                  <strong className={signalColour}>{analysis.bias}</strong>
                  <small>{analysis.lastSignal}</small>
                </article>
                <article>
                  <span>Long confluence</span>
                  <strong>{analysis.scoreLong} / 5</strong>
                  <div className="score-track">
                    <i style={{ width: `${analysis.scoreLong * 20}%` }} />
                  </div>
                </article>
                <article>
                  <span>Short confluence</span>
                  <strong>{analysis.scoreShort} / 5</strong>
                  <div className="score-track red">
                    <i style={{ width: `${analysis.scoreShort * 20}%` }} />
                  </div>
                </article>
                <article>
                  <span>Risk gate</span>
                  <strong>
                    {risk.riskPct}% · {risk.leverage}×
                  </strong>
                  <small>Max {currency.format(risk.maxNotional)}</small>
                </article>
                <article className="paper-card">
                  <span>
                    {executionMode === "Paper"
                      ? "Historical paper run"
                      : "Engine"}
                  </span>
                  <strong
                    className={
                      backtest.returnPct >= 0 ? "positive" : "negative"
                    }
                  >
                    {executionMode === "Paper"
                      ? signed(backtest.returnPct)
                      : "Signals only"}
                  </strong>
                  <small>
                    {executionMode === "Paper"
                      ? `${backtest.trades} trades · ${backtest.winRatePct.toFixed(0)}% win`
                      : "Live orders blocked"}
                  </small>
                </article>
              </div>
            </section>

            {settingsOpen && user.role !== "viewer" ? (
              <aside
                className="settings-panel"
                aria-label="DizySignals settings"
              >
                <div className="panel-heading">
                  <div>
                    <small>{user.name}&apos;s private workspace</small>
                    <strong>Signal settings</strong>
                  </div>
                  <button
                    aria-label="Close settings"
                    onClick={() => setSettingsOpen(false)}
                    type="button"
                  >
                    ×
                  </button>
                </div>
                <div className="panel-tabs">
                  {(["visuals", "strategy", "risk", "dizyflow"] as const).map((panel) => (
                    <button
                      className={activePanel === panel ? "active" : ""}
                      key={panel}
                      onClick={() => setActivePanel(panel)}
                      type="button"
                    >
                      {panel}
                    </button>
                  ))}
                </div>

                <div className="panel-scroll">
                  {activePanel === "visuals" ? (
                    <>
                      <div className="visual-subtabs" role="tablist">
                        {(
                          ["layers", "layout", "lines", "colours"] as const
                        ).map((tab) => (
                          <button
                            className={visualTab === tab ? "active" : ""}
                            key={tab}
                            onClick={() => setVisualTab(tab)}
                            type="button"
                          >
                            {tab === "layout"
                              ? "Labels & layout"
                              : tab === "lines"
                                ? "Lines & channels"
                                : tab}
                          </button>
                        ))}
                      </div>
                      {visualTab === "layers" ? (
                        <div className="setting-section">
                          <h3>Chart layers</h3>
                          <IndicatorToggle
                            checked={view.indicatorPackage}
                            colour="#8b7cff"
                            label="DizyTrades Indicator Package"
                            onChange={(value) =>
                              setViewKey("indicatorPackage", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.supportResistance}
                            colour={view.appearance.structure.supportLine}
                            label="Support & resistance zones"
                            onChange={(value) =>
                              setViewKey("supportResistance", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.showLevelTouches}
                            colour={view.appearance.structure.supportLine}
                            label="Show S/R touches"
                            onChange={(value) =>
                              setViewKey("showLevelTouches", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.vwap}
                            colour={view.appearance.indicators.vwap}
                            label="Rolling VWAP"
                            onChange={(value) => setViewKey("vwap", value)}
                          />
                          <IndicatorToggle
                            checked={view.fibonacci}
                            colour={view.appearance.structure.fibonacciLine}
                            label="Fibonacci levels"
                            onChange={(value) => setViewKey("fibonacci", value)}
                          />
                          <IndicatorToggle
                            checked={view.channels}
                            colour={view.appearance.indicators.regression}
                            label="Regression channel"
                            onChange={(value) => setViewKey("channels", value)}
                          />
                          <IndicatorToggle
                            checked={view.trendlines}
                            colour={view.appearance.indicators.bullTrendline}
                            label="Pivot trendlines"
                            onChange={(value) =>
                              setViewKey("trendlines", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.triangles}
                            colour={
                              view.appearance.structure.bearishTriangleBorder
                            }
                            label="Triangle outlines"
                            onChange={(value) => setViewKey("triangles", value)}
                          />
                          <IndicatorToggle
                            checked={view.completedPatternFills}
                            colour={view.appearance.structure.elliottFill}
                            label="Completed pattern fills"
                            onChange={(value) =>
                              setViewKey("completedPatternFills", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.volumeProfile}
                            colour={view.appearance.profile.bull}
                            label="Right volume profile"
                            onChange={(value) =>
                              setViewKey("volumeProfile", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.waves}
                            colour={view.appearance.structure.waveMarker}
                            label="Elliott/Wyckoff stage bubbles"
                            onChange={(value) => setViewKey("waves", value)}
                          />
                          <IndicatorToggle
                            checked={view.provisionalStages}
                            colour={view.appearance.structure.provisionalBorder}
                            label="Provisional ? stages"
                            onChange={(value) =>
                              setViewKey("provisionalStages", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.signals}
                            colour={view.appearance.structure.buyMarker}
                            label="BUY/SELL signal bubbles"
                            onChange={(value) => setViewKey("signals", value)}
                          />
                          <IndicatorToggle
                            checked={view.showSimulationPerformance}
                            colour="#8b7cff"
                            label="Show simulation performance in toolbar"
                            onChange={(value) =>
                              setViewKey("showSimulationPerformance", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.realtimeChartUpdates}
                            colour="#2ee6a6"
                            label="Real-time chart updates"
                            onChange={(value) =>
                              setViewKey("realtimeChartUpdates", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.countdownToolbar}
                            colour="#ffd071"
                            label="Countdown in toolbar"
                            onChange={(value) =>
                              setViewKey("countdownToolbar", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.countdownPriceMarker}
                            colour={view.appearance.chart.livePrice}
                            label="Countdown on price marker"
                            onChange={(value) =>
                              setViewKey("countdownPriceMarker", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.autoFitOnMarketChange}
                            colour="#57a5ff"
                            label="Auto-fit on market change"
                            onChange={(value) =>
                              setViewKey("autoFitOnMarketChange", value)
                            }
                          />
                          <RangeField
                            label="Volume lookback"
                            max={600}
                            min={60}
                            onChange={(value) =>
                              setViewKey("volumeBars", value)
                            }
                            step={20}
                            suffix="candles"
                            value={view.volumeBars}
                          />
                          <p className="field-help">
                            How many historical candles are analysed.
                          </p>
                          <label className="field-row">
                            <span>Profile bar size</span>
                            <select
                              aria-label="Profile bar size"
                              value={profileBarPreset(view.volumeRows)}
                              onChange={(event) => {
                                const preset = event.target
                                  .value as keyof typeof PROFILE_BAR_PRESETS;
                                if (preset in PROFILE_BAR_PRESETS)
                                  setViewKey(
                                    "volumeRows",
                                    PROFILE_BAR_PRESETS[preset],
                                  );
                              }}
                            >
                              <option>Large</option>
                              <option>Medium</option>
                              <option>Small</option>
                              <option>Very small</option>
                              <option disabled value="Custom">
                                Custom
                              </option>
                            </select>
                          </label>
                          <RangeField
                            label="Volume profile bars"
                            max={240}
                            min={12}
                            onChange={(value) =>
                              setViewKey("volumeRows", value)
                            }
                            step={4}
                            suffix="bars"
                            value={view.volumeRows}
                          />
                          <p className="field-help">
                            More bars create thinner, more detailed price rows.
                          </p>
                          <RangeField
                            label="Profile opacity"
                            max={1}
                            min={0}
                            step={0.05}
                            onChange={(value) =>
                              setViewKey("profileOpacity", value)
                            }
                            value={view.profileOpacity}
                          />
                          <IndicatorToggle
                            checked={view.showProfileHeading}
                            colour={view.appearance.profile.heading}
                            label="Profile heading"
                            onChange={(value) =>
                              setViewKey("showProfileHeading", value)
                            }
                          />
                        </div>
                      ) : null}
                      {visualTab === "layout" ? (
                        <div className="setting-section">
                          <h3>Labels & reserved lanes</h3>
                          <label className="field-row">
                            <span>Label size</span>
                            <select
                              value={view.labelSize}
                              onChange={(e) =>
                                setViewKey(
                                  "labelSize",
                                  e.target.value as ViewSettings["labelSize"],
                                )
                              }
                            >
                              <option>Small</option>
                              <option>Medium</option>
                              <option>Large</option>
                            </select>
                          </label>
                          <label className="field-row">
                            <span>Pattern bubble size</span>
                            <select
                              value={view.patternBubbleSize}
                              onChange={(e) =>
                                setViewKey(
                                  "patternBubbleSize",
                                  e.target
                                    .value as ViewSettings["patternBubbleSize"],
                                )
                              }
                            >
                              <option>Small</option>
                              <option>Medium</option>
                              <option>Large</option>
                            </select>
                          </label>
                          <label className="field-row">
                            <span>Signal bubble size</span>
                            <select
                              value={view.signalBubbleSize}
                              onChange={(e) =>
                                setViewKey(
                                  "signalBubbleSize",
                                  e.target
                                    .value as ViewSettings["signalBubbleSize"],
                                )
                              }
                            >
                              <option>Tiny</option>
                              <option>Small</option>
                              <option>Medium</option>
                              <option>Large</option>
                              <option>Extra Large</option>
                            </select>
                          </label>
                          <label className="field-row">
                            <span>Signal detail</span>
                            <select
                              value={view.signalDetail}
                              onChange={(e) =>
                                setViewKey(
                                  "signalDetail",
                                  e.target
                                    .value as ViewSettings["signalDetail"],
                                )
                              }
                            >
                              <option>Direction only</option>
                              <option>Direction + confluence</option>
                            </select>
                          </label>
                          <label className="field-row">
                            <span>Signal placement</span>
                            <select
                              value={view.signalPlacement}
                              onChange={(e) =>
                                setViewKey(
                                  "signalPlacement",
                                  e.target
                                    .value as ViewSettings["signalPlacement"],
                                )
                              }
                            >
                              <option value="side-aware">Side-aware</option>
                              <option value="above">Above candle</option>
                              <option value="below">Below candle</option>
                            </select>
                          </label>
                          <RangeField
                            label="Signal distance"
                            max={80}
                            min={0}
                            onChange={(value) =>
                              setViewKey("signalDistance", value)
                            }
                            suffix="px"
                            value={view.signalDistance}
                          />
                          <IndicatorToggle
                            checked={view.showHistoricalSignals}
                            colour={view.appearance.structure.buyMarker}
                            label="Show historical automatic signals"
                            onChange={(value) =>
                              setViewKey("showHistoricalSignals", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.showManualPaperMarkers}
                            colour="#ffd071"
                            label="Show manual paper-trade markers"
                            onChange={(value) =>
                              setViewKey("showManualPaperMarkers", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.showPatternConnectors}
                            colour="#8994ad"
                            label="Pattern label connector lines"
                            onChange={(value) =>
                              setViewKey("showPatternConnectors", value)
                            }
                          />
                          <PlacementField
                            label="S/R labels"
                            value={view.srLabelPlacement}
                            onChange={(value) =>
                              setViewKey("srLabelPlacement", value)
                            }
                          />
                          <PlacementField
                            label="Fibonacci labels"
                            value={view.fibLabelPlacement}
                            onChange={(value) =>
                              setViewKey("fibLabelPlacement", value)
                            }
                          />
                          <label className="field-row">
                            <span>Pattern labels</span>
                            <select
                              value={view.patternLabelPlacement}
                              onChange={(e) =>
                                setViewKey(
                                  "patternLabelPlacement",
                                  e.target
                                    .value as ViewSettings["patternLabelPlacement"],
                                )
                              }
                            >
                              <option value="above">Above pattern</option>
                              <option value="inside">Inside pattern</option>
                              <option value="below">Below pattern</option>
                              <option value="left">Left of pattern</option>
                              <option value="right">Right of pattern</option>
                              <option value="hidden">Hidden labels</option>
                            </select>
                          </label>
                          <RangeField
                            label="Horizontal offset"
                            max={80}
                            min={0}
                            onChange={(value) =>
                              setViewKey("labelOffset", value)
                            }
                            suffix="px"
                            value={view.labelOffset}
                          />
                          <RangeField
                            label="Label padding"
                            max={20}
                            min={2}
                            onChange={(value) =>
                              setViewKey("labelPadding", value)
                            }
                            suffix="px"
                            value={view.labelPadding}
                          />
                          <IndicatorToggle
                            checked={view.compactLabels}
                            colour="#8994ad"
                            label="Compact labels"
                            onChange={(value) =>
                              setViewKey("compactLabels", value)
                            }
                          />
                          <RangeField
                            label="Profile width"
                            max={30}
                            min={10}
                            onChange={(value) =>
                              setViewKey("profileWidthPct", value)
                            }
                            suffix="%"
                            value={view.profileWidthPct}
                          />
                          <RangeField
                            label="Profile maximum"
                            max={320}
                            min={100}
                            onChange={(value) =>
                              setViewKey("profileMaxWidth", value)
                            }
                            step={10}
                            suffix="px"
                            value={view.profileMaxWidth}
                          />
                          <RangeField
                            label="Profile inset"
                            max={40}
                            min={0}
                            onChange={(value) =>
                              setViewKey("profileInset", value)
                            }
                            suffix="px"
                            value={view.profileInset}
                          />
                          <button
                            className="reset-appearance"
                            onClick={() =>
                              setView((current) => ({
                                ...current,
                                ...DEFAULT_VIEW,
                                appearance: current.appearance,
                              }))
                            }
                            type="button"
                          >
                            Reset labels / layout
                          </button>
                        </div>
                      ) : null}
                      {visualTab === "lines" ? (
                        <div className="setting-section">
                          <h3>Line extensions</h3>
                          <label className="field-row">
                            <span>Global line extension override</span>
                            <select
                              value={view.globalLineExtensionOverride}
                              onChange={(e) =>
                                setViewKey(
                                  "globalLineExtensionOverride",
                                  e.target
                                    .value as ViewSettings["globalLineExtensionOverride"],
                                )
                              }
                            >
                              <option value="individual">
                                Use individual settings
                              </option>
                              <option value="none">None</option>
                              <option value="left">Left</option>
                              <option value="right">Right</option>
                              <option value="both">Both</option>
                            </select>
                          </label>
                          <IndicatorToggle
                            checked={view.fadeExtendedPortions}
                            colour={view.appearance.indicators.bullTrendline}
                            label="Fade extended portions"
                            onChange={(value) =>
                              setViewKey("fadeExtendedPortions", value)
                            }
                          />
                          <h3>Manual drawing defaults</h3>
                          <ExtensionField
                            label="Trend line default extension"
                            value={view.manualTrendLineExtension}
                            onChange={(value) =>
                              setViewKey("manualTrendLineExtension", value)
                            }
                          />
                          <ExtensionField
                            label="Ray default extension"
                            value={view.manualRayExtension}
                            onChange={(value) =>
                              setViewKey("manualRayExtension", value)
                            }
                          />
                          <label className="field-row">
                            <span>Horizontal line default extension</span>
                            <select
                              value={view.manualHorizontalLineExtension}
                              onChange={(e) =>
                                setViewKey(
                                  "manualHorizontalLineExtension",
                                  e.target
                                    .value as ViewSettings["manualHorizontalLineExtension"],
                                )
                              }
                            >
                              <option value="left">Left</option>
                              <option value="right">Right</option>
                              <option value="both">Both</option>
                            </select>
                          </label>
                          <ExtensionField
                            label="Parallel channel default extension"
                            value={view.manualChannelExtension}
                            onChange={(value) =>
                              setViewKey("manualChannelExtension", value)
                            }
                          />
                          <ExtensionField
                            label="Fibonacci default extension"
                            value={view.manualFibonacciExtension}
                            onChange={(value) =>
                              setViewKey("manualFibonacciExtension", value)
                            }
                          />
                          <button
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Apply extension defaults to all unlocked compatible drawings?",
                                )
                              )
                                setApplyDrawingDefaultsNonce((n) => n + 1);
                            }}
                            type="button"
                          >
                            Apply defaults to existing drawings
                          </button>
                          <h3>Pivot trendlines</h3>
                          <p className="field-help">
                            Line extension reaches the visible plot edge and
                            updates when the chart is panned or zoomed.
                          </p>
                          <IndicatorToggle
                            checked={view.trendlines}
                            colour={view.appearance.indicators.bullTrendline}
                            label="Show pivot trendlines"
                            onChange={(value) =>
                              setViewKey("trendlines", value)
                            }
                          />
                          <ExtensionField
                            label="Pivot extension"
                            value={view.pivotTrendlineExtension}
                            onChange={(value) =>
                              setViewKey("pivotTrendlineExtension", value)
                            }
                          />
                          <RangeField
                            label="Pivot width"
                            max={5}
                            min={1}
                            onChange={(value) =>
                              setViewKey("pivotTrendlineWidth", value)
                            }
                            suffix="px"
                            value={view.pivotTrendlineWidth}
                          />
                          <label className="field-row">
                            <span>Pivot style</span>
                            <select
                              value={view.pivotTrendlineStyle}
                              onChange={(e) =>
                                setViewKey(
                                  "pivotTrendlineStyle",
                                  e.target
                                    .value as ViewSettings["pivotTrendlineStyle"],
                                )
                              }
                            >
                              <option value="solid">Solid</option>
                              <option value="dashed">Dashed</option>
                              <option value="dotted">Dotted</option>
                            </select>
                          </label>
                          <IndicatorToggle
                            checked={view.trendlineHalo}
                            colour={view.appearance.indicators.trendlineHalo}
                            label="Trendline halo"
                            onChange={(value) =>
                              setViewKey("trendlineHalo", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.showTrendlineLabels}
                            colour={view.appearance.indicators.bullTrendline}
                            label="Show trendline labels"
                            onChange={(value) =>
                              setViewKey("showTrendlineLabels", value)
                            }
                          />
                          <h3>LR channel</h3>
                          <IndicatorToggle
                            checked={view.channels}
                            colour={view.appearance.indicators.regressionBasis}
                            label="Show LR channel"
                            onChange={(value) => setViewKey("channels", value)}
                          />
                          <ExtensionField
                            label="LR extension"
                            value={view.lrChannelExtension}
                            onChange={(value) =>
                              setViewKey("lrChannelExtension", value)
                            }
                          />
                          <RangeField
                            label="Basis width"
                            max={5}
                            min={1}
                            onChange={(value) =>
                              setViewKey("lrBasisWidth", value)
                            }
                            suffix="px"
                            value={view.lrBasisWidth}
                          />
                          <RangeField
                            label="Boundary width"
                            max={5}
                            min={1}
                            onChange={(value) =>
                              setViewKey("lrBoundaryWidth", value)
                            }
                            suffix="px"
                            value={view.lrBoundaryWidth}
                          />
                          <label className="field-row">
                            <span>Boundary style</span>
                            <select
                              value={view.lrBoundaryStyle}
                              onChange={(e) =>
                                setViewKey(
                                  "lrBoundaryStyle",
                                  e.target
                                    .value as ViewSettings["lrBoundaryStyle"],
                                )
                              }
                            >
                              <option value="solid">Solid</option>
                              <option value="dashed">Dashed</option>
                              <option value="dotted">Dotted</option>
                            </select>
                          </label>
                          <IndicatorToggle
                            checked={view.showLrChannelFill}
                            colour={view.appearance.indicators.regressionFill}
                            label="Show LR channel fill"
                            onChange={(value) =>
                              setViewKey("showLrChannelFill", value)
                            }
                          />
                          <RangeField
                            label="Fill opacity"
                            max={0.4}
                            min={0}
                            step={0.01}
                            onChange={(value) =>
                              setViewKey("lrChannelFillOpacity", value)
                            }
                            value={view.lrChannelFillOpacity}
                          />
                          <IndicatorToggle
                            checked={view.showLrChannelLabels}
                            colour={view.appearance.indicators.regressionUpper}
                            label="Show LR channel labels"
                            onChange={(value) =>
                              setViewKey("showLrChannelLabels", value)
                            }
                          />
                          <IndicatorToggle
                            checked={view.lrBasisHalo}
                            colour={view.appearance.indicators.trendlineHalo}
                            label="LR basis halo"
                            onChange={(value) =>
                              setViewKey("lrBasisHalo", value)
                            }
                          />
                          <h3>Horizontal levels</h3>
                          <ExtensionField
                            label="S/R extension"
                            value={view.srLineExtension}
                            onChange={(value) =>
                              setViewKey("srLineExtension", value)
                            }
                          />
                          <ExtensionField
                            label="Fibonacci extension"
                            value={view.fibLineExtension}
                            onChange={(value) =>
                              setViewKey("fibLineExtension", value)
                            }
                          />
                          <h3>Patterns</h3>
                          <ExtensionField
                            label="Triangle boundaries"
                            value={view.triangleLineExtension}
                            onChange={(value) =>
                              setViewKey("triangleLineExtension", value)
                            }
                          />
                        </div>
                      ) : null}
                      {visualTab === "colours" ? (
                        <div className="setting-section colours-section">
                          <h3>Chart appearance</h3>
                          <label className="field-row">
                            <span>Preset</span>
                            <select
                              value={view.appearance.preset}
                              onChange={(e) => {
                                if (e.target.value !== "custom")
                                  applyAppearancePreset(
                                    e.target.value as Exclude<
                                      ChartAppearanceSettings["preset"],
                                      "custom"
                                    >,
                                  );
                              }}
                            >
                              <option value="dizy-dark">Dizy Dark</option>
                              <option value="high-contrast">
                                High Contrast
                              </option>
                              <option value="colourblind-friendly">
                                Colourblind Friendly
                              </option>
                              <option value="minimal">Minimal</option>
                              <option value="custom">Custom</option>
                            </select>
                          </label>
                          {(
                            [
                              "chart",
                              "candles",
                              "indicators",
                              "structure",
                              "profile",
                            ] as const
                          ).map((group) => (
                            <fieldset className="colour-group" key={group}>
                              <legend>{group}</legend>
                              {Object.entries(view.appearance[group]).map(
                                ([key, value]) => (
                                  <label className="colour-field" key={key}>
                                    <span>
                                      {key.replace(/([A-Z])/g, " $1")}
                                    </span>
                                    <input
                                      aria-label={`${group} ${key}`}
                                      type="color"
                                      value={value}
                                      onChange={(e) =>
                                        setAppearanceColour(
                                          group,
                                          key,
                                          e.target.value,
                                        )
                                      }
                                    />
                                    <code>{value}</code>
                                  </label>
                                ),
                              )}
                            </fieldset>
                          ))}
                          {Object.entries(view.appearance.opacity).map(
                            ([key, value]) => (
                              <RangeField
                                key={key}
                                label={`${key} opacity`}
                                max={1}
                                min={0}
                                step={0.05}
                                value={value}
                                onChange={(next) =>
                                  setView((current) => ({
                                    ...current,
                                    appearance: {
                                      ...current.appearance,
                                      preset: "custom",
                                      opacity: {
                                        ...current.appearance.opacity,
                                        [key]: next,
                                      },
                                    },
                                  }))
                                }
                              />
                            ),
                          )}
                          <div className="appearance-actions">
                            <button
                              onClick={() => applyAppearancePreset("dizy-dark")}
                              type="button"
                            >
                              Reset colours
                            </button>
                            <button
                              onClick={() =>
                                setView((current) => ({
                                  ...current,
                                  ...DEFAULT_VIEW,
                                }))
                              }
                              type="button"
                            >
                              Reset complete appearance
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {activePanel === "strategy" ? (
                    <>
                      <div className="setting-section">
                        <h3>Confirmed-bar engine</h3>
                        <div className="safety-note">
                          <i>✓</i>
                          <p>
                            <strong>Non-repainting mode</strong>
                            <span>Signals use completed candles only.</span>
                          </p>
                        </div>
                        <label className="field-row">
                          <span>Strategy mode</span>
                          <select
                            value={strategy.mode}
                            onChange={(e) =>
                              setStrategyMode(e.target.value as StrategyMode)
                            }
                          >
                            <option value="scalp-15m">Scalping · 15m</option>
                <option value="pine-v1-exact">Pine V1 Exact</option>
                            <option value="swing-1h-4h">Swing · 1H/4H</option>
                            <option value="custom">Custom</option>
                          </select>
                        </label>
                        {strategy.mode !== "custom" ? (
                          <button
                            type="button"
                            onClick={() =>
                              setStrategy({
                                ...effectiveStrategy,
                                mode: "custom",
                              })
                            }
                          >
                            Copy preset to Custom
                          </button>
                        ) : null}
                        {(strategy.mode === "scalp-15m" &&
                          timeframe !== "15m") ||
                        (strategy.mode === "swing-1h-4h" &&
                          !["1h", "4h"].includes(timeframe)) ? (
                          <div className="safety-note purple">
                            <i>i</i>
                            <p>
                              <strong>
                                {strategyModeLabel(strategy.mode)} preset
                              </strong>
                              <span>
                                Tuned for{" "}
                                {strategy.mode === "scalp-15m"
                                  ? "15m"
                                  : "1h or 4h"}
                                ; currently viewing {timeframe}.
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setTimeframe(
                                    strategy.mode === "scalp-15m"
                                      ? "15m"
                                      : "1h",
                                  )
                                }
                              >
                                Use recommended timeframe
                              </button>
                              {strategy.mode === "swing-1h-4h" ? (
                                <button
                                  type="button"
                                  onClick={() => setTimeframe("4h")}
                                >
                                  Use 4h
                                </button>
                              ) : null}
                            </p>
                          </div>
                        ) : null}
                        <IndicatorToggle
                          checked={effectiveStrategy.requireMinConfluence}
                          colour="#27d6a1"
                          label="Require minimum confluence"
                          onChange={(value) =>
                            setStrategyValue("requireMinConfluence", value)
                          }
                        />
                        <RangeField
                          label="Minimum confluence"
                          max={5}
                          min={1}
                          onChange={(value) =>
                            setStrategyValue("minConfluence", value)
                          }
                          suffix="/ 5"
                          value={effectiveStrategy.minConfluence}
                        />
                        <IndicatorToggle
                          checked={effectiveStrategy.useVwapFilter}
                          colour="#8ca9ff"
                          label="Use VWAP bias filter"
                          onChange={(value) =>
                            setStrategyValue("useVwapFilter", value)
                          }
                        />
                        <IndicatorToggle
                          checked={effectiveStrategy.useTrendFilter}
                          colour="#a979ff"
                          label="Use Trend MA filter"
                          onChange={(value) =>
                            setStrategyValue("useTrendFilter", value)
                          }
                        />
                        <RangeField
                          label="Pivot length"
                          max={20}
                          min={2}
                          onChange={(value) =>
                            setStrategyValue("pivotLength", value)
                          }
                          suffix="bars"
                          value={effectiveStrategy.pivotLength}
                        />
                        <RangeField
                          label="S/R lookback"
                          max={1200}
                          min={150}
                          onChange={(value) =>
                            setStrategyValue("srLookback", value)
                          }
                          step={50}
                          suffix="bars"
                          value={effectiveStrategy.srLookback}
                        />
                        <RangeField
                          label="Minimum touches"
                          max={8}
                          min={2}
                          onChange={(value) =>
                            setStrategyValue("minTouches", value)
                          }
                          value={effectiveStrategy.minTouches}
                        />
                        <RangeField
                          label="VWAP scan length"
                          max={500}
                          min={20}
                          onChange={(value) =>
                            setStrategyValue("vwapLength", value)
                          }
                          suffix="bars"
                          value={effectiveStrategy.vwapLength}
                        />
                        <RangeField
                          label="Trend MA"
                          max={300}
                          min={5}
                          onChange={(value) =>
                            setStrategyValue("trendLength", value)
                          }
                          suffix="bars"
                          value={effectiveStrategy.trendLength}
                        />
                      </div>
                      <div className="setting-section">
                        <h3>Pattern geometry</h3>
                        <RangeField
                          label="Channel length"
                          max={500}
                          min={30}
                          onChange={(value) =>
                            setStrategyValue("channelLength", value)
                          }
                          suffix="bars"
                          value={effectiveStrategy.channelLength}
                        />
                        <RangeField
                          label="Channel deviation"
                          max={5}
                          min={0.5}
                          onChange={(value) =>
                            setStrategyValue("channelDeviation", value)
                          }
                          step={0.1}
                          suffix="σ"
                          value={effectiveStrategy.channelDeviation}
                        />
                        <RangeField
                          label="Channel reversal window"
                          max={20}
                          min={1}
                          onChange={(value) =>
                            setStrategyValue("channelReversalWindow", value)
                          }
                          suffix="bars"
                          value={effectiveStrategy.channelReversalWindow}
                        />
                        <RangeField
                          label="Structure confirmation window"
                          max={20}
                          min={1}
                          onChange={(value) =>
                            setStrategyValue("structureWindow", value)
                          }
                          suffix="bars"
                          value={effectiveStrategy.structureWindow}
                        />
                        <RangeField
                          label="Triangle tightness"
                          max={5}
                          min={0.1}
                          step={0.1}
                          onChange={(value) =>
                            setStrategyValue("triangleTightnessPct", value)
                          }
                          suffix="%"
                          value={effectiveStrategy.triangleTightnessPct}
                        />
                        <RangeField
                          label="Breakout volume multiple"
                          max={5}
                          min={0.5}
                          step={0.1}
                          onChange={(value) =>
                            setStrategyValue("breakoutVolumeMultiple", value)
                          }
                          suffix="×"
                          value={effectiveStrategy.breakoutVolumeMultiple}
                        />
                        <RangeField
                          label="ZigZag swing threshold"
                          max={20}
                          min={0.1}
                          step={0.1}
                          onChange={(value) =>
                            setStrategyValue("zigZagThresholdPct", value)
                          }
                          suffix="%"
                          value={effectiveStrategy.zigZagThresholdPct}
                        />
                        <RangeField
                          label="Fibonacci window"
                          max={600}
                          min={50}
                          onChange={(value) =>
                            setStrategyValue("fibLength", value)
                          }
                          step={25}
                          suffix="bars"
                          value={effectiveStrategy.fibLength}
                        />
                      </div>
                      <div className="setting-section">
                        <h3>Signal diagnostics</h3>
                        {replaySession?<small>Replay {replaySession.status} · session {replaySession.id} · {replaySession.symbol} {replaySession.timeframe} · range {new Date(replaySession.rangeStartMs).toISOString()}—{new Date(replaySession.rangeEndMs).toISOString()} · cursor {replaySession.cursorIndex} ({replaySession.cursorTimeMs?new Date(replaySession.cursorTimeMs).toISOString():"none"}) · candles {replaySession.candlesLoaded} · prefix {replaySession.visibleCandles} · speed {replaySession.speed} · signals {analysis.tradeSignals.length} · brain {dizyBrainSnapshot.timestamp} · flow unavailable · timer {replaySession.status==="playing"?"active":"stopped"} · stale requests 0 · last error {replaySession.error??"none"}</small>:<small>Replay idle · timer stopped</small>}
                        <div className="paper-summary">
                          <small>
                            Preset: {strategyModeLabel(strategy.mode)} ·
                            effective timeframe {timeframe}
                          </small>
                          <small>
                            Bars loaded {analysis.diagnostics.barsLoaded} ·
                            after warm-up {analysis.diagnostics.barsAfterWarmup}
                          </small>
                          <small>
                            Raw long {analysis.diagnostics.rawLongCandidates} ·
                            raw short {analysis.diagnostics.rawShortCandidates}
                          </small>
                          <small>
                            Blocked: confluence{" "}
                            {analysis.diagnostics.blockedByConfluence} · VWAP{" "}
                            {analysis.diagnostics.blockedByVwap} · Trend MA{" "}
                            {analysis.diagnostics.blockedByTrend}
                          </small>
                          <small>
                            Ambiguous ties {analysis.diagnostics.ambiguousTies}{" "}
                            · BUY {analysis.diagnostics.confirmedBuys} · SELL{" "}
                            {analysis.diagnostics.confirmedSells} · backtest
                            entries {backtest.trades}
                          </small>
                          <small>Pine parity: {parityReport.datasetSource} · {parityReport.symbol} {parityReport.timeframe} · {parityReport.candleCount} candles · signals {parityReport.signalCount} · entries {parityReport.entryCount} · rejected {parityReport.rejectedSignals}</small>
                          <small>Final equity {currency.format(parityReport.finalEquity)} · return {signed(parityReport.returnPct)} · max drawdown {parityReport.maximumDrawdownPct.toFixed(2)}% · profit factor {parityReport.profitFactor.toFixed(2)} · win rate {parityReport.winRatePct.toFixed(2)}%</small>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {activePanel === "risk" ? (
                    <>
                      <div className="setting-section">
                        <h3>{user.name}&apos;s account limits</h3>
                        <RangeField
                          label="Risk per trade"
                          max={10}
                          min={0.1}
                          onChange={(value) =>
                            setRisk((current) => ({
                              ...current,
                              riskPct: value,
                            }))
                          }
                          step={0.1}
                          suffix="%"
                          value={risk.riskPct}
                        />
                        {risk.riskPct > 2 ? (
                          <div className="safety-note purple">
                            <i>!</i>
                            <p>
                              <strong>High-risk simulation</strong>
                              <span>
                                Compounding and drawdown are greatly amplified.
                              </span>
                            </p>
                          </div>
                        ) : null}
                        <RangeField
                          label="Maximum notional"
                          max={100000}
                          min={50}
                          onChange={(value) =>
                            setRisk((current) => ({
                              ...current,
                              maxNotional: value,
                            }))
                          }
                          step={50}
                          suffix="USDT"
                          value={risk.maxNotional}
                        />
                        <RangeField
                          label="Maximum leverage"
                          max={10}
                          min={1}
                          onChange={(value) =>
                            setRisk((current) => ({
                              ...current,
                              leverage: value,
                            }))
                          }
                          suffix="×"
                          value={risk.leverage}
                        />
                      </div>
                      <div className="setting-section">
                        <h3>Protection</h3>
                        <RangeField
                          label="ATR stop"
                          max={8}
                          min={0.5}
                          onChange={(value) =>
                            setRisk((current) => ({
                              ...current,
                              atrStop: value,
                            }))
                          }
                          step={0.1}
                          suffix="ATR"
                          value={risk.atrStop}
                        />
                        <RangeField
                          label="TP1 reward"
                          max={10}
                          min={0.5}
                          onChange={(value) =>
                            setRisk((current) => ({ ...current, tp1: value }))
                          }
                          step={0.1}
                          suffix="R"
                          value={risk.tp1}
                        />
                        <RangeField
                          label="TP2 reward"
                          max={20}
                          min={1}
                          onChange={(value) =>
                            setRisk((current) => ({ ...current, tp2: value }))
                          }
                          step={0.1}
                          suffix="R"
                          value={risk.tp2}
                        />
                        <div className="safety-note purple">
                          <i>↗</i>
                          <p>
                            <strong>TP1 → break-even → TP2</strong>
                            <span>
                              The test engine models confirmed-bar entries and
                              conservative exits.
                            </span>
                          </p>
                        </div>
                        <div className="paper-summary">
                          <span>Historical test</span>
                          <strong
                            className={
                              backtest.returnPct >= 0 ? "positive" : "negative"
                            }
                          >
                            {signed(backtest.returnPct)}
                          </strong>
                          <small>
                            {backtest.trades} trades ·{" "}
                            {backtest.winRatePct.toFixed(0)}% win ·{" "}
                            {backtest.maxDrawdownPct.toFixed(2)}% max DD
                          </small>
                        </div>
                      </div>
                      <div className="setting-section">
                        <h3>Exchange connection</h3>
                        <div className="credential-card">
                          <span className="credential-icon">◇</span>
                          <p>
                            <strong>MEXC credentials not configured</strong>
                            <span>
                              Credential entry is disabled until encryption, MFA
                              and audit storage are active.
                            </span>
                          </p>
                          <button disabled type="button">
                            Configure later
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                  {activePanel === "dizyflow" && !futuresSelected ? <div className="setting-section market-unavailable"><h3>DizyFlow</h3><p>Unavailable for this market</p></div> : null}{activePanel === "dizyflow" && futuresSelected ? <div className="setting-section flow-settings"><h3>DizyFlow · public data</h3><p className="setting-help">Bounded browser-memory depth and executed-trade rendering. Capture begins only when enabled.</p><h3>Market Depth</h3><p className="setting-help">Current resting liquidity beside the price scale. Resting orders can be cancelled, moved or consumed and do not predict future price.</p><IndicatorToggle checked={orderFlowSettings.marketDepthVisible} label="Show Market Depth" colour="#9c78ff" onChange={checked=>setOrderFlowSettings(v=>({...v,marketDepthVisible:checked}))}/><RangeField label="Width" min={60} max={240} suffix="px" value={orderFlowSettings.marketDepth.width} onChange={value=>setOrderFlowSettings(v=>({...v,marketDepth:{...v.marketDepth,width:value}}))}/><RangeField label="Opacity" min={5} max={80} suffix="%" value={Math.round(orderFlowSettings.marketDepth.opacity*100)} onChange={value=>setOrderFlowSettings(v=>({...v,marketDepth:{...v.marketDepth,opacity:value/100}}))}/><label className="field-row"><span>Scaling</span><select value={orderFlowSettings.marketDepth.scaling} onChange={e=>setOrderFlowSettings(v=>({...v,marketDepth:{...v.marketDepth,scaling:e.target.value as "linear"|"logarithmic"}}))}><option value="linear">Linear</option><option value="logarithmic">Logarithmic</option></select></label><label className="field-row"><span>Display mode</span><select value={orderFlowSettings.marketDepth.displayMode} onChange={e=>setOrderFlowSettings(v=>({...v,marketDepth:{...v.marketDepth,displayMode:e.target.value as OrderFlowSettings["marketDepth"]["displayMode"]}}))}><option value="absolute">Absolute size</option><option value="side-percentage">Percentage of visible side</option><option value="total-percentage">Percentage of visible total book</option></select></label><label className="field-row"><span>Visible level count</span><select value={orderFlowSettings.marketDepth.levels} onChange={e=>setOrderFlowSettings(v=>({...v,marketDepth:{...v.marketDepth,levels:Number(e.target.value) as 10|25|50|100}}))}>{[10,25,50,100].map(value=><option key={value}>{value}</option>)}</select></label><RangeField label="Smoothing" min={0} max={60} suffix="%" value={Math.round(orderFlowSettings.marketDepth.smoothing*100)} onChange={value=>setOrderFlowSettings(v=>({...v,marketDepth:{...v.marketDepth,smoothing:value/100}}))}/><RangeField label="Update throttle" min={50} max={500} step={25} suffix="ms" value={orderFlowSettings.marketDepth.updateThrottleMs} onChange={value=>setOrderFlowSettings(v=>({...v,marketDepth:{...v.marketDepth,updateThrottleMs:value}}))}/><IndicatorToggle checked={orderFlowSettings.marketDepth.highlightClusters} label="Large-cluster highlighting" colour="#f7b955" onChange={checked=>setOrderFlowSettings(v=>({...v,marketDepth:{...v.marketDepth,highlightClusters:checked}}))}/><RangeField label="Cluster threshold (median multiple)" min={2} max={20} value={orderFlowSettings.marketDepth.clusterMultiple} onChange={value=>setOrderFlowSettings(v=>({...v,marketDepth:{...v.marketDepth,clusterMultiple:value}}))}/>{[["enabled","Master capture"],["heatmapVisible","Heatmap"],["bubblesVisible","Volume bubbles"],["domVisible","Depth of Market"],["alertsVisible","Large-activity alerts"],["imbalanceVisible","Imbalance"]].map(([key,label])=><IndicatorToggle key={key} checked={orderFlowSettings[key as keyof OrderFlowSettings] as boolean} label={label} colour="#9c78ff" onChange={checked=>setOrderFlowSettings(current=>({...current,[key]:checked}))}/>)}<h3>Heatmap</h3><label className="field-row"><span>Colour map</span><select value={orderFlowSettings.heatmap.colourMap} onChange={()=>{}}><option value="bookmap">Bookmap inspired</option></select></label><RangeField label="Overall opacity" min={0} max={100} suffix="%" value={Math.round(orderFlowSettings.heatmap.opacity*100)} onChange={value=>setOrderFlowSettings(v=>({...v,heatmap:{...v.heatmap,opacity:value/100}}))}/><RangeField label="Brightness" min={25} max={300} suffix="%" value={Math.round(orderFlowSettings.heatmap.brightness*100)} onChange={value=>setOrderFlowSettings(v=>({...v,heatmap:{...v.heatmap,brightness:value/100}}))}/><RangeField label="Contrast" min={25} max={300} suffix="%" value={Math.round(orderFlowSettings.heatmap.contrast*100)} onChange={value=>setOrderFlowSettings(v=>({...v,heatmap:{...v.heatmap,contrast:value/100}}))}/><RangeField label="Gamma" min={20} max={300} suffix="%" value={Math.round(orderFlowSettings.heatmap.gamma*100)} onChange={value=>setOrderFlowSettings(v=>({...v,heatmap:{...v.heatmap,gamma:value/100}}))}/><RangeField label="Lower cut-off" min={0} max={49} suffix="%" value={Math.round(orderFlowSettings.heatmap.lowerPercentile*100)} onChange={value=>setOrderFlowSettings(v=>({...v,heatmap:{...v.heatmap,lowerPercentile:value/100}}))}/><RangeField label="Upper cut-off" min={51} max={100} suffix="%" value={Math.round(orderFlowSettings.heatmap.upperPercentile*100)} onChange={value=>setOrderFlowSettings(v=>({...v,heatmap:{...v.heatmap,upperPercentile:value/100}}))}/><label className="field-row"><span>Intensity</span><select value={orderFlowSettings.heatmap.intensity} onChange={e=>setOrderFlowSettings(v=>({...v,heatmap:{...v.heatmap,intensity:e.target.value as "log"|"linear"}}))}><option value="log">Logarithmic</option><option value="linear">Linear</option></select></label><label className="field-row"><span>Vertical smoothing</span><select value={orderFlowSettings.heatmap.priceMode} onChange={e=>setOrderFlowSettings(v=>({...v,heatmap:{...v.heatmap,priceMode:e.target.value as "auto"|"manual"|"none"}}))}><option value="auto">Auto</option><option value="manual">Manual</option><option value="none">None</option></select></label><label className="field-row"><span>Manual price-bin size</span><input type="number" min="0.00000001" step="any" value={orderFlowSettings.heatmap.fixedPriceStep} onChange={e=>setOrderFlowSettings(v=>({...v,heatmap:{...v.heatmap,fixedPriceStep:Number(e.target.value)}}))}/></label><RangeField label="History duration" min={5} max={360} suffix="min" value={orderFlowSettings.heatmap.historyMinutes} onChange={value=>setOrderFlowSettings(v=>({...v,heatmap:{...v.heatmap,historyMinutes:value}}))}/><label className="field-row"><span>Book side</span><select value={orderFlowSettings.heatmap.side} onChange={e=>setOrderFlowSettings(v=>({...v,heatmap:{...v.heatmap,side:e.target.value as "both"|"bids"|"asks"}}))}><option value="both">Both</option><option value="bids">Bid only</option><option value="asks">Ask only</option></select></label><label className="field-row"><span>Minimum order notional</span><input type="number" min="0" value={orderFlowSettings.heatmap.minimumNotional} onChange={e=>setOrderFlowSettings(v=>({...v,heatmap:{...v.heatmap,minimumNotional:Number(e.target.value)}}))}/></label><h3>Volume bubbles</h3><label className="field-row"><span>Buy colour</span><input aria-label="Buy colour" type="color" value={orderFlowSettings.bubbles.buyColour} onChange={e=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,buyColour:e.target.value}}))}/></label><label className="field-row"><span>Sell colour</span><input aria-label="Sell colour" type="color" value={orderFlowSettings.bubbles.sellColour} onChange={e=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,sellColour:e.target.value}}))}/></label><label className="field-row"><span>Outline colour</span><input aria-label="Outline colour" type="color" value={orderFlowSettings.bubbles.outlineColour} onChange={e=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,outlineColour:e.target.value}}))}/></label><RangeField label="Fill opacity" min={0} max={100} suffix="%" value={Math.round(orderFlowSettings.bubbles.opacity*100)} onChange={value=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,opacity:value/100}}))}/><RangeField label="Outline opacity" min={0} max={100} suffix="%" value={Math.round(orderFlowSettings.bubbles.outlineOpacity*100)} onChange={value=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,outlineOpacity:value/100}}))}/><RangeField label="Minimum radius" min={1} max={20} suffix="px" value={orderFlowSettings.bubbles.minimumRadius} onChange={value=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,minimumRadius:value}}))}/><RangeField label="Maximum radius" min={3} max={40} suffix="px" value={orderFlowSettings.bubbles.maximumRadius} onChange={value=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,maximumRadius:value}}))}/><RangeField label="Minimum notional" min={0} max={1000000000} suffix="USDT" value={orderFlowSettings.bubbles.minimumNotional} onChange={value=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,minimumNotional:value}}))}/><IndicatorToggle checked={orderFlowSettings.bubbles.adaptive} label="Adaptive filtering" colour="#9c78ff" onChange={checked=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,adaptive:checked}}))}/><RangeField label="Adaptive percentile" min={50} max={100} suffix="%" value={Math.round(orderFlowSettings.bubbles.percentile*100)} onChange={value=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,percentile:value/100}}))}/><label className="field-row"><span>Time aggregation bucket</span><select value={orderFlowSettings.bubbles.timeBucketMs} onChange={e=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,timeBucketMs:Number(e.target.value) as OrderFlowSettings["bubbles"]["timeBucketMs"]}}))}>{[250,500,1000,2000,5000].map(value=><option key={value} value={value}>{value<1000?`${value} ms`:`${value/1000} s`}</option>)}</select></label><label className="field-row"><span>Price aggregation</span><select value={orderFlowSettings.bubbles.priceMode} onChange={e=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,priceMode:e.target.value as "auto"|"fixed"}}))}><option value="auto">Auto</option><option value="fixed">Fixed</option></select></label><label className="field-row"><span>Fixed price step</span><input aria-label="Fixed price step" type="number" min="0.00000001" max="100000" step="any" disabled={orderFlowSettings.bubbles.priceMode!=="fixed"} value={orderFlowSettings.bubbles.fixedPriceStep} onChange={e=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,fixedPriceStep:Number(e.target.value)}}))}/></label><RangeField label="Maximum retained bubbles" min={100} max={20000} value={orderFlowSettings.bubbles.maximumRetained} onChange={value=>setOrderFlowSettings(v=>({...v,bubbles:{...v.bubbles,maximumRetained:value}}))}/><h3>Alerts</h3><RangeField label="Large trade threshold" min={0} max={10000000} suffix="USDT" value={orderFlowSettings.alerts.fixedThreshold} onChange={value=>setOrderFlowSettings(v=>({...v,alerts:{...v.alerts,fixedThreshold:value}}))}/><button className="secondary" type="button" onClick={orderFlow.clear}>Clear captured data</button></div> : null}
                </div>
                <div className="panel-footer">
                  <button
                    className="secondary"
                    onClick={resetPreset}
                    type="button"
                  >
                    Reset preset
                  </button>
                  <button
                    className="primary"
                    disabled={saveState === "saving"}
                    onClick={applyPaperSettings}
                    type="button"
                  >
                    {saveState === "saving"
                      ? "Saving…"
                      : saveState === "saved"
                        ? "Saved ✓"
                        : saveState === "error"
                          ? "Retry save"
                          : "Save & snapshot paper run"}
                  </button>
                </div>
              </aside>
            ) : null}
          </div>
          {futuresSelected ? <ManualPaperTicket intelligence={orderFlow.intelligence} marketKey={selectedMarketKey} publicPrice={liveLastPrice ?? liveCandle?.close ?? null} readOnly={user.role === "viewer"} symbol={symbol} /> : null}
        </>
      )}
      </section>
      <DizyBrainWorkspace />
      </div>
    </main>
  );
}

function TradingViewExplorer({
  nativeChart,
  symbol,
  timeframe,
}: {
  nativeChart: React.ReactNode;
  symbol: string;
  timeframe: string;
}) {
  const [mode, setMode] = useState<"native" | "official">("native");
  const container = useRef<HTMLDivElement>(null);
  const tvSymbol = `MEXC:${symbol.replace("_", "")}.P`,
    interval =
      (
        {
          "1m": "1",
          "5m": "5",
          "15m": "15",
          "30m": "30",
          "1h": "60",
          "4h": "240",
          "8h": "480",
          "1d": "D",
          "1w": "W",
          "1M": "M",
        } as Record<string, string>
      )[timeframe] ?? "15";
  const standard = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=${encodeURIComponent(interval)}`;
  const openUrl = process.env.NEXT_PUBLIC_TRADINGVIEW_LAYOUT_URL || standard;
  useEffect(() => {
    if (mode !== "official" || !container.current) return;
    const element = container.current,
      script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.text = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    element.appendChild(script);
    return () => {
      element.replaceChildren();
    };
  }, [mode, tvSymbol, interval]);
  return (
    <section className="explorer">
      <div className="explorer-mode-tabs">
        <button
          className={mode === "native" ? "active" : ""}
          onClick={() => setMode("native")}
          type="button"
        >
          DizyTrades Pine V1
        </button>
        <button
          className={mode === "official" ? "active" : ""}
          onClick={() => setMode("official")}
          type="button"
        >
          Official TradingView
        </button>
      </div>
      {mode === "native" ? (
        <>
          <div className="explorer-notice">
            Shared Pine-equivalent TypeScript engine · confirmed candles ·
            Signal Simulation remains independent of visibility.
          </div>
          <div className="explorer-native">{nativeChart}</div>
        </>
      ) : (
        <>
          <div className="explorer-notice">
            TradingView’s embedded chart cannot load custom Pine scripts. Use
            DizyTrades Pine V1 mode for the equivalent native overlay, or open
            the script in TradingView.{" "}
            <a href={openUrl} rel="noopener noreferrer" target="_blank">
              Open in TradingView
            </a>
          </div>
          <details className="explorer-help">
            <summary>Using the Pine script on TradingView</summary>
            <ol>
              <li>Open the Pine script in TradingView.</li>
              <li>Add it to the chart.</li>
              <li>Save the chart layout or indicator template.</li>
              <li>
                Leave symbol/interval remembering disabled if the indicator
                should stay active when changing symbols.
              </li>
              <li>
                Use “Apply indicators to entire layout” for multi-chart layouts.
              </li>
            </ol>
          </details>
          <div className="tradingview-widget-container" ref={container}>
            <div className="tradingview-widget-container__widget" />
            <div className="tradingview-widget-copyright">
              <a
                href="https://www.tradingview.com/"
                rel="noopener nofollow"
                target="_blank"
              >
                <span>Track all markets on TradingView</span>
              </a>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
