"use client";

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
  type UTCTimestamp,
} from "lightweight-charts";
import {
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useMemo,
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
import {
  DEFAULT_RISK,
  DEFAULT_STRATEGY,
  DEFAULT_VIEW,
  type RiskSettings,
  type UserTerminalSettings,
  type ViewSettings,
} from "./lib/config";
import type { MarketDescriptor } from "./lib/market/types";
import type { CandleTimeframe } from "./lib/market/types";
import { useMexcRealtime, type RealtimeStatus } from "./lib/market/use-mexc-realtime";
import { applyDealToLiveCandle, applyKlineUpdate, calculateCandleCountdownSeconds, defaultVisibleCandleCount, formatCountdown, startAlignedSecondClock, updatePriceLineCountdownTitle } from "./lib/market/realtime";
import { APPEARANCE_PRESETS, hexToRgba, type ChartAppearanceSettings } from "./lib/chart/appearance";
import { calculateAutoFit, calculateChartLayout, calculateFibLabelLayout, calculateGoToLive, calculateHorizontalLineExtent, channelFillPolygon, extendLineToPlot, calculateProfileRowGeometry, patternLabelPosition, placeChartBubbles, stackLabels, type LinePoint } from "./lib/chart/chart-layout";
import { ALL_TIMEFRAMES, PROFILE_BAR_PRESETS, profileBarPreset, TIMEFRAME_TITLES } from "./lib/chart/toolbar";
import { ChartToolsLayer } from "./chart-tools-layer";
import { classifySeriesSync, requiresSetData } from "./lib/chart/series-sync";
import { reconcileClosedCandles, type MarketLoadReason } from "./lib/market/reconciliation";
import { livePaperSnapshot } from "./lib/paper-performance";
import { PaperPerformanceToolbar } from "./paper-performance-toolbar";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

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

function chartLayout(canvas: HTMLCanvasElement, chart: IChartApi, view: ViewSettings) {
  const rect = canvas.getBoundingClientRect();
  return calculateChartLayout({ width: rect.width, height: rect.height, priceScaleWidth: chart.priceScale("right").width(), profileEnabled: view.volumeProfile, profileWidthPct: view.profileWidthPct, profileMaxWidth: view.profileMaxWidth, profileInset: view.profileInset, rightLabels: view.supportResistance && view.srLabelPlacement === "right-before-profile" });
}

function PlacementField({ label, value, onChange }: { label: string; value: ViewSettings["srLabelPlacement"]; onChange: (value: ViewSettings["srLabelPlacement"]) => void }) {
  return <label className="field-row"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value as ViewSettings["srLabelPlacement"])}><option value="right-before-profile">Right — before profile</option><option value="left-edge">Left edge</option><option value="near-latest">Near latest candle</option><option value="hidden">Hidden labels</option></select></label>;
}

function ExtensionField({ label, value, onChange }: { label: string; value: ViewSettings["srLineExtension"]; onChange: (value: ViewSettings["srLineExtension"]) => void }) {
  return <label className="field-row"><span>{label}</span><select value={value} onChange={event=>onChange(event.target.value as ViewSettings["srLineExtension"])}><option value="none">None</option><option value="left">Left</option><option value="right">Right</option><option value="both">Both</option></select></label>;
}

const dashFor = (style: "solid" | "dashed" | "dotted") => style === "dashed" ? [8, 5] : style === "dotted" ? [2, 4] : [];

