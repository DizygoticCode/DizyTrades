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
import { applyDealToLiveCandle, applyKlineUpdate, defaultVisibleCandleCount, formatCountdown, formatPriceLineTitle, nextCandleCloseTimestamp } from "./lib/market/realtime";
import { APPEARANCE_PRESETS, hexToRgba, type ChartAppearanceSettings } from "./lib/chart/appearance";
import { calculateAutoFit, calculateChartLayout, patternLabelPosition, placeChartBubbles, stackLabels } from "./lib/chart/chart-layout";

const ALL_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "8h", "1d", "1w", "1M"];

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

function drawChartOverlay(canvas: HTMLCanvasElement, chart: IChartApi, candleSeries: ISeriesApi<"Candlestick">, candles: Candle[], analysis: StrategyAnalysis, view: ViewSettings) {
  const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
  const context = canvas.getContext("2d"); if (!context) return;
  context.scale(dpr, dpr); context.clearRect(0, 0, rect.width, rect.height);
  const a = view.appearance, layout = chartLayout(canvas, chart, view);
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
      context.strokeStyle = support ? a.structure.supportLine : a.structure.resistanceLine; context.setLineDash([7, 5]); context.beginPath(); context.moveTo(layout.candles.x, item.y); context.lineTo(layout.priceScale.x, item.y); context.stroke(); context.setLineDash([]);
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
    const fibs = analysis.fibs.map((fib, index) => ({ fib, id: `fib-${index}`, y: candleSeries.priceToCoordinate(fib.price) })).filter((item): item is typeof item & { y: number } => item.y != null);
    const stacked = stackLabels(fibs.map(({ id, y }) => ({ id, y })), rect.height, labelHeight, 2);
    fibs.forEach((item, index) => { context.strokeStyle = hexToRgba(a.structure.fibonacciLine, index === 4 ? .8 : .38); context.setLineDash([3,5]); context.beginPath(); context.moveTo(layout.candles.x,item.y); context.lineTo(layout.priceScale.x,item.y); context.stroke(); context.setLineDash([]); if (view.fibLabelPlacement === "hidden") return; const text=item.fib.label, width=context.measureText(text).width; let x=layout.leftLabels.x; if(view.fibLabelPlacement==="right-before-profile") x=layout.profile.x-width-8; if(view.fibLabelPlacement==="near-latest") { const latest=chart.timeScale().timeToCoordinate(candles.at(-1)?.time as UTCTimestamp)??0; x=Math.min(layout.profile.x-width-8,latest+view.labelOffset); } context.fillStyle=a.structure.fibonacciText; context.fillText(text,Math.max(layout.candles.x,x),stacked[index].placedY); });
  }
  if (view.volumeProfile && candles.length && layout.profileContent.width > 0) {
    const sample=candles.slice(-Math.min(view.volumeBars,candles.length)), min=Math.min(...sample.map(c=>c.low)), max=Math.max(...sample.map(c=>c.high)), size=(max-min)/view.volumeRows||1;
    const buckets=Array.from({length:view.volumeRows},(_,i)=>({price:min+size*(i+.5),up:0,down:0})); sample.forEach(c=>{const i=Math.min(buckets.length-1,Math.max(0,Math.floor((((c.high+c.low+c.close)/3)-min)/size))); if(c.close>=c.open)buckets[i].up+=c.volume;else buckets[i].down+=c.volume;}); const maximum=Math.max(1,...buckets.map(b=>b.up+b.down));
    context.save(); context.beginPath(); context.rect(layout.profileContent.x,layout.profileContent.y,layout.profileContent.width,layout.profileContent.height); context.clip(); buckets.forEach(b=>{const top=candleSeries.priceToCoordinate(b.price+size/2),bottom=candleSeries.priceToCoordinate(b.price-size/2);if(top==null||bottom==null)return;const total=((b.up+b.down)/maximum)*layout.profileContent.width,up=total*(b.up/Math.max(1,b.up+b.down)),x=layout.profileContent.x+layout.profileContent.width-total,y=Math.min(top,bottom),h=Math.max(2,Math.abs(bottom-top)-1);context.fillStyle=hexToRgba(a.profile.bear,view.profileOpacity);context.fillRect(x,y,total-up,h);context.fillStyle=hexToRgba(a.profile.bull,view.profileOpacity);context.fillRect(x+total-up,y,up,h);}); context.restore();
    if(view.showProfileHeading){context.fillStyle=a.profile.heading;context.font=`600 ${Math.min(10,fontSize)}px Inter`;context.fillText(`VOLUME PROFILE · ${sample.length} bars`,layout.profile.x+view.profileInset,layout.controls.y+layout.controls.height+12);}
  }
  if(view.triangles){analysis.triangles.forEach(triangle=>{const pts=triangle.points.map(point=>({x:chart.timeScale().timeToCoordinate(point.time as UTCTimestamp),y:candleSeries.priceToCoordinate(point.price)})).filter(p=>p.x!=null&&p.y!=null).map(p=>({x:Number(p.x),y:Number(p.y)}));if(pts.length!==3)return;const bullish=triangle.direction==="bullish";context.fillStyle=hexToRgba(bullish?a.structure.bullishTriangleFill:a.structure.bearishTriangleFill,a.opacity.triangles);context.strokeStyle=bullish?a.structure.bullishTriangleBorder:a.structure.bearishTriangleBorder;context.beginPath();context.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>context.lineTo(p.x,p.y));context.closePath();context.fill();context.stroke();if(view.patternLabelPlacement==="hidden")return;const text=`${bullish?"▲":"▼"} ${triangle.label}`,width=context.measureText(text).width+12,minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y)),position=patternLabelPosition({x:minX,y:minY,width:maxX-minX,height:maxY-minY},view.patternLabelPlacement,{width,height:labelHeight},layout.candles,view.labelOffset);context.fillStyle=bullish?a.structure.bullishTriangleText:a.structure.bearishTriangleText;context.fillText(text,position.x+6,position.y+labelHeight/2);});}
  const drawBubbles=(source:{id:string;time:number;price:number;label:string;status?:"forming"|"confirmed";direction?:string}[],signal=false)=>{const size=signal?(view.signalBubbleSize==="Medium"?13:view.signalBubbleSize==="Large"?15:18):(view.patternBubbleSize==="Small"?10:view.patternBubbleSize==="Medium"?12:14);context.font=`700 ${size}px Inter, system-ui`;const items=source.map(item=>{const x=chart.timeScale().timeToCoordinate(item.time as UTCTimestamp),y=candleSeries.priceToCoordinate(item.price),text=signal&&view.signalDetail==="Direction + confluence"?`${item.label} ${(item as typeof item & {confluence:number}).confluence}/5`:item.label;return x==null||y==null?null:{...item,text,anchorX:Number(x),anchorY:Number(y),width:context.measureText(text).width+(signal?20:14),height:size+(signal?14:10)}}).filter((i):i is NonNullable<typeof i>=>Boolean(i));const positions=placeChartBubbles(items,layout.candles,52);positions.forEach(p=>{const meta=items.find(item=>item.id===p.id)!;const provisional=meta.status==="forming",buy=meta.direction==="buy";const background=signal?(buy?a.structure.buyMarker:a.structure.sellMarker):provisional?a.structure.provisionalBackground:meta.direction==="accumulation"?a.structure.wyckoffAccumulation:meta.direction==="distribution"?a.structure.wyckoffDistribution:a.structure.waveMarker;const border=provisional?a.structure.provisionalBorder:signal?background:a.structure.elliottBorder;context.globalAlpha=provisional?.65:1;context.strokeStyle=border;context.fillStyle=background;context.setLineDash(provisional?[4,3]:[]);context.beginPath();context.moveTo(p.anchorX,p.anchorY);context.lineTo(Math.min(p.x+p.width-6,Math.max(p.x+6,p.anchorX)),p.y+p.height);context.stroke();context.beginPath();context.roundRect(p.x,p.y,p.width,p.height,6);context.fill();context.stroke();context.setLineDash([]);context.fillStyle=signal?(buy?a.structure.buyText:a.structure.sellText):a.structure.elliottText;context.fillText(meta.text,p.x+(signal?10:7),p.y+p.height/2);context.globalAlpha=1;});};
  if(view.waves)drawBubbles(analysis.patternStages.filter(stage=>view.provisionalStages||stage.status==="confirmed"));
  if(view.signals)drawBubbles(analysis.tradeSignals,true);
}