function drawChartOverlay(canvas: HTMLCanvasElement, chart: IChartApi, candleSeries: ISeriesApi<"Candlestick">, candles: Candle[], analysis: StrategyAnalysis, view: ViewSettings) {
  const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
  const context = canvas.getContext("2d"); if (!context) return;
  context.scale(dpr, dpr); context.clearRect(0, 0, rect.width, rect.height);
  const a = view.appearance, layout = chartLayout(canvas, chart, view);
  const extension=(individual:ViewSettings["srLineExtension"])=>view.globalLineExtensionOverride==="individual"?individual:view.globalLineExtensionOverride;
  const fontSize = view.labelSize === "Small" ? 10 : view.labelSize === "Large" ? 14 : 12;
  const labelHeight = fontSize + (view.compactLabels ? 4 : view.labelPadding * 2);
  context.font = `600 ${fontSize}px Inter, system-ui, sans-serif`; context.textBaseline = "middle";
  if (view.completedPatternFills) analysis.completedPatterns.forEach(region=>{if(region.status!=="confirmed")return;const start=chart.timeScale().timeToCoordinate(region.startTime as UTCTimestamp),end=chart.timeScale().timeToCoordinate(region.endTime as UTCTimestamp),top=candleSeries.priceToCoordinate(region.high),bottom=candleSeries.priceToCoordinate(region.low);if(start==null||end==null||top==null||bottom==null)return;const colour=region.family==="elliott"?a.structure.elliottFill:region.direction==="bullish"||region.direction==="accumulation"?a.structure.wyckoffAccumulationFill:a.structure.wyckoffDistributionFill;context.fillStyle=hexToRgba(colour,a.opacity.completedPatterns);if(region.points?.length){context.beginPath();region.points.forEach((p,i)=>{const x=chart.timeScale().timeToCoordinate(p.time as UTCTimestamp),y=candleSeries.priceToCoordinate(p.price);if(x!=null&&y!=null){if(i)context.lineTo(x,y);else context.moveTo(x,y);}});context.lineTo(Number(end),Number(bottom));context.lineTo(Number(start),Number(bottom));context.closePath();context.fill();}else context.fillRect(Number(start),Number(top),Number(end)-Number(start),Number(bottom)-Number(top));});
  if (view.supportResistance) {
    const drawable = analysis.levels.map((level, index) => ({ level, id: `${level.kind}-${index}`, y: candleSeries.priceToCoordinate(level.price) })).filter((item): item is typeof item & { y: number } => item.y != null);
    const stacked = stackLabels(drawable.map(({ id, y }) => ({ id, y })), rect.height, labelHeight, 3);
    drawable.forEach((item) => {
      const support = item.level.kind === "support", placed = stacked.find(label => label.id === item.id)!;
      context.fillStyle = hexToRgba(support ? a.structure.supportZone : a.structure.resistanceZone, a.opacity.zones); context.fillRect(layout.candles.x, item.y - 7, Math.max(0, layout.priceScale.x - layout.candles.x), 14);
      const fallbackStart = candles[Math.max(0,candles.length-60)]?.time, fallbackEnd = candles.at(-1)?.time;
      const startX = chart.timeScale().timeToCoordinate((item.level.startTime ?? fallbackStart) as UTCTimestamp) ?? layout.candles.x;
      const endX = chart.timeScale().timeToCoordinate((item.level.endTime ?? fallbackEnd) as UTCTimestamp) ?? layout.candles.x + layout.candles.width;
      const extent = calculateHorizontalLineExtent(startX,endX,layout.candles,extension(view.srLineExtension));
      context.strokeStyle = support ? a.structure.supportLine : a.structure.resistanceLine; context.setLineDash([7, 5]); context.beginPath(); if(extent){context.moveTo(extent.startX,item.y);context.lineTo(extent.endX,item.y);context.stroke();} context.setLineDash([]);
      if (view.srLabelPlacement === "hidden") return;
      const text = formatLevelLabel(item.level, view.showLevelTouches);
      const width = context.measureText(text).width + view.labelPadding * 2;
      let x = layout.rightLabels.x + layout.rightLabels.width - width - 4;
      if (view.srLabelPlacement === "left-edge") x = layout.leftLabels.x;
      if (view.srLabelPlacement === "near-latest") { const latestX = chart.timeScale().timeToCoordinate(candles.at(-1)?.time as UTCTimestamp) ?? layout.candles.x; x = Math.min(layout.profile.x - width - 4, latestX + view.labelOffset); }
      x = Math.max(layout.candles.x, Math.min(x, layout.profile.x - width - 4));
      if (placed.displaced) { context.strokeStyle = hexToRgba(support ? a.structure.supportLine : a.structure.resistanceLine, .55); context.beginPath(); context.moveTo(x, placed.placedY); context.lineTo(x - 10, item.y); context.stroke(); }
      context.fillStyle = hexToRgba(support ? a.structure.supportLabelBackground : a.structure.resistanceLabelBackground, a.opacity.labels); context.fillRect(x, placed.placedY - labelHeight / 2, width, labelHeight);
      context.fillStyle = support ? a.structure.supportLabelText : a.structure.resistanceLabelText; context.fillText(text, x + view.labelPadding, placed.placedY);
    });
  }
  if (view.fibonacci) {
    context.save();
    const fibs = analysis.fibs
      .map(fib => ({ fib, y: candleSeries.priceToCoordinate(fib.price) }))
      .filter((item): item is typeof item & { y: number } => item.y != null);
    const latestX = chart.timeScale().timeToCoordinate(candles.at(-1)?.time as UTCTimestamp) ?? layout.candles.x;
    const labels = calculateFibLabelLayout({
      levels: fibs.map(({ fib, y }) => ({ ratio: fib.ratio, label: fib.label, lineY: y, textWidth: context.measureText(fib.label).width })),
      placement: view.fibLabelPlacement,
      plot: layout.candles,
      leftX: layout.leftLabels.x,
      rightBoundary: layout.profile.x - 4,
      latestX,
      offset: view.labelOffset,
      labelHeight,
      horizontalPadding: Math.max(6, view.labelPadding),
      top: Math.max(layout.leftLabels.y, 44),
      bottom: Math.min(layout.leftLabels.y + layout.leftLabels.height, layout.candles.y + layout.candles.height - 24),
      gap: 3,
    });
    fibs.forEach(({ fib, y }) => {
      const emphasis = fib.ratio === .618 ? 2 : fib.ratio === .5 ? 1 : 0;
      context.strokeStyle = hexToRgba(a.structure.fibonacciLine, emphasis === 2 ? .8 : emphasis === 1 ? .6 : .38);
      context.lineWidth = emphasis === 2 ? 1.5 : 1;
      context.setLineDash([3, 5]);
      const fallbackStart=candles[Math.max(0,candles.length-100)]?.time,fallbackEnd=candles.at(-1)?.time;
      const startX=chart.timeScale().timeToCoordinate((fib.startTime??fallbackStart) as UTCTimestamp)??layout.candles.x,endX=chart.timeScale().timeToCoordinate((fib.endTime??fallbackEnd) as UTCTimestamp)??layout.candles.x+layout.candles.width;
      const extent=calculateHorizontalLineExtent(startX,endX,layout.candles,extension(view.fibLineExtension));
      context.beginPath();
      if(extent){context.moveTo(extent.startX,y);context.lineTo(extent.endX,y);context.stroke();}
    });
    context.setLineDash([]);
    labels.forEach(label => {
      if (label.connector) {
        context.strokeStyle = hexToRgba(a.structure.fibonacciLabelBorder, .72);
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(label.x, label.centreY);
        context.lineTo(Math.max(layout.candles.x, label.x - 10), label.lineY);
        context.stroke();
      }
      context.beginPath();
      context.roundRect(label.x, label.y, label.width, label.height, 6);
      context.fillStyle = hexToRgba(a.structure.fibonacciLabelBackground, label.emphasis ? 1 : a.opacity.labels);
      context.fill();
      context.strokeStyle = a.structure.fibonacciLabelBorder;
      context.lineWidth = label.emphasis === 2 ? 2 : label.emphasis === 1 ? 1.5 : 1;
      context.stroke();
      context.fillStyle = a.structure.fibonacciText;
      context.fillText(label.text, label.x + Math.max(6, view.labelPadding), label.centreY);
    });
    context.restore();
  }
  const toCanvasLine=(points:{time:number;value:number}[])=>{if(points.length<2)return null;const converted=points.slice(0,2).map(point=>({x:chart.timeScale().timeToCoordinate(point.time as UTCTimestamp),y:candleSeries.priceToCoordinate(point.value)}));return converted.every(point=>point.x!=null&&point.y!=null)?converted.map(point=>({x:Number(point.x),y:Number(point.y)})) as [LinePoint,LinePoint]:null;};
  if(view.channels&&analysis.activeChannel){
    const basis=toCanvasLine(analysis.activeChannel.basis),upper=toCanvasLine(analysis.activeChannel.upper),lower=toCanvasLine(analysis.activeChannel.lower);
    const basisLine=basis&&extendLineToPlot(basis,layout.candles,extension(view.lrChannelExtension)),upperLine=upper&&extendLineToPlot(upper,layout.candles,extension(view.lrChannelExtension)),lowerLine=lower&&extendLineToPlot(lower,layout.candles,extension(view.lrChannelExtension));
    if(basisLine&&upperLine&&lowerLine){context.save();context.beginPath();context.rect(layout.candles.x,layout.candles.y,layout.candles.width,layout.candles.height);context.clip();
      if(view.showLrChannelFill){const polygon=channelFillPolygon(upperLine,lowerLine);context.fillStyle=hexToRgba(a.indicators.regressionFill,view.lrChannelFillOpacity);context.beginPath();polygon.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));context.closePath();context.fill();}
      const stroke=(line:{start:LinePoint;end:LinePoint},colour:string,width:number,dash:number[]=[])=>{context.strokeStyle=colour;context.lineWidth=width;context.setLineDash(dash);context.beginPath();context.moveTo(line.start.x,line.start.y);context.lineTo(line.end.x,line.end.y);context.stroke();};
      stroke(upperLine,a.indicators.regressionUpper,view.lrBoundaryWidth,dashFor(view.lrBoundaryStyle));stroke(lowerLine,a.indicators.regressionLower,view.lrBoundaryWidth,dashFor(view.lrBoundaryStyle));
      if(view.lrBasisHalo){context.globalAlpha=.18;stroke(basisLine,a.indicators.trendlineHalo,view.lrBasisWidth+4);context.globalAlpha=1;}stroke(basisLine,a.indicators.regressionBasis,view.lrBasisWidth);
      if(view.showLrChannelLabels){const entries=[{id:"LR upper",line:upperLine,colour:a.indicators.regressionUpper},{id:"LR basis",line:basisLine,colour:a.indicators.regressionBasis},{id:"LR lower",line:lowerLine,colour:a.indicators.regressionLower}],placed=stackLabels(entries.map(e=>({id:e.id,y:e.line.end.y})),layout.candles.height,labelHeight,3);entries.forEach(entry=>{const text=entry.id,width=context.measureText(text).width+12,y=placed.find(p=>p.id===entry.id)!.placedY,x=Math.max(layout.candles.x,Math.min(layout.candles.x+layout.candles.width-width-4,entry.line.end.x-width-6));context.fillStyle=hexToRgba(entry.colour,.88);context.beginPath();context.roundRect(x,y-labelHeight/2,width,labelHeight,5);context.fill();context.fillStyle=a.chart.background;context.fillText(text,x+6,y);});}
      context.restore();
    }
  }
  if(view.trendlines){
    const lines=[{id:"Upper trend",points:analysis.upperTrendline,colour:a.indicators.bearTrendline},{id:"Lower trend",points:analysis.lowerTrendline,colour:a.indicators.bullTrendline}].map(item=>{const anchors=toCanvasLine(item.points);return anchors?{...item,line:extendLineToPlot(anchors,layout.candles,extension(view.pivotTrendlineExtension))}:null;}).filter((item):item is NonNullable<typeof item>=>Boolean(item?.line));
    context.save();context.beginPath();context.rect(layout.candles.x,layout.candles.y,layout.candles.width,layout.candles.height);context.clip();context.setLineDash(dashFor(view.pivotTrendlineStyle));
    lines.forEach(item=>{if(view.trendlineHalo){context.globalAlpha=.18;context.strokeStyle=item.colour;context.lineWidth=Math.min(7,view.pivotTrendlineWidth+2);context.beginPath();context.moveTo(item.line!.start.x,item.line!.start.y);context.lineTo(item.line!.end.x,item.line!.end.y);context.stroke();context.globalAlpha=1;}context.strokeStyle=item.colour;context.lineWidth=view.pivotTrendlineWidth;context.beginPath();context.moveTo(item.line!.start.x,item.line!.start.y);context.lineTo(item.line!.end.x,item.line!.end.y);context.stroke();});context.setLineDash([]);
    if(view.showTrendlineLabels){const placed=stackLabels(lines.map(item=>({id:item.id,y:item.line!.end.y})),layout.candles.height,labelHeight,4);lines.forEach(item=>{const width=context.measureText(item.id).width+12,y=placed.find(p=>p.id===item.id)!.placedY,x=Math.max(layout.candles.x,Math.min(layout.candles.x+layout.candles.width-width-4,item.line!.end.x-width-6));context.fillStyle=hexToRgba(item.colour,.9);context.beginPath();context.roundRect(x,y-labelHeight/2,width,labelHeight,5);context.fill();context.fillStyle=a.chart.background;context.fillText(item.id,x+6,y);});}context.restore();
  }
  if (view.volumeProfile && candles.length && layout.profileContent.width > 0) {
    const sample=candles.slice(-Math.min(view.volumeBars,candles.length)), min=Math.min(...sample.map(c=>c.low)), max=Math.max(...sample.map(c=>c.high)), size=(max-min)/view.volumeRows||1;
    const buckets=Array.from({length:view.volumeRows},(_,i)=>({price:min+size*(i+.5),up:0,down:0})); sample.forEach(c=>{const i=Math.min(buckets.length-1,Math.max(0,Math.floor((((c.high+c.low+c.close)/3)-min)/size))); if(c.close>=c.open)buckets[i].up+=c.volume;else buckets[i].down+=c.volume;}); const maximum=Math.max(1,...buckets.map(b=>b.up+b.down));
    context.save(); context.beginPath(); context.rect(layout.profileContent.x,layout.profileContent.y,layout.profileContent.width,layout.profileContent.height); context.clip(); buckets.forEach(b=>{const top=candleSeries.priceToCoordinate(b.price+size/2),bottom=candleSeries.priceToCoordinate(b.price-size/2);if(top==null||bottom==null)return;const total=((b.up+b.down)/maximum)*layout.profileContent.width,up=total*(b.up/Math.max(1,b.up+b.down)),x=layout.profileContent.x+layout.profileContent.width-total,row=calculateProfileRowGeometry(top,bottom,view.volumeRows);context.fillStyle=hexToRgba(a.profile.bear,view.profileOpacity);context.fillRect(x,row.y,total-up,row.height);context.fillStyle=hexToRgba(a.profile.bull,view.profileOpacity);context.fillRect(x+total-up,row.y,up,row.height);}); context.restore();
    if(view.showProfileHeading){context.save();context.beginPath();context.rect(layout.profile.x,0,layout.profile.width,28);context.clip();context.fillStyle=a.profile.heading;context.font=`600 ${Math.min(10,fontSize)}px Inter`;context.textBaseline="alphabetic";context.fillText(`VOLUME PROFILE · ${sample.length} candles · ${view.volumeRows} price bars`,layout.profile.x+view.profileInset,18);context.restore();}
  }
  if(view.triangles){analysis.triangles.forEach(triangle=>{const pts=triangle.points.map(point=>({x:chart.timeScale().timeToCoordinate(point.time as UTCTimestamp),y:candleSeries.priceToCoordinate(point.price)})).filter(p=>p.x!=null&&p.y!=null).map(p=>({x:Number(p.x),y:Number(p.y)}));if(pts.length!==3)return;const bullish=triangle.direction==="bullish",border=bullish?a.structure.bullishTriangleBorder:a.structure.bearishTriangleBorder;context.save();context.beginPath();context.rect(layout.candles.x,layout.candles.y,layout.candles.width,layout.candles.height);context.clip();context.fillStyle=hexToRgba(bullish?a.structure.bullishTriangleFill:a.structure.bearishTriangleFill,a.opacity.triangles);context.strokeStyle=border;context.beginPath();context.moveTo(pts[0].x,pts[0].y);context.lineTo(pts[1].x,pts[1].y);context.lineTo(pts[2].x,pts[2].y);context.closePath();context.fill();context.stroke();if(extension(view.triangleLineExtension)!=="none"){[pts[0],pts[1]].forEach(anchor=>{const ray=extendLineToPlot([anchor,pts[2]],layout.candles,extension(view.triangleLineExtension));if(ray){context.beginPath();context.moveTo(ray.start.x,ray.start.y);context.lineTo(ray.end.x,ray.end.y);context.stroke();}});}context.restore();if(view.patternLabelPlacement==="hidden")return;const text=`${bullish?"▲":"▼"} ${triangle.label}`,width=context.measureText(text).width+12,minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y)),position=patternLabelPosition({x:minX,y:minY,width:maxX-minX,height:maxY-minY},view.patternLabelPlacement,{width,height:labelHeight},layout.candles,view.labelOffset);context.fillStyle=bullish?a.structure.bullishTriangleText:a.structure.bearishTriangleText;context.fillText(text,position.x+6,position.y+labelHeight/2);});}
  const drawBubbles=(source:{id:string;time:number;price:number;label:string;status?:"forming"|"confirmed";direction?:string}[],signal=false)=>{const size=signal?(view.signalBubbleSize==="Medium"?13:view.signalBubbleSize==="Large"?15:18):(view.patternBubbleSize==="Small"?10:view.patternBubbleSize==="Medium"?12:14);context.font=`700 ${size}px Inter, system-ui`;const items=source.map(item=>{const x=chart.timeScale().timeToCoordinate(item.time as UTCTimestamp),y=candleSeries.priceToCoordinate(item.price),text=signal&&view.signalDetail==="Direction + confluence"?`${item.label} ${(item as typeof item & {confluence:number}).confluence}/5`:item.label;return x==null||y==null?null:{...item,text,anchorX:Number(x),anchorY:Number(y),width:context.measureText(text).width+(signal?20:14),height:size+(signal?14:10)}}).filter((i):i is NonNullable<typeof i>=>Boolean(i));const positions=placeChartBubbles(items,layout.candles,52);positions.forEach(p=>{const meta=items.find(item=>item.id===p.id)!;const provisional=meta.status==="forming",buy=meta.direction==="buy";const background=signal?(buy?a.structure.buyMarker:a.structure.sellMarker):provisional?a.structure.provisionalBackground:meta.direction==="accumulation"?a.structure.wyckoffAccumulation:meta.direction==="distribution"?a.structure.wyckoffDistribution:a.structure.waveMarker;const border=provisional?a.structure.provisionalBorder:signal?background:a.structure.elliottBorder;context.globalAlpha=provisional?.65:1;context.strokeStyle=border;context.fillStyle=background;context.setLineDash(provisional?[4,3]:[]);context.beginPath();context.moveTo(p.anchorX,p.anchorY);context.lineTo(Math.min(p.x+p.width-6,Math.max(p.x+6,p.anchorX)),p.y+p.height);context.stroke();context.beginPath();context.roundRect(p.x,p.y,p.width,p.height,6);context.fill();context.stroke();context.setLineDash([]);context.fillStyle=signal?(buy?a.structure.buyText:a.structure.sellText):a.structure.elliottText;context.fillText(meta.text,p.x+(signal?10:7),p.y+p.height/2);context.globalAlpha=1;});};
  if(view.waves)drawBubbles(analysis.patternStages.filter(stage=>view.provisionalStages||stage.status==="confirmed"));
  if(view.signals)drawBubbles(analysis.tradeSignals,true);
}

export type ChartControls = { resetView: () => void; goToLive: () => void };
const DizyChart = forwardRef<ChartControls, { closedCandles:Candle[];liveCandle:Candle|null;analysis:StrategyAnalysis;view:ViewSettings;resetKey:number;countdownSeconds:number|null;symbol:string;timeframe:string;readOnly:boolean;applyDefaultsNonce:number }>(function DizyChart({ closedCandles, liveCandle, analysis, view, resetKey, countdownSeconds,symbol,timeframe,readOnly,applyDefaultsNonce }, ref) {
  const containerRef=useRef<HTMLDivElement>(null),overlayRef=useRef<HTMLCanvasElement>(null),chartRef=useRef<IChartApi|null>(null),candleRef=useRef<ISeriesApi<"Candlestick">|null>(null),volumeRef=useRef<ISeriesApi<"Histogram">|null>(null),priceLineRef=useRef<IPriceLine|null>(null),indicatorsRef=useRef(new Map<string,ISeriesApi<"Line">>()),previousClosedRef=useRef<Candle[]>([]),marketKeyRef=useRef(""),redrawFrameRef=useRef<number|null>(null),latestRef=useRef({candles:closedCandles,analysis,view});
  useEffect(()=>{latestRef.current={candles:liveCandle?[...closedCandles,liveCandle]:closedCandles,analysis,view};});
  const redraw=useCallback(()=>{if(redrawFrameRef.current!==null)return;redrawFrameRef.current=requestAnimationFrame(()=>{redrawFrameRef.current=null;const chart=chartRef.current,series=candleRef.current,canvas=overlayRef.current;if(chart&&series&&canvas)drawChartOverlay(canvas,chart,series,latestRef.current.candles,latestRef.current.analysis,latestRef.current.view);});},[]);
  const resetView=useCallback(()=>{const chart=chartRef.current,element=containerRef.current,canvas=overlayRef.current;if(!chart||!element||!canvas||!latestRef.current.candles.length)return;const layout=chartLayout(canvas,chart,view),count=defaultVisibleCandleCount(element.clientWidth,latestRef.current.candles.length),range=calculateAutoFit({candleCount:latestRef.current.candles.length,desiredCount:count,barSpacing:7,layout});chart.priceScale("right").applyOptions({autoScale:true});chart.timeScale().setVisibleLogicalRange({from:range.from,to:range.to});requestAnimationFrame(redraw);},[view,redraw]);
  const goToLive=useCallback(()=>{const chart=chartRef.current,canvas=overlayRef.current;if(!chart||!canvas||!latestRef.current.candles.length)return;const range=calculateGoToLive({candleCount:latestRef.current.candles.length,currentRange:chart.timeScale().getVisibleLogicalRange(),barSpacing:7,layout:chartLayout(canvas,chart,view)});chart.priceScale("right").applyOptions({autoScale:true});chart.timeScale().setVisibleLogicalRange({from:range.from,to:range.to});requestAnimationFrame(redraw);},[view,redraw]);
  useImperativeHandle(ref,()=>({resetView,goToLive}),[resetView,goToLive]);
  useEffect(()=>{if(!containerRef.current)return;indicatorsRef.current.clear();const element=containerRef.current,a=latestRef.current.view.appearance,chart=createChart(element,{autoSize:true,layout:{background:{type:ColorType.Solid,color:a.chart.background},textColor:a.chart.axisText,fontFamily:"Inter, system-ui, sans-serif",fontSize:11,panes:{separatorColor:"#1b2233",enableResize:true}},grid:{vertLines:{color:hexToRgba(a.chart.grid,a.opacity.grid)},horzLines:{color:hexToRgba(a.chart.grid,a.opacity.grid)}},rightPriceScale:{borderColor:a.chart.priceScaleBorder,scaleMargins:{top:.08,bottom:.18}},timeScale:{borderColor:a.chart.timeScaleBorder,timeVisible:true,rightOffset:8,barSpacing:7}});const candles=chart.addSeries(CandlestickSeries,{priceLineVisible:false,lastValueVisible:false,borderVisible:false}),volume=chart.addSeries(HistogramSeries,{priceFormat:{type:"volume"},priceScaleId:"",lastValueVisible:false,priceLineVisible:false});volume.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});chartRef.current=chart;candleRef.current=candles;volumeRef.current=volume;const observer=new ResizeObserver(()=>{redraw();});observer.observe(element);const scheduleRedraw=()=>requestAnimationFrame(redraw);element.addEventListener("wheel",scheduleRedraw,{passive:true});element.addEventListener("pointermove",scheduleRedraw,{passive:true});element.addEventListener("pointerup",scheduleRedraw,{passive:true});chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);return()=>{observer.disconnect();element.removeEventListener("wheel",scheduleRedraw);element.removeEventListener("pointermove",scheduleRedraw);element.removeEventListener("pointerup",scheduleRedraw);chart.timeScale().unsubscribeVisibleLogicalRangeChange(redraw);if(priceLineRef.current)candles.removePriceLine(priceLineRef.current);chart.remove();chartRef.current=null;candleRef.current=null;volumeRef.current=null;priceLineRef.current=null;if(redrawFrameRef.current!==null)cancelAnimationFrame(redrawFrameRef.current);};},[redraw]);
  useEffect(()=>{const chart=chartRef.current,c=candleRef.current,v=volumeRef.current,a=view.appearance;if(!chart||!c||!v)return;chart.applyOptions({layout:{background:{type:ColorType.Solid,color:a.chart.background},textColor:a.chart.axisText},grid:{vertLines:{color:hexToRgba(a.chart.grid,a.opacity.grid)},horzLines:{color:hexToRgba(a.chart.grid,a.opacity.grid)}},crosshair:{vertLine:{color:a.chart.crosshair},horzLine:{color:a.chart.crosshair}},rightPriceScale:{borderColor:a.chart.priceScaleBorder},timeScale:{borderColor:a.chart.timeScaleBorder}});c.applyOptions({upColor:a.candles.bull,downColor:a.candles.bear,wickUpColor:a.candles.bullWick,wickDownColor:a.candles.bearWick});requestAnimationFrame(redraw);},[view.appearance,redraw]);
  useEffect(()=>{const c=candleRef.current,v=volumeRef.current;if(!c||!v)return;const a=view.appearance,key=`${symbol}:${timeframe}`,sync=classifySeriesSync(previousClosedRef.current,closedCandles,Boolean(marketKeyRef.current&&marketKeyRef.current!==key));const candleData=closedCandles.map(item=>({...item,time:item.time as UTCTimestamp})),volumeData=closedCandles.map(item=>({time:item.time as UTCTimestamp,value:item.volume,color:hexToRgba(item.close>=item.open?a.candles.bullVolume:a.candles.bearVolume,.23)}));if(requiresSetData(sync)){const range=chartRef.current?.timeScale().getVisibleLogicalRange();c.setData(candleData);v.setData(volumeData);if(sync==="historical-correction"&&range)chartRef.current?.timeScale().setVisibleLogicalRange(range);}else if(sync==="append"||sync==="replace-latest"){const lastCandle=candleData.at(-1),lastVolume=volumeData.at(-1);if(lastCandle)c.update(lastCandle);if(lastVolume)v.update(lastVolume);}previousClosedRef.current=closedCandles;marketKeyRef.current=key;redraw();},[closedCandles,symbol,timeframe,view.appearance,redraw]);
  useEffect(()=>{if(!liveCandle)return;const a=view.appearance;candleRef.current?.update({...liveCandle,time:liveCandle.time as UTCTimestamp});volumeRef.current?.update({time:liveCandle.time as UTCTimestamp,value:liveCandle.volume,color:hexToRgba(liveCandle.close>=liveCandle.open?a.candles.bullVolume:a.candles.bearVolume,.23)});},[liveCandle,view.appearance]);
  const livePrice = liveCandle?.close ?? null;
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    if (livePrice === null) {
      if (priceLineRef.current) series.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
      return;
    }
    if (!priceLineRef.current) priceLineRef.current = series.createPriceLine({ price: livePrice, color: view.appearance.chart.livePrice, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
    priceLineRef.current.applyOptions({ price: livePrice, color: view.appearance.chart.livePrice });
  }, [livePrice, view.appearance.chart.livePrice]);
  useEffect(() => {
    updatePriceLineCountdownTitle(priceLineRef.current, countdownSeconds, view.countdownPriceMarker);
  }, [countdownSeconds, view.countdownPriceMarker]);
  useEffect(()=>{const chart=chartRef.current;if(!chart)return;const desired=new Map<string,{data:{time:number;value:number}[];color:string}>([["trend",{data:analysis.trend,color:view.appearance.indicators.trendMa}]]);if(view.vwap)desired.set("vwap",{data:analysis.vwap,color:view.appearance.indicators.vwap});indicatorsRef.current.forEach((series,key)=>{if(!desired.has(key)){chart.removeSeries(series);indicatorsRef.current.delete(key);}});desired.forEach((item,key)=>{let series=indicatorsRef.current.get(key);if(!series){series=chart.addSeries(LineSeries,{color:item.color,lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});indicatorsRef.current.set(key,series);}else series.applyOptions({color:item.color});series.setData(item.data.filter(p=>Number.isFinite(p.value)).map(p=>({...p,time:p.time as UTCTimestamp})));});redraw();},[analysis.trend,analysis.vwap,view.vwap,view.appearance.indicators,redraw]);
  useEffect(()=>{requestAnimationFrame(resetView);},[resetKey,resetView]);
  useEffect(()=>{requestAnimationFrame(redraw);},[view.volumeRows,redraw]);
  return <div className="chart-tools-grid"><ChartToolsLayer applyDefaultsNonce={applyDefaultsNonce} candles={liveCandle?[...closedCandles,liveCandle]:closedCandles} chart={()=>chartRef.current} defaults={{trendLine:view.manualTrendLineExtension,ray:view.manualRayExtension,horizontalLine:view.manualHorizontalLineExtension,parallelChannel:view.manualChannelExtension,fibonacci:view.manualFibonacciExtension}} exchange="mexc" fadeExtendedPortions={view.fadeExtendedPortions} globalExtension={view.globalLineExtensionOverride} readOnly={readOnly} series={()=>candleRef.current} symbol={symbol} timeframe={timeframe}/><div className="chart-wrap"><div className="chart-canvas" ref={containerRef}/><canvas aria-hidden="true" className="chart-overlay" ref={overlayRef}/><div className="chart-legend"><span><i className="legend-vwap"/>VWAP {analysis.vwap.at(-1)?.value.toFixed(1)}</span><span><i className="legend-trend"/>Trend MA {analysis.trend.at(-1)?.value.toFixed(1)}</span><span><i className="legend-channel"/>LinReg channel</span></div></div></div>;
});