function DizyChart({ closedCandles, liveCandle, analysis, view, resetKey, countdownSeconds }: { closedCandles:Candle[];liveCandle:Candle|null;analysis:StrategyAnalysis;view:ViewSettings;resetKey:number;countdownSeconds:number|null }) {
  const containerRef=useRef<HTMLDivElement>(null),overlayRef=useRef<HTMLCanvasElement>(null),chartRef=useRef<IChartApi|null>(null),candleRef=useRef<ISeriesApi<"Candlestick">|null>(null),volumeRef=useRef<ISeriesApi<"Histogram">|null>(null),priceLineRef=useRef<IPriceLine|null>(null),indicatorsRef=useRef<ISeriesApi<"Line">[]>([]),latestRef=useRef({candles:closedCandles,analysis,view});
  useEffect(()=>{latestRef.current={candles:liveCandle?[...closedCandles,liveCandle]:closedCandles,analysis,view};});
  const redraw=useCallback(()=>{const chart=chartRef.current,series=candleRef.current,canvas=overlayRef.current;if(chart&&series&&canvas)drawChartOverlay(canvas,chart,series,latestRef.current.candles,latestRef.current.analysis,latestRef.current.view);},[]);
  const fit=useCallback(()=>{const chart=chartRef.current,element=containerRef.current,canvas=overlayRef.current;if(!chart||!element||!canvas||!closedCandles.length)return;const layout=chartLayout(canvas,chart,view),count=defaultVisibleCandleCount(element.clientWidth,closedCandles.length),range=calculateAutoFit({candleCount:closedCandles.length,desiredCount:count,barSpacing:7,layout});chart.priceScale("right").applyOptions({autoScale:true});chart.timeScale().setVisibleLogicalRange({from:range.from,to:range.to});redraw();},[closedCandles.length,view,redraw]);
  useEffect(()=>{if(!containerRef.current)return;const a=latestRef.current.view.appearance,chart=createChart(containerRef.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:a.chart.background},textColor:a.chart.axisText,fontFamily:"Inter, system-ui, sans-serif",fontSize:11,panes:{separatorColor:"#1b2233",enableResize:true}},grid:{vertLines:{color:hexToRgba(a.chart.grid,a.opacity.grid)},horzLines:{color:hexToRgba(a.chart.grid,a.opacity.grid)}},rightPriceScale:{borderColor:a.chart.priceScaleBorder,scaleMargins:{top:.08,bottom:.18}},timeScale:{borderColor:a.chart.timeScaleBorder,timeVisible:true,rightOffset:8,barSpacing:7}});const candles=chart.addSeries(CandlestickSeries,{priceLineVisible:false,lastValueVisible:false,borderVisible:false}),volume=chart.addSeries(HistogramSeries,{priceFormat:{type:"volume"},priceScaleId:"",lastValueVisible:false,priceLineVisible:false});volume.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});chartRef.current=chart;candleRef.current=candles;volumeRef.current=volume;const observer=new ResizeObserver(()=>{redraw();});observer.observe(containerRef.current);chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);return()=>{observer.disconnect();chart.timeScale().unsubscribeVisibleLogicalRangeChange(redraw);if(priceLineRef.current)candles.removePriceLine(priceLineRef.current);chart.remove();chartRef.current=null;candleRef.current=null;volumeRef.current=null;priceLineRef.current=null;indicatorsRef.current=[];};},[redraw]);
  useEffect(()=>{const chart=chartRef.current,c=candleRef.current,v=volumeRef.current,a=view.appearance;if(!chart||!c||!v)return;chart.applyOptions({layout:{background:{type:ColorType.Solid,color:a.chart.background},textColor:a.chart.axisText},grid:{vertLines:{color:hexToRgba(a.chart.grid,a.opacity.grid)},horzLines:{color:hexToRgba(a.chart.grid,a.opacity.grid)}},crosshair:{vertLine:{color:a.chart.crosshair},horzLine:{color:a.chart.crosshair}},rightPriceScale:{borderColor:a.chart.priceScaleBorder},timeScale:{borderColor:a.chart.timeScaleBorder}});c.applyOptions({upColor:a.candles.bull,downColor:a.candles.bear,wickUpColor:a.candles.bullWick,wickDownColor:a.candles.bearWick});requestAnimationFrame(redraw);},[view.appearance,redraw]);
  useEffect(()=>{const a=view.appearance;candleRef.current?.setData(closedCandles.map(c=>({...c,time:c.time as UTCTimestamp})));volumeRef.current?.setData(closedCandles.map(c=>({time:c.time as UTCTimestamp,value:c.volume,color:hexToRgba(c.close>=c.open?a.candles.bullVolume:a.candles.bearVolume,.23)})));requestAnimationFrame(redraw);},[closedCandles,view.appearance,redraw]);
  useEffect(()=>{if(!liveCandle)return;const a=view.appearance;candleRef.current?.update({...liveCandle,time:liveCandle.time as UTCTimestamp});volumeRef.current?.update({time:liveCandle.time as UTCTimestamp,value:liveCandle.volume,color:hexToRgba(liveCandle.close>=liveCandle.open?a.candles.bullVolume:a.candles.bearVolume,.23)});},[liveCandle,view.appearance]);
  useEffect(()=>{const series=candleRef.current;if(!series||!liveCandle)return;if(!priceLineRef.current)priceLineRef.current=series.createPriceLine({price:liveCandle.close,color:view.appearance.chart.livePrice,lineWidth:1,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:""});priceLineRef.current.applyOptions({price:liveCandle.close,color:view.appearance.chart.livePrice,title:formatPriceLineTitle(countdownSeconds,view.countdownPriceMarker)});},[liveCandle,countdownSeconds,view.countdownPriceMarker,view.appearance.chart.livePrice]);
  useEffect(()=>{const chart=chartRef.current,candleSeries=candleRef.current;if(!chart||!candleSeries)return;indicatorsRef.current.forEach(series=>chart.removeSeries(series));indicatorsRef.current=[];const add=(data:{time:number;value:number}[],color:string,width:1|2|3,style=LineStyle.Solid)=>{const series=chart.addSeries(LineSeries,{color,lineWidth:width,lineStyle:style,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});series.setData(data.filter(p=>Number.isFinite(p.value)).map(p=>({...p,time:p.time as UTCTimestamp})));indicatorsRef.current.push(series);};const a=view.appearance.indicators;if(view.vwap)add(analysis.vwap,a.vwap,2);add(analysis.trend,a.trendMa,2);if(view.channels){add(analysis.channelTop,a.regression,1,LineStyle.Dashed);add(analysis.channelBasis,a.regression,1);add(analysis.channelBottom,a.regression,1,LineStyle.Dashed);}if(view.trendlines){add(analysis.upperTrendline,a.bearTrendline,2);add(analysis.lowerTrendline,a.bullTrendline,2);}requestAnimationFrame(redraw);},[analysis,view.vwap,view.channels,view.trendlines,view.appearance.indicators,redraw]);
  useEffect(()=>{requestAnimationFrame(fit);},[resetKey,fit]);
  return <div className="chart-wrap"><div className="chart-controls"><button onClick={fit} type="button">Reset view</button><button onClick={fit} type="button">Go to live</button></div><div className="chart-canvas" ref={containerRef}/><canvas aria-hidden="true" className="chart-overlay" ref={overlayRef}/><div className="chart-legend"><span><i className="legend-vwap"/>VWAP {analysis.vwap.at(-1)?.value.toFixed(1)}</span><span><i className="legend-trend"/>Trend MA {analysis.trend.at(-1)?.value.toFixed(1)}</span><span><i className="legend-channel"/>LinReg channel</span></div></div>;
}

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
  const [dataSource, setDataSource] = useState("MEXC PUBLIC DATA");
  const [feedError, setFeedError] = useState("");
  const [markets, setMarkets] = useState<MarketDescriptor[]>([]);
  const [marketQuery, setMarketQuery] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [terminalTab, setTerminalTab] = useState<"charts" | "explorer">("charts");
  const marketRequest = useRef(0);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<"visuals" | "strategy" | "risk">("visuals");
  const [visualTab, setVisualTab] = useState<"layers" | "layout" | "colours">("layers");
  const [executionMode, setExecutionMode] = useState<"Off" | "Paper">("Paper");
  const [view, setView] = useState<ViewSettings>(DEFAULT_VIEW);
  const [strategy, setStrategy] = useState(DEFAULT_STRATEGY);
  const [risk, setRisk] = useState<RiskSettings>(() => ({
    ...DEFAULT_RISK,
    riskPct: user.id === "friend" ? 0.5 : DEFAULT_RISK.riskPct,
    maxNotional: user.id === "friend" ? 500 : DEFAULT_RISK.maxNotional,
  }));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const analysis = useMemo(
    () => analyzeStrategy(closedCandles, strategy),
    [closedCandles, strategy],
  );
  const backtest = useMemo(
    () => simulateConfirmedSignals(closedCandles, analysis, risk),
    [analysis, closedCandles, risk],
  );
  const last = liveCandle ?? closedCandles.at(-1);
  const firstVisible = closedCandles.at(-97);
  const change = last && firstVisible ? ((last.close - firstVisible.close) / firstVisible.close) * 100 : 0;
  const signalColour =
    analysis.bias === "Bullish" ? "positive" : analysis.bias === "Bearish" ? "negative" : "neutral";

  const loadMarketData = useCallback(async (resetView = false) => {
    const requestId = ++marketRequest.current;
    setLoading(true);
    setFeedError("");
    try {
      const response = await fetch(`/api/market?exchange=mexc&symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=800`);
      if (!response.ok) throw new Error("Feed unavailable");
      const payload = (await response.json()) as { source: string; candles: Candle[] };
      if (payload.candles.length < 20) throw new Error("Insufficient candle history");
      if (requestId !== marketRequest.current) return;
      setClosedCandles(payload.candles);
      setLiveCandle(null);
      setLiveLastPrice(null);
      if (resetView && view.autoFitOnMarketChange) setViewportReset((value) => value + 1);
      setDataSource(payload.source.toUpperCase());
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId !== marketRequest.current) return;
      setFeedError("MEXC candle data is currently unavailable.");
      setDataSource("MEXC UNAVAILABLE");
    } finally { if (requestId === marketRequest.current) setLoading(false); }
  }, [symbol, timeframe, view.autoFitOnMarketChange]);

  const demo = dataSource === "DEMONSTRATION DATA";
  useMexcRealtime({
    enabled: terminalTab === "charts" && !demo && view.realtimeChartUpdates,
    symbol,
    timeframe: timeframe as CandleTimeframe,
    onStatus: setRealtimeStatus,
    onClockOffset: setClockOffset,
    onResync: loadMarketData,
    onKline: (incoming) => setLiveCandle((current) => {
      setClosedCandles((closed) => { const result = applyKlineUpdate(closed, current, incoming); if (result.rolled) window.setTimeout(() => void loadMarketData(), 750); return result.closed; });
      setLiveLastPrice(incoming.close);
      return !current || incoming.time >= current.time ? incoming : current;
    }),
    onDeal: (deal) => { setLiveLastPrice(deal.price); setLiveCandle((current) => applyDealToLiveCandle(current, deal, timeframe as CandleTimeframe)); },
  });

  useEffect(() => {
    if (!view.candleCountdown || !liveCandle) return;
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [liveCandle, view.candleCountdown]);
  const countdownSeconds = liveCandle ? Math.max(0, nextCandleCloseTimestamp(liveCandle.time, timeframe as CandleTimeframe) - Math.floor((countdownNow + clockOffset) / 1000)) : null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMarketData(true);
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
        <div className="timeframes" aria-label="Chart timeframe">
          {["1m", "5m", "15m", "1h", "4h"].map((item) => (
            <button
              className={timeframe === item ? "active" : ""}
              key={item}
              onClick={() => setTimeframe(item)}
              type="button"
            >
              {item}
            </button>
          ))}
          <select aria-label="More timeframes" onChange={(event) => setTimeframe(event.target.value)} value={["1m", "5m", "15m", "1h", "4h"].includes(timeframe) ? "" : timeframe}><option disabled value="">More</option>{ALL_TIMEFRAMES.filter((value) => !["1m", "5m", "15m", "1h", "4h"].includes(value)).map((value) => <option key={value}>{value}</option>)}</select>
        </div>
        <div className="toolbar-divider" />
        <button className="preset-button" type="button">
          <span>Preset</span>
          <strong>Scalping · 15m</strong>
        </button>
        <button className="refresh-button" disabled={loading} onClick={() => void loadMarketData(true)} type="button">
          {loading ? "Syncing…" : "Refresh data"}
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
          {feedError ? <div className="feed-error" role="alert"><strong>{feedError}</strong><span>Real data was not replaced automatically.</span><button onClick={() => { setClosedCandles(generateDemoCandles()); setLiveCandle(null); setDataSource("DEMONSTRATION DATA"); setFeedError(""); }} type="button">Use demonstration data</button></div> : loading || !closedCandles.length ? <div className="chart-skeleton">Loading closed candles…</div> : <DizyChart analysis={analysis} closedCandles={closedCandles} countdownSeconds={countdownSeconds} liveCandle={liveCandle} resetKey={viewportReset} view={view} />}
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
                <div className="visual-subtabs" role="tablist">{(["layers", "layout", "colours"] as const).map(tab => <button className={visualTab === tab ? "active" : ""} key={tab} onClick={() => setVisualTab(tab)} type="button">{tab === "layout" ? "Labels & layout" : tab}</button>)}</div>
                {visualTab === "layers" ? <div className="setting-section"><h3>Chart layers</h3>
                  <IndicatorToggle checked={view.supportResistance} colour={view.appearance.structure.supportLine} label="Support & resistance zones" onChange={value=>setViewKey("supportResistance",value)}/><IndicatorToggle checked={view.showLevelTouches} colour={view.appearance.structure.supportLine} label="Show S/R touches" onChange={value=>setViewKey("showLevelTouches",value)}/><IndicatorToggle checked={view.vwap} colour={view.appearance.indicators.vwap} label="Rolling VWAP" onChange={value=>setViewKey("vwap",value)}/><IndicatorToggle checked={view.fibonacci} colour={view.appearance.structure.fibonacciLine} label="Fibonacci levels" onChange={value=>setViewKey("fibonacci",value)}/><IndicatorToggle checked={view.channels} colour={view.appearance.indicators.regression} label="Regression channel" onChange={value=>setViewKey("channels",value)}/><IndicatorToggle checked={view.trendlines} colour={view.appearance.indicators.bullTrendline} label="Pivot trendlines" onChange={value=>setViewKey("trendlines",value)}/><IndicatorToggle checked={view.triangles} colour={view.appearance.structure.bearishTriangleBorder} label="Triangle outlines" onChange={value=>setViewKey("triangles",value)}/><IndicatorToggle checked={view.completedPatternFills} colour={view.appearance.structure.elliottFill} label="Completed pattern fills" onChange={value=>setViewKey("completedPatternFills",value)}/><IndicatorToggle checked={view.volumeProfile} colour={view.appearance.profile.bull} label="Right volume profile" onChange={value=>setViewKey("volumeProfile",value)}/><IndicatorToggle checked={view.waves} colour={view.appearance.structure.waveMarker} label="Elliott/Wyckoff stage bubbles" onChange={value=>setViewKey("waves",value)}/><IndicatorToggle checked={view.provisionalStages} colour={view.appearance.structure.provisionalBorder} label="Provisional ? stages" onChange={value=>setViewKey("provisionalStages",value)}/><IndicatorToggle checked={view.signals} colour={view.appearance.structure.buyMarker} label="BUY/SELL signal bubbles" onChange={value=>setViewKey("signals",value)}/><IndicatorToggle checked={view.realtimeChartUpdates} colour="#2ee6a6" label="Real-time chart updates" onChange={value=>setViewKey("realtimeChartUpdates",value)}/><IndicatorToggle checked={view.countdownToolbar} colour="#ffd071" label="Countdown in toolbar" onChange={value=>setViewKey("countdownToolbar",value)}/><IndicatorToggle checked={view.countdownPriceMarker} colour={view.appearance.chart.livePrice} label="Countdown on price marker" onChange={value=>setViewKey("countdownPriceMarker",value)}/><IndicatorToggle checked={view.autoFitOnMarketChange} colour="#57a5ff" label="Auto-fit on market change" onChange={value=>setViewKey("autoFitOnMarketChange",value)}/>
                  <RangeField label="Volume lookback" max={600} min={60} onChange={value=>setViewKey("volumeBars",value)} step={20} suffix="bars" value={view.volumeBars}/><RangeField label="Profile rows" max={80} min={12} onChange={value=>setViewKey("volumeRows",value)} suffix="rows" value={view.volumeRows}/><RangeField label="Profile opacity" max={1} min={0} step={.05} onChange={value=>setViewKey("profileOpacity",value)} value={view.profileOpacity}/><IndicatorToggle checked={view.showProfileHeading} colour={view.appearance.profile.heading} label="Profile heading" onChange={value=>setViewKey("showProfileHeading",value)}/>
                </div> : null}
                {visualTab === "layout" ? <div className="setting-section"><h3>Labels & reserved lanes</h3>
                  <label className="field-row"><span>Label size</span><select value={view.labelSize} onChange={e=>setViewKey("labelSize",e.target.value as ViewSettings["labelSize"])}><option>Small</option><option>Medium</option><option>Large</option></select></label>
                  <label className="field-row"><span>Pattern bubble size</span><select value={view.patternBubbleSize} onChange={e=>setViewKey("patternBubbleSize",e.target.value as ViewSettings["patternBubbleSize"])}><option>Small</option><option>Medium</option><option>Large</option></select></label><label className="field-row"><span>Signal bubble size</span><select value={view.signalBubbleSize} onChange={e=>setViewKey("signalBubbleSize",e.target.value as ViewSettings["signalBubbleSize"])}><option>Medium</option><option>Large</option><option>Extra Large</option></select></label><label className="field-row"><span>Signal detail</span><select value={view.signalDetail} onChange={e=>setViewKey("signalDetail",e.target.value as ViewSettings["signalDetail"])}><option>Direction only</option><option>Direction + confluence</option></select></label>
                  <PlacementField label="S/R labels" value={view.srLabelPlacement} onChange={value=>setViewKey("srLabelPlacement",value)}/><PlacementField label="Fibonacci labels" value={view.fibLabelPlacement} onChange={value=>setViewKey("fibLabelPlacement",value)}/>
                  <label className="field-row"><span>Pattern labels</span><select value={view.patternLabelPlacement} onChange={e=>setViewKey("patternLabelPlacement",e.target.value as ViewSettings["patternLabelPlacement"])}><option value="above">Above pattern</option><option value="inside">Inside pattern</option><option value="below">Below pattern</option><option value="left">Left of pattern</option><option value="right">Right of pattern</option><option value="hidden">Hidden labels</option></select></label>
                  <RangeField label="Horizontal offset" max={80} min={0} onChange={value=>setViewKey("labelOffset",value)} suffix="px" value={view.labelOffset}/><RangeField label="Label padding" max={20} min={2} onChange={value=>setViewKey("labelPadding",value)} suffix="px" value={view.labelPadding}/><IndicatorToggle checked={view.compactLabels} colour="#8994ad" label="Compact labels" onChange={value=>setViewKey("compactLabels",value)}/><RangeField label="Profile width" max={30} min={10} onChange={value=>setViewKey("profileWidthPct",value)} suffix="%" value={view.profileWidthPct}/><RangeField label="Profile maximum" max={320} min={100} onChange={value=>setViewKey("profileMaxWidth",value)} step={10} suffix="px" value={view.profileMaxWidth}/><RangeField label="Profile inset" max={40} min={0} onChange={value=>setViewKey("profileInset",value)} suffix="px" value={view.profileInset}/><button className="reset-appearance" onClick={()=>setView(current=>({...current,...DEFAULT_VIEW,appearance:current.appearance}))} type="button">Reset labels / layout</button>
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