export default function TradingTerminal({ user }: { user: AuthUser }) {
  const [timeframe, setTimeframe] = useState("15m");
  const [symbol, setSymbol] = useState("BTC_USDT");
  const [closedCandles, setClosedCandles] = useState<Candle[]>(() => generateDemoCandles());
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null);
  const [liveLastPrice, setLiveLastPrice] = useState<number | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [clockOffset, setClockOffset] = useState(0);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [viewportReset, setViewportReset] = useState(0);
  const [applyDrawingDefaultsNonce,setApplyDrawingDefaultsNonce]=useState(0);
  const [dataSource, setDataSource] = useState("MEXC PUBLIC DATA");
  const [feedError, setFeedError] = useState("");
  const [markets, setMarkets] = useState<MarketDescriptor[]>([]);
  const [marketQuery, setMarketQuery] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [terminalTab, setTerminalTab] = useState<"charts" | "explorer">("charts");
  const marketRequest = useRef(0);
  const hasCandles = useRef(closedCandles.length > 0);
  useEffect(() => { hasCandles.current = closedCandles.length > 0; }, [closedCandles.length]);
  const chartControls = useRef<ChartControls>(null);
  const timeframeStrip = useRef<HTMLDivElement>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [resultMarketKey, setResultMarketKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<"visuals" | "strategy" | "risk">("visuals");
  const [visualTab, setVisualTab] = useState<"layers" | "layout" | "lines" | "colours">("layers");
  const [executionMode, setExecutionMode] = useState<"Off" | "Paper">("Paper");
  const [view, setView] = useState<ViewSettings>(DEFAULT_VIEW);
  const [strategy, setStrategy] = useState(DEFAULT_STRATEGY);
  const [risk, setRisk] = useState<RiskSettings>(() => ({
    ...DEFAULT_RISK,
    riskPct: user.id === "friend" ? 0.5 : DEFAULT_RISK.riskPct,
    maxNotional: user.id === "friend" ? 500 : DEFAULT_RISK.maxNotional,
  }));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(()=>{timeframeStrip.current?.querySelector<HTMLElement>("[aria-pressed='true']")?.scrollIntoView({block:"nearest",inline:"nearest"});},[timeframe]);

  const analysis = useMemo(
    () => analyzeStrategy(closedCandles, strategy),
    [closedCandles, strategy],
  );
  const backtest = useMemo(
    () => simulateConfirmedSignals(closedCandles, analysis, risk),
    [analysis, closedCandles, risk],
  );
  const [paperMark, setPaperMark] = useState<number | null>(null);
  useEffect(() => { const timer=window.setTimeout(()=>setPaperMark(executionMode === "Paper" ? (liveLastPrice ?? liveCandle?.close ?? null) : null),225);return()=>window.clearTimeout(timer);},[executionMode,liveLastPrice,liveCandle?.close]);
  const paperSnapshot = useMemo(() => livePaperSnapshot(backtest, paperMark, executionMode === "Paper"), [backtest,paperMark,executionMode]);
  const last = liveCandle ?? closedCandles.at(-1);
  const firstVisible = closedCandles.at(-97);
  const change = last && firstVisible ? ((last.close - firstVisible.close) / firstVisible.close) * 100 : 0;
  const signalColour =
    analysis.bias === "Bullish" ? "positive" : analysis.bias === "Bearish" ? "negative" : "neutral";

  const loadMarketData = useCallback(async ({ reason, resetView }: { reason: MarketLoadReason; resetView: boolean }) => {
    const requestId = ++marketRequest.current, requestKey = `${symbol}:${timeframe}`;
    const blocking = (reason === "initial" || reason === "market-change") && !hasCandles.current;
    if (blocking) setInitialLoading(true); else setBackgroundSyncing(true);
    if (blocking) setFeedError("");
    try {
      const response = await fetch(`/api/market?exchange=mexc&symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=800`);
      if (!response.ok) throw new Error("Feed unavailable");
      const payload = (await response.json()) as { source: string; candles: Candle[] };
      if (payload.candles.length < 20) throw new Error("Insufficient candle history");
      if (requestId !== marketRequest.current || requestKey !== `${symbol}:${timeframe}`) return;
      setClosedCandles(current => reason === "market-change" || reason === "initial" ? payload.candles.slice(-800) : reconcileClosedCandles(current, payload.candles));
      if (reason === "initial" || reason === "market-change") { setLiveCandle(null); setLiveLastPrice(null); }
      if (resetView && view.autoFitOnMarketChange) setViewportReset(value => value + 1);
      setDataSource(payload.source.toUpperCase()); setResultMarketKey(requestKey);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId !== marketRequest.current) return;
      if (blocking) { setFeedError("MEXC candle data is currently unavailable."); setDataSource("MEXC UNAVAILABLE"); }
    } finally { if (requestId === marketRequest.current) { setInitialLoading(false); setBackgroundSyncing(false); } }
  }, [symbol, timeframe, view.autoFitOnMarketChange]);

  const demo = dataSource === "DEMONSTRATION DATA";
  useMexcRealtime({
    enabled: terminalTab === "charts" && !demo && view.realtimeChartUpdates,
    symbol,
    timeframe: timeframe as CandleTimeframe,
    onStatus: setRealtimeStatus,
    onClockOffset: setClockOffset,
    onResync: () => void loadMarketData({ reason: "reconnect", resetView: false }),
    onKline: (incoming) => setLiveCandle((current) => {
      setClosedCandles((closed) => { const result = applyKlineUpdate(closed, current, incoming); if (result.rolled) window.setTimeout(() => void loadMarketData({ reason: "rollover", resetView: false }), 750); return result.closed; });
      setLiveLastPrice(incoming.close);
      return !current || incoming.time >= current.time ? incoming : current;
    }),
    onDeal: (deal) => { setLiveLastPrice(deal.price); setLiveCandle((current) => applyDealToLiveCandle(current, deal, timeframe as CandleTimeframe)); },
  });

  const countdownActive = view.candleCountdown && liveCandle !== null && (view.countdownToolbar || view.countdownPriceMarker);
  useEffect(() => {
    if (!countdownActive) return;
    return startAlignedSecondClock({ document, onTick: setCountdownNow });
  }, [countdownActive, symbol, timeframe]);
  const countdownSeconds = liveCandle ? calculateCandleCountdownSeconds({
    candleStart: liveCandle.time,
    timeframe: timeframe as CandleTimeframe,
    clientNowMs: countdownNow,
    clockOffsetMs: clockOffset,
  }) : null;

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
        const stored = user.role === "viewer" ? JSON.parse(sessionStorage.getItem("dizy-viewer-market") || "null") : payload.settings.market;
        if (stored) { setSymbol(stored.symbol || "BTC_USDT"); setTimeframe(stored.timeframe || "15m"); setFavourites(stored.favourites || []); }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSaveState("error");
      });
    return () => controller.abort();
  }, [user.role]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/markets?exchange=mexc&query=${encodeURIComponent(marketQuery)}&favourites=${encodeURIComponent(favourites.join(","))}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((payload: { markets: MarketDescriptor[] }) => setMarkets(payload.markets))
        .catch(() => { if (!controller.signal.aborted) setMarkets([]); });
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [marketQuery, favourites]);

  useEffect(() => {
    if (user.role === "viewer") sessionStorage.setItem("dizy-viewer-market", JSON.stringify({ symbol, timeframe, favourites }));
  }, [favourites, symbol, timeframe, user.role]);

  const applyPaperSettings = async () => {
    setSaveState("saving");
    try {
      const profileResponse = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ view, strategy, risk, market: { exchange: "mexc", symbol, timeframe, favourites } }),
      });
      if (!profileResponse.ok) throw new Error("Could not save settings");
      if (executionMode === "Paper") {
        const paperResponse = await fetch("/api/paper", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            symbol,
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
      riskPct: user.id === "friend" ? 0.5 : DEFAULT_RISK.riskPct,
      maxNotional: user.id === "friend" ? 500 : DEFAULT_RISK.maxNotional,
    });
    setSaveState("idle");
  };

  const setViewKey = <K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) =>
    setView((current) => ({ ...current, [key]: value }));
  const setAppearanceColour = (group: "chart" | "candles" | "indicators" | "structure" | "profile", key: string, value: string) => setView(current => ({ ...current, appearance: { ...current.appearance, preset: "custom", [group]: { ...current.appearance[group], [key]: value } } }));
  const applyAppearancePreset = (preset: Exclude<ChartAppearanceSettings["preset"], "custom">) => setView(current => ({ ...current, appearance: structuredClone(APPEARANCE_PRESETS[preset]) }));

  return (
    <main className="terminal-shell">
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
          <button className={terminalTab === "charts" ? "nav-tab active" : "nav-tab"} onClick={() => { setTerminalTab("charts"); if (view.autoFitOnMarketChange) setViewportReset((value) => value + 1); }} type="button">DizyCharts</button>
          <button className={terminalTab === "explorer" ? "nav-tab active" : "nav-tab"} onClick={() => setTerminalTab("explorer")} type="button">TradingView Explorer</button>
          <span className={`connection realtime-${demo ? "demo" : realtimeStatus}`}><i /> {demo ? "DEMO" : realtimeStatus === "live" ? "LIVE" : realtimeStatus === "delayed" ? "DELAYED / REST ONLY" : realtimeStatus.toUpperCase()}</span>
          <span className="confirmed">Confirmed candles · Live market data · simulation only</span>
          <span className="test-mode">Private test mode</span>
          <span className="lock-status">Live execution locked</span>
          {user.role === "viewer" ? <span className="viewer-badge">VIEWER — READ ONLY</span> : null}
        </div>
        <div className="profile">
          <div className="account-switch static-account">
            <span>{user.name.slice(0, 1)}</span>
            <b>{user.name}</b>
            <em>{user.role}</em>
          </div>
          {user.role !== "viewer" ? <button aria-label="Open settings" className="icon-button" type="button" onClick={() => setSettingsOpen((open) => !open)}>
            ⚙
          </button> : null}
          <a aria-label={user.role === "viewer" ? "Exit viewer" : "Sign out"} className="icon-button signout-button" href="/api/auth/logout">
            ↗
          </a>
        </div>
      </header>

      {terminalTab === "explorer" ? <TradingViewExplorer /> : <>
      <section className="market-toolbar">
        <div className="symbol-block">
          <button aria-expanded={selectorOpen} aria-label="Search MEXC perpetual markets" className="symbol-selector" onClick={() => setSelectorOpen((value) => !value)} type="button"><span className="coin">{symbol.split("_")[0].slice(0, 1)}</span><span><strong>{symbol.replace("_", " / ")}</strong><small>MEXC · perpetual ▾</small></span></button>
          {selectorOpen ? <div className="market-menu"><input autoFocus aria-label="Search symbol, base or quote" onChange={(event) => setMarketQuery(event.target.value)} placeholder="Search every MEXC perpetual…" value={marketQuery} /><div className="market-results">{markets.length ? markets.map((market) => <button className={market.symbol === symbol ? "active" : ""} key={market.symbol} onClick={() => { setSymbol(market.symbol); setRecent((items) => [market.symbol, ...items.filter((item) => item !== market.symbol)].slice(0, 8)); setSelectorOpen(false); }} type="button"><span><b>{market.displayName}</b><small>MEXC perpetual · settle {market.settlementCurrency}</small></span><i aria-label="Favourite" onClick={(event) => { event.stopPropagation(); setFavourites((items) => items.includes(market.symbol) ? items.filter((item) => item !== market.symbol) : [...items, market.symbol]); }}>{favourites.includes(market.symbol) ? "★" : "☆"}</i></button>) : <p>No enabled markets found.</p>}</div>{recent.length ? <small>Recent: {recent.join(" · ")}</small> : null}</div> : null}
        </div>
        <div className="quote-block">
          <strong>{last ? currency.format(liveLastPrice ?? last.close) : "—"}</strong>
          <span className={change >= 0 ? "positive" : "negative"}>{signed(change)}</span>
          {view.countdownToolbar && countdownSeconds !== null ? <small className={countdownSeconds <= 10 ? "countdown closing" : "countdown"}>Candle closes in {formatCountdown(countdownSeconds, timeframe as CandleTimeframe)}</small> : null}
        </div>
        <div className="toolbar-divider" />
        <div className="timeframes" aria-label="Chart timeframe" ref={timeframeStrip} role="group" tabIndex={0}>
          {ALL_TIMEFRAMES.map((item) => (
            <button
              aria-pressed={timeframe === item}
              className={timeframe === item ? "active" : ""}
              key={item}
              onClick={() => setTimeframe(item)}
              title={TIMEFRAME_TITLES[item]}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="chart-view-actions" aria-label="Chart view controls">
          <button aria-label="Reset chart view" onClick={()=>chartControls.current?.resetView()} title="Reset view — automatically fit candles and overlays" type="button">Reset view</button>
          <button aria-label="Go to live chart position" onClick={()=>chartControls.current?.goToLive()} title="Go to live — move to the latest candle (does not enable live trading)" type="button">Go to live</button>
        </div>
        <div className="toolbar-divider" />
        <button className="preset-button" type="button">
          <span>Preset</span>
          <strong>Scalping · 15m</strong>
        </button>
        <button className="refresh-button" disabled={backgroundSyncing} onClick={() => void loadMarketData({ reason: "manual", resetView: false })} type="button">
          {backgroundSyncing ? "Syncing…" : "Refresh data"}
        </button>
        <div className="toolbar-spacer" />
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
          <button className="live-disabled" disabled title="Live trading is deliberately unavailable in this review build" type="button">
            Live 🔒
          </button>
        </div>
      </section>
      {view.showSimulationPerformance ? <PaperPerformanceToolbar calculating={resultMarketKey !== `${symbol}:${timeframe}`} enabled={executionMode === "Paper"} snapshot={paperSnapshot} /> : null}

      <div className={`workspace ${settingsOpen ? "" : "panel-closed"}`}>
        <section className="chart-section">
          <div className="chart-status-row">
            <div>
              <span className={`bias-pill ${signalColour}`}>{analysis.bias} bias</span>
              <strong>Confluence {Math.max(analysis.scoreLong, analysis.scoreShort)} / 5</strong>
              <span>{analysis.phase}</span>
            </div>
            <div>
              <span>{dataSource}</span>
              <span>{closedCandles.length} confirmed bars</span>
              <span>Last signal: {analysis.lastSignal}</span>
            </div>
          </div>
          {feedError ? <div className="feed-error" role="alert"><strong>{feedError}</strong><span>Real data was not replaced automatically.</span><button onClick={() => { setClosedCandles(generateDemoCandles()); setLiveCandle(null); setDataSource("DEMONSTRATION DATA"); setFeedError(""); }} type="button">Use demonstration data</button></div> : initialLoading && !closedCandles.length ? <div className="chart-skeleton">Loading closed candles…</div> : <DizyChart applyDefaultsNonce={applyDrawingDefaultsNonce} analysis={analysis} closedCandles={closedCandles} countdownSeconds={countdownSeconds} liveCandle={liveCandle} readOnly={user.role==="viewer"} ref={chartControls} resetKey={viewportReset} symbol={symbol} timeframe={timeframe} view={view} />}
          <div className="signal-dock">
            <article>
              <span>Current setup</span>
              <strong className={signalColour}>{analysis.bias}</strong>
              <small>{analysis.lastSignal}</small>
            </article>
            <article>
              <span>Long confluence</span>
              <strong>{analysis.scoreLong} / 5</strong>
              <div className="score-track"><i style={{ width: `${analysis.scoreLong * 20}%` }} /></div>
            </article>
            <article>
              <span>Short confluence</span>
              <strong>{analysis.scoreShort} / 5</strong>
              <div className="score-track red"><i style={{ width: `${analysis.scoreShort * 20}%` }} /></div>
            </article>
            <article>
              <span>Risk gate</span>
              <strong>{risk.riskPct}% · {risk.leverage}×</strong>
              <small>Max {currency.format(risk.maxNotional)}</small>
            </article>
            <article className="paper-card">
              <span>{executionMode === "Paper" ? "Historical paper run" : "Engine"}</span>
              <strong className={backtest.returnPct >= 0 ? "positive" : "negative"}>
                {executionMode === "Paper" ? signed(backtest.returnPct) : "Signals only"}
              </strong>
              <small>
                {executionMode === "Paper"
                  ? `${backtest.trades} trades · ${backtest.winRatePct.toFixed(0)}% win`
                  : "Live orders blocked"}
              </small>
            </article>
          </div>
        </section>

        {user.role !== "viewer" ? <aside className="settings-panel" aria-label="DizySignals settings">
          <div className="panel-heading">
            <div><small>{user.name}&apos;s private workspace</small><strong>Signal settings</strong></div>
            <button aria-label="Close settings" onClick={() => setSettingsOpen(false)} type="button">×</button>
          </div>
          <div className="panel-tabs">
            {(["visuals", "strategy", "risk"] as const).map((panel) => (
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
                <div className="visual-subtabs" role="tablist">{(["layers", "layout", "lines", "colours"] as const).map(tab => <button className={visualTab === tab ? "active" : ""} key={tab} onClick={() => setVisualTab(tab)} type="button">{tab === "layout" ? "Labels & layout" : tab === "lines" ? "Lines & channels" : tab}</button>)}</div>
                {visualTab === "layers" ? <div className="setting-section"><h3>Chart layers</h3>
                  <IndicatorToggle checked={view.supportResistance} colour={view.appearance.structure.supportLine} label="Support & resistance zones" onChange={value=>setViewKey("supportResistance",value)}/><IndicatorToggle checked={view.showLevelTouches} colour={view.appearance.structure.supportLine} label="Show S/R touches" onChange={value=>setViewKey("showLevelTouches",value)}/><IndicatorToggle checked={view.vwap} colour={view.appearance.indicators.vwap} label="Rolling VWAP" onChange={value=>setViewKey("vwap",value)}/><IndicatorToggle checked={view.fibonacci} colour={view.appearance.structure.fibonacciLine} label="Fibonacci levels" onChange={value=>setViewKey("fibonacci",value)}/><IndicatorToggle checked={view.channels} colour={view.appearance.indicators.regression} label="Regression channel" onChange={value=>setViewKey("channels",value)}/><IndicatorToggle checked={view.trendlines} colour={view.appearance.indicators.bullTrendline} label="Pivot trendlines" onChange={value=>setViewKey("trendlines",value)}/><IndicatorToggle checked={view.triangles} colour={view.appearance.structure.bearishTriangleBorder} label="Triangle outlines" onChange={value=>setViewKey("triangles",value)}/><IndicatorToggle checked={view.completedPatternFills} colour={view.appearance.structure.elliottFill} label="Completed pattern fills" onChange={value=>setViewKey("completedPatternFills",value)}/><IndicatorToggle checked={view.volumeProfile} colour={view.appearance.profile.bull} label="Right volume profile" onChange={value=>setViewKey("volumeProfile",value)}/><IndicatorToggle checked={view.waves} colour={view.appearance.structure.waveMarker} label="Elliott/Wyckoff stage bubbles" onChange={value=>setViewKey("waves",value)}/><IndicatorToggle checked={view.provisionalStages} colour={view.appearance.structure.provisionalBorder} label="Provisional ? stages" onChange={value=>setViewKey("provisionalStages",value)}/><IndicatorToggle checked={view.signals} colour={view.appearance.structure.buyMarker} label="BUY/SELL signal bubbles" onChange={value=>setViewKey("signals",value)}/><IndicatorToggle checked={view.showSimulationPerformance} colour="#8b7cff" label="Show simulation performance in toolbar" onChange={value=>setViewKey("showSimulationPerformance",value)}/><IndicatorToggle checked={view.realtimeChartUpdates} colour="#2ee6a6" label="Real-time chart updates" onChange={value=>setViewKey("realtimeChartUpdates",value)}/><IndicatorToggle checked={view.countdownToolbar} colour="#ffd071" label="Countdown in toolbar" onChange={value=>setViewKey("countdownToolbar",value)}/><IndicatorToggle checked={view.countdownPriceMarker} colour={view.appearance.chart.livePrice} label="Countdown on price marker" onChange={value=>setViewKey("countdownPriceMarker",value)}/><IndicatorToggle checked={view.autoFitOnMarketChange} colour="#57a5ff" label="Auto-fit on market change" onChange={value=>setViewKey("autoFitOnMarketChange",value)}/>
                  <RangeField label="Volume lookback" max={600} min={60} onChange={value=>setViewKey("volumeBars",value)} step={20} suffix="candles" value={view.volumeBars}/><p className="field-help">How many historical candles are analysed.</p>
                  <label className="field-row"><span>Profile bar size</span><select aria-label="Profile bar size" value={profileBarPreset(view.volumeRows)} onChange={event=>{const preset=event.target.value as keyof typeof PROFILE_BAR_PRESETS;if(preset in PROFILE_BAR_PRESETS)setViewKey("volumeRows",PROFILE_BAR_PRESETS[preset]);}}><option>Large</option><option>Medium</option><option>Small</option><option>Very small</option><option disabled value="Custom">Custom</option></select></label>
                  <RangeField label="Volume profile bars" max={240} min={12} onChange={value=>setViewKey("volumeRows",value)} step={4} suffix="bars" value={view.volumeRows}/><p className="field-help">More bars create thinner, more detailed price rows.</p><RangeField label="Profile opacity" max={1} min={0} step={.05} onChange={value=>setViewKey("profileOpacity",value)} value={view.profileOpacity}/><IndicatorToggle checked={view.showProfileHeading} colour={view.appearance.profile.heading} label="Profile heading" onChange={value=>setViewKey("showProfileHeading",value)}/>
                </div> : null}
                {visualTab === "layout" ? <div className="setting-section"><h3>Labels & reserved lanes</h3>
                  <label className="field-row"><span>Label size</span><select value={view.labelSize} onChange={e=>setViewKey("labelSize",e.target.value as ViewSettings["labelSize"])}><option>Small</option><option>Medium</option><option>Large</option></select></label>
                  <label className="field-row"><span>Pattern bubble size</span><select value={view.patternBubbleSize} onChange={e=>setViewKey("patternBubbleSize",e.target.value as ViewSettings["patternBubbleSize"])}><option>Small</option><option>Medium</option><option>Large</option></select></label><label className="field-row"><span>Signal bubble size</span><select value={view.signalBubbleSize} onChange={e=>setViewKey("signalBubbleSize",e.target.value as ViewSettings["signalBubbleSize"])}><option>Medium</option><option>Large</option><option>Extra Large</option></select></label><label className="field-row"><span>Signal detail</span><select value={view.signalDetail} onChange={e=>setViewKey("signalDetail",e.target.value as ViewSettings["signalDetail"])}><option>Direction only</option><option>Direction + confluence</option></select></label>
                  <PlacementField label="S/R labels" value={view.srLabelPlacement} onChange={value=>setViewKey("srLabelPlacement",value)}/><PlacementField label="Fibonacci labels" value={view.fibLabelPlacement} onChange={value=>setViewKey("fibLabelPlacement",value)}/>
                  <label className="field-row"><span>Pattern labels</span><select value={view.patternLabelPlacement} onChange={e=>setViewKey("patternLabelPlacement",e.target.value as ViewSettings["patternLabelPlacement"])}><option value="above">Above pattern</option><option value="inside">Inside pattern</option><option value="below">Below pattern</option><option value="left">Left of pattern</option><option value="right">Right of pattern</option><option value="hidden">Hidden labels</option></select></label>
                  <RangeField label="Horizontal offset" max={80} min={0} onChange={value=>setViewKey("labelOffset",value)} suffix="px" value={view.labelOffset}/><RangeField label="Label padding" max={20} min={2} onChange={value=>setViewKey("labelPadding",value)} suffix="px" value={view.labelPadding}/><IndicatorToggle checked={view.compactLabels} colour="#8994ad" label="Compact labels" onChange={value=>setViewKey("compactLabels",value)}/><RangeField label="Profile width" max={30} min={10} onChange={value=>setViewKey("profileWidthPct",value)} suffix="%" value={view.profileWidthPct}/><RangeField label="Profile maximum" max={320} min={100} onChange={value=>setViewKey("profileMaxWidth",value)} step={10} suffix="px" value={view.profileMaxWidth}/><RangeField label="Profile inset" max={40} min={0} onChange={value=>setViewKey("profileInset",value)} suffix="px" value={view.profileInset}/><button className="reset-appearance" onClick={()=>setView(current=>({...current,...DEFAULT_VIEW,appearance:current.appearance}))} type="button">Reset labels / layout</button>
                </div> : null}
                {visualTab === "lines" ? <div className="setting-section"><h3>Line extensions</h3><label className="field-row"><span>Global line extension override</span><select value={view.globalLineExtensionOverride} onChange={e=>setViewKey("globalLineExtensionOverride",e.target.value as ViewSettings["globalLineExtensionOverride"])}><option value="individual">Use individual settings</option><option value="none">None</option><option value="left">Left</option><option value="right">Right</option><option value="both">Both</option></select></label><IndicatorToggle checked={view.fadeExtendedPortions} colour={view.appearance.indicators.bullTrendline} label="Fade extended portions" onChange={value=>setViewKey("fadeExtendedPortions",value)}/><h3>Manual drawing defaults</h3><ExtensionField label="Trend line default extension" value={view.manualTrendLineExtension} onChange={value=>setViewKey("manualTrendLineExtension",value)}/><ExtensionField label="Ray default extension" value={view.manualRayExtension} onChange={value=>setViewKey("manualRayExtension",value)}/><label className="field-row"><span>Horizontal line default extension</span><select value={view.manualHorizontalLineExtension} onChange={e=>setViewKey("manualHorizontalLineExtension",e.target.value as ViewSettings["manualHorizontalLineExtension"])}><option value="left">Left</option><option value="right">Right</option><option value="both">Both</option></select></label><ExtensionField label="Parallel channel default extension" value={view.manualChannelExtension} onChange={value=>setViewKey("manualChannelExtension",value)}/><ExtensionField label="Fibonacci default extension" value={view.manualFibonacciExtension} onChange={value=>setViewKey("manualFibonacciExtension",value)}/><button onClick={()=>{if(window.confirm("Apply extension defaults to all unlocked compatible drawings?"))setApplyDrawingDefaultsNonce(n=>n+1)}} type="button">Apply defaults to existing drawings</button><h3>Pivot trendlines</h3><p className="field-help">Line extension reaches the visible plot edge and updates when the chart is panned or zoomed.</p>
                  <IndicatorToggle checked={view.trendlines} colour={view.appearance.indicators.bullTrendline} label="Show pivot trendlines" onChange={value=>setViewKey("trendlines",value)}/><ExtensionField label="Pivot extension" value={view.pivotTrendlineExtension} onChange={value=>setViewKey("pivotTrendlineExtension",value)}/><RangeField label="Pivot width" max={5} min={1} onChange={value=>setViewKey("pivotTrendlineWidth",value)} suffix="px" value={view.pivotTrendlineWidth}/><label className="field-row"><span>Pivot style</span><select value={view.pivotTrendlineStyle} onChange={e=>setViewKey("pivotTrendlineStyle",e.target.value as ViewSettings["pivotTrendlineStyle"])}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label><IndicatorToggle checked={view.trendlineHalo} colour={view.appearance.indicators.trendlineHalo} label="Trendline halo" onChange={value=>setViewKey("trendlineHalo",value)}/><IndicatorToggle checked={view.showTrendlineLabels} colour={view.appearance.indicators.bullTrendline} label="Show trendline labels" onChange={value=>setViewKey("showTrendlineLabels",value)}/>
                  <h3>LR channel</h3><IndicatorToggle checked={view.channels} colour={view.appearance.indicators.regressionBasis} label="Show LR channel" onChange={value=>setViewKey("channels",value)}/><ExtensionField label="LR extension" value={view.lrChannelExtension} onChange={value=>setViewKey("lrChannelExtension",value)}/><RangeField label="Basis width" max={5} min={1} onChange={value=>setViewKey("lrBasisWidth",value)} suffix="px" value={view.lrBasisWidth}/><RangeField label="Boundary width" max={5} min={1} onChange={value=>setViewKey("lrBoundaryWidth",value)} suffix="px" value={view.lrBoundaryWidth}/><label className="field-row"><span>Boundary style</span><select value={view.lrBoundaryStyle} onChange={e=>setViewKey("lrBoundaryStyle",e.target.value as ViewSettings["lrBoundaryStyle"])}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label><IndicatorToggle checked={view.showLrChannelFill} colour={view.appearance.indicators.regressionFill} label="Show LR channel fill" onChange={value=>setViewKey("showLrChannelFill",value)}/><RangeField label="Fill opacity" max={.4} min={0} step={.01} onChange={value=>setViewKey("lrChannelFillOpacity",value)} value={view.lrChannelFillOpacity}/><IndicatorToggle checked={view.showLrChannelLabels} colour={view.appearance.indicators.regressionUpper} label="Show LR channel labels" onChange={value=>setViewKey("showLrChannelLabels",value)}/><IndicatorToggle checked={view.lrBasisHalo} colour={view.appearance.indicators.trendlineHalo} label="LR basis halo" onChange={value=>setViewKey("lrBasisHalo",value)}/>
                  <h3>Horizontal levels</h3><ExtensionField label="S/R extension" value={view.srLineExtension} onChange={value=>setViewKey("srLineExtension",value)}/><ExtensionField label="Fibonacci extension" value={view.fibLineExtension} onChange={value=>setViewKey("fibLineExtension",value)}/><h3>Patterns</h3><ExtensionField label="Triangle boundaries" value={view.triangleLineExtension} onChange={value=>setViewKey("triangleLineExtension",value)}/>
                </div> : null}
                {visualTab === "colours" ? <div className="setting-section colours-section"><h3>Chart appearance</h3><label className="field-row"><span>Preset</span><select value={view.appearance.preset} onChange={e=>{if(e.target.value!=="custom")applyAppearancePreset(e.target.value as Exclude<ChartAppearanceSettings["preset"],"custom">)}}><option value="dizy-dark">Dizy Dark</option><option value="high-contrast">High Contrast</option><option value="colourblind-friendly">Colourblind Friendly</option><option value="minimal">Minimal</option><option value="custom">Custom</option></select></label>
                  {(["chart","candles","indicators","structure","profile"] as const).map(group=><fieldset className="colour-group" key={group}><legend>{group}</legend>{Object.entries(view.appearance[group]).map(([key,value])=><label className="colour-field" key={key}><span>{key.replace(/([A-Z])/g," $1")}</span><input aria-label={`${group} ${key}`} type="color" value={value} onChange={e=>setAppearanceColour(group,key,e.target.value)}/><code>{value}</code></label>)}</fieldset>)}
                  {Object.entries(view.appearance.opacity).map(([key,value])=><RangeField key={key} label={`${key} opacity`} max={1} min={0} step={.05} value={value} onChange={next=>setView(current=>({...current,appearance:{...current.appearance,preset:"custom",opacity:{...current.appearance.opacity,[key]:next}}}))}/>) }
                  <div className="appearance-actions"><button onClick={()=>applyAppearancePreset("dizy-dark")} type="button">Reset colours</button><button onClick={()=>setView(current=>({...current,...DEFAULT_VIEW}))} type="button">Reset complete appearance</button></div>
                </div> : null}
              </>
            ) : null}

            {activePanel === "strategy" ? (
              <>
                <div className="setting-section">
                  <h3>Confirmed-bar engine</h3>
                  <div className="safety-note"><i>✓</i><p><strong>Non-repainting mode</strong><span>Signals use completed candles only.</span></p></div>
                  <RangeField label="Minimum confluence" max={5} min={1} onChange={(value) => setStrategy((current) => ({ ...current, minConfluence: value }))} suffix="/ 5" value={strategy.minConfluence} />
                  <RangeField label="Pivot length" max={20} min={2} onChange={(value) => setStrategy((current) => ({ ...current, pivotLength: value }))} suffix="bars" value={strategy.pivotLength} />
                  <RangeField label="S/R lookback" max={1200} min={150} onChange={(value) => setStrategy((current) => ({ ...current, srLookback: value }))} step={50} suffix="bars" value={strategy.srLookback} />
                  <RangeField label="Minimum touches" max={8} min={2} onChange={(value) => setStrategy((current) => ({ ...current, minTouches: value }))} value={strategy.minTouches} />
                  <RangeField label="VWAP scan length" max={500} min={20} onChange={(value) => setStrategy((current) => ({ ...current, vwapLength: value }))} suffix="bars" value={strategy.vwapLength} />
                  <RangeField label="Trend MA" max={300} min={5} onChange={(value) => setStrategy((current) => ({ ...current, trendLength: value }))} suffix="bars" value={strategy.trendLength} />
                </div>
                <div className="setting-section">
                  <h3>Pattern geometry</h3>
                  <RangeField label="Channel length" max={500} min={30} onChange={(value) => setStrategy((current) => ({ ...current, channelLength: value }))} suffix="bars" value={strategy.channelLength} />
                  <RangeField label="Channel deviation" max={5} min={0.5} onChange={(value) => setStrategy((current) => ({ ...current, channelDeviation: value }))} step={0.1} suffix="σ" value={strategy.channelDeviation} />
                  <RangeField label="Fibonacci window" max={600} min={50} onChange={(value) => setStrategy((current) => ({ ...current, fibLength: value }))} step={25} suffix="bars" value={strategy.fibLength} />
                </div>
              </>
            ) : null}

            {activePanel === "risk" ? (
              <>
                <div className="setting-section">
                  <h3>{user.name}&apos;s account limits</h3>
                  <RangeField label="Risk per trade" max={10} min={0.1} onChange={(value) => setRisk((current) => ({ ...current, riskPct: value }))} step={0.1} suffix="%" value={risk.riskPct} />
                  <RangeField label="Maximum notional" max={100000} min={50} onChange={(value) => setRisk((current) => ({ ...current, maxNotional: value }))} step={50} suffix="USDT" value={risk.maxNotional} />
                  <RangeField label="Maximum leverage" max={10} min={1} onChange={(value) => setRisk((current) => ({ ...current, leverage: value }))} suffix="×" value={risk.leverage} />
                </div>
                <div className="setting-section">
                  <h3>Protection</h3>
                  <RangeField label="ATR stop" max={8} min={0.5} onChange={(value) => setRisk((current) => ({ ...current, atrStop: value }))} step={0.1} suffix="ATR" value={risk.atrStop} />
                  <RangeField label="TP1 reward" max={10} min={0.5} onChange={(value) => setRisk((current) => ({ ...current, tp1: value }))} step={0.1} suffix="R" value={risk.tp1} />
                  <RangeField label="TP2 reward" max={20} min={1} onChange={(value) => setRisk((current) => ({ ...current, tp2: value }))} step={0.1} suffix="R" value={risk.tp2} />
                  <div className="safety-note purple"><i>↗</i><p><strong>TP1 → break-even → TP2</strong><span>The test engine models confirmed-bar entries and conservative exits.</span></p></div>
                  <div className="paper-summary">
                    <span>Historical test</span>
                    <strong className={backtest.returnPct >= 0 ? "positive" : "negative"}>
                      {signed(backtest.returnPct)}
                    </strong>
                    <small>{backtest.trades} trades · {backtest.winRatePct.toFixed(0)}% win · {backtest.maxDrawdownPct.toFixed(2)}% max DD</small>
                  </div>
                </div>
                <div className="setting-section">
                  <h3>Exchange connection</h3>
                  <div className="credential-card">
                    <span className="credential-icon">◇</span>
                    <p><strong>MEXC credentials not configured</strong><span>Credential entry is disabled until encryption, MFA and audit storage are active.</span></p>
                    <button disabled type="button">Configure later</button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
          <div className="panel-footer">
            <button className="secondary" onClick={resetPreset} type="button">Reset preset</button>
            <button className="primary" disabled={saveState === "saving"} onClick={applyPaperSettings} type="button">
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved ✓"
                  : saveState === "error"
                    ? "Retry save"
                    : "Save & snapshot paper run"}
            </button>
          </div>
        </aside> : null}
      </div>
      </>}
    </main>
  );
}


function TradingViewExplorer() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const element = container.current;
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.text = JSON.stringify({ autosize: true, symbol: "MEXC:BTCUSDT.P", interval: "15", timezone: "Etc/UTC", theme: "dark", style: "1", locale: "en", allow_symbol_change: true, calendar: false, support_host: "https://www.tradingview.com" });
    element.appendChild(script);
    return () => { element.replaceChildren(); };
  }, []);
  return <section className="explorer"><div className="explorer-notice">TradingView Explorer is a separate read-only market view. DizySignals indicators and simulations run only in native DizyCharts.</div><div className="tradingview-widget-container" ref={container}><div className="tradingview-widget-container__widget" /><div className="tradingview-widget-copyright"><a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span>Track all markets on TradingView</span></a></div></div></section>;
}
