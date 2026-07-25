"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
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

function drawChartOverlay(
  canvas: HTMLCanvasElement,
  chart: IChartApi,
  candleSeries: ISeriesApi<"Candlestick">,
  candles: Candle[],
  analysis: StrategyAnalysis,
  view: ViewSettings,
) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(dpr, dpr);
  context.clearRect(0, 0, rect.width, rect.height);
  const fontSize = view.labelSize === "Small" ? 10 : view.labelSize === "Large" ? 14 : 12;
  context.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  context.textBaseline = "middle";

  if (view.supportResistance) {
    analysis.levels.forEach((level) => {
      const y = candleSeries.priceToCoordinate(level.price);
      if (y == null) return;
      const support = level.kind === "support";
      context.fillStyle = support ? "rgba(46,230,166,.085)" : "rgba(255,92,112,.075)";
      context.fillRect(0, y - 7, rect.width, 14);
      context.strokeStyle = support ? "rgba(46,230,166,.76)" : "rgba(255,92,112,.76)";
      context.setLineDash([7, 5]);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(rect.width, y);
      context.stroke();
      context.setLineDash([]);
      const label = `${level.label}  ${level.price.toFixed(1)}`;
      const width = context.measureText(label).width + 16;
      context.fillStyle = support ? "rgba(9,67,53,.94)" : "rgba(77,25,36,.94)";
      context.fillRect(rect.width - width - 5, y - (fontSize + 8) / 2, width, fontSize + 8);
      context.fillStyle = support ? "#6cf4c2" : "#ff8c9c";
      context.fillText(label, rect.width - width + 3, y);
    });
  }

  if (view.fibonacci) {
    analysis.fibs.forEach((fib, index) => {
      const y = candleSeries.priceToCoordinate(fib.price);
      if (y == null) return;
      context.strokeStyle = index === 4 ? "rgba(255,199,94,.8)" : "rgba(255,199,94,.38)";
      context.setLineDash([3, 5]);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(rect.width, y);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#ffd781";
      context.fillText(`${fib.label} · ${fib.price.toFixed(1)}`, 12, y - 8);
    });
  }

  if (view.volumeProfile && candles.length) {
    const profileCandles = candles.slice(-Math.min(view.volumeBars, candles.length));
    const minPrice = Math.min(...profileCandles.map((candle) => candle.low));
    const maxPrice = Math.max(...profileCandles.map((candle) => candle.high));
    const bucketSize = (maxPrice - minPrice) / view.volumeRows || 1;
    const buckets = Array.from({ length: view.volumeRows }, (_, index) => ({
      price: minPrice + bucketSize * (index + 0.5),
      up: 0,
      down: 0,
    }));
    profileCandles.forEach((candle) => {
      const typical = (candle.high + candle.low + candle.close) / 3;
      const index = Math.min(
        buckets.length - 1,
        Math.max(0, Math.floor((typical - minPrice) / bucketSize)),
      );
      if (candle.close >= candle.open) buckets[index].up += candle.volume;
      else buckets[index].down += candle.volume;
    });
    const maximum = Math.max(...buckets.map((bucket) => bucket.up + bucket.down), 1);
    const maxWidth = Math.min(210, rect.width * 0.24);
    buckets.forEach((bucket) => {
      const top = candleSeries.priceToCoordinate(bucket.price + bucketSize / 2);
      const bottom = candleSeries.priceToCoordinate(bucket.price - bucketSize / 2);
      if (top == null || bottom == null) return;
      const height = Math.max(2, Math.abs(bottom - top) - 1);
      const totalWidth = ((bucket.up + bucket.down) / maximum) * maxWidth;
      const upWidth = totalWidth * (bucket.up / Math.max(1, bucket.up + bucket.down));
      const x = rect.width - totalWidth - 65;
      context.fillStyle = "rgba(255,92,112,.35)";
      context.fillRect(x, Math.min(top, bottom), totalWidth - upWidth, height);
      context.fillStyle = "rgba(46,230,166,.42)";
      context.fillRect(x + totalWidth - upWidth, Math.min(top, bottom), upWidth, height);
    });
    context.fillStyle = "rgba(166,178,207,.76)";
    context.fillText(`VOLUME PROFILE · ${profileCandles.length} bars`, rect.width - maxWidth - 65, 22);
  }

  if (view.triangles) {
    analysis.triangles.forEach((triangle) => {
      const coordinates = triangle.points
        .map((point) => ({
          x: chart.timeScale().timeToCoordinate(point.time as UTCTimestamp),
          y: candleSeries.priceToCoordinate(point.price),
        }))
        .filter((point) => point.x != null && point.y != null) as { x: number; y: number }[];
      if (coordinates.length !== 3) return;
      const bullish = triangle.direction === "bullish";
      context.fillStyle = bullish ? "rgba(46,230,166,.24)" : "rgba(255,92,112,.23)";
      context.strokeStyle = bullish ? "#2ee6a6" : "#ff5c70";
      context.lineWidth = 2.5;
      context.beginPath();
      context.moveTo(coordinates[0].x, coordinates[0].y);
      context.lineTo(coordinates[1].x, coordinates[1].y);
      context.lineTo(coordinates[2].x, coordinates[2].y);
      context.closePath();
      context.fill();
      context.stroke();

      const label = `${bullish ? "▲" : "▼"} ${triangle.label}`;
      const labelX = mean(coordinates.map((point) => point.x));
      const labelY = Math.min(...coordinates.map((point) => point.y)) + fontSize + 10;
      const labelWidth = context.measureText(label).width + 18;
      context.fillStyle = bullish ? "rgba(8,76,57,.94)" : "rgba(91,24,38,.94)";
      context.fillRect(labelX - labelWidth / 2, labelY - (fontSize + 10) / 2, labelWidth, fontSize + 10);
      context.fillStyle = bullish ? "#8affd7" : "#ffb0bc";
      context.textAlign = "center";
      context.fillText(label, labelX, labelY);
      context.textAlign = "left";
    });
  }
}

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

function DizyChart({
  candles,
  analysis,
  view,
}: {
  candles: Candle[];
  analysis: StrategyAnalysis;
  view: ViewSettings;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#090c14" },
        textColor: "#8994ad",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
        panes: { separatorColor: "#1b2233", enableResize: true },
      },
      grid: {
        vertLines: { color: "rgba(87,103,139,.1)" },
        horzLines: { color: "rgba(87,103,139,.1)" },
      },
      crosshair: {
        vertLine: { color: "#7182a7", labelBackgroundColor: "#24304a" },
        horzLine: { color: "#7182a7", labelBackgroundColor: "#24304a" },
      },
      rightPriceScale: {
        borderColor: "#20283a",
        scaleMargins: { top: 0.08, bottom: 0.18 },
      },
      timeScale: {
        borderColor: "#20283a",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 7,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#20c997",
      downColor: "#f05268",
      borderVisible: false,
      wickUpColor: "#20c997",
      wickDownColor: "#f05268",
      priceLineColor: "#e2e8f6",
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    candleSeries.setData(
      candles.map((candle) => ({
        ...candle,
        time: candle.time as UTCTimestamp,
      })),
    );
    volumeSeries.setData(
      candles.map((candle) => ({
        time: candle.time as UTCTimestamp,
        value: candle.volume,
        color: candle.close >= candle.open ? "rgba(32,201,151,.23)" : "rgba(240,82,104,.23)",
      })),
    );
    const addLine = (
      data: { time: number; value: number }[],
      color: string,
      width: 1 | 2 | 3,
      style = LineStyle.Solid,
    ) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: width,
        lineStyle: style,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      series.setData(
        data
          .filter((point) => Number.isFinite(point.value))
          .map((point) => ({ ...point, time: point.time as UTCTimestamp })),
      );
      return series;
    };
    if (view.vwap) addLine(analysis.vwap, "#57a5ff", 2);
    addLine(analysis.trend, "#d58bff", 2);
    if (view.channels) {
      addLine(analysis.channelTop, "rgba(103,209,255,.52)", 1, LineStyle.Dashed);
      addLine(analysis.channelBasis, "rgba(103,209,255,.66)", 1);
      addLine(analysis.channelBottom, "rgba(103,209,255,.52)", 1, LineStyle.Dashed);
    }
    if (view.trendlines) {
      addLine(analysis.upperTrendline, "#ff8a65", 2);
      addLine(analysis.lowerTrendline, "#61e7b8", 2);
    }
    if (view.signals || view.waves) {
      createSeriesMarkers(
        candleSeries,
        analysis.markers
          .filter((marker) =>
            marker.text.startsWith("E") ? view.waves : view.signals,
          )
          .map((marker) => ({
            ...marker,
            time: marker.time as UTCTimestamp,
          })),
      );
    }
    chart.timeScale().fitContent();
    chartRef.current = chart;
    candleRef.current = candleSeries;
    const redraw = () => {
      if (overlayRef.current) {
        drawChartOverlay(
          overlayRef.current,
          chart,
          candleSeries,
          candles,
          analysis,
          view,
        );
      }
    };
    const resizeObserver = new ResizeObserver(redraw);
    resizeObserver.observe(containerRef.current);
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    requestAnimationFrame(redraw);
    return () => {
      resizeObserver.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(redraw);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
    };
  }, [analysis, candles, view]);

  return (
    <div className="chart-wrap">
      <div className="chart-canvas" ref={containerRef} />
      <canvas aria-hidden="true" className="chart-overlay" ref={overlayRef} />
      <div className="chart-legend">
        <span><i className="legend-vwap" />VWAP {analysis.vwap.at(-1)?.value.toFixed(1)}</span>
        <span><i className="legend-trend" />Trend MA {analysis.trend.at(-1)?.value.toFixed(1)}</span>
        <span><i className="legend-channel" />LinReg channel</span>
      </div>
    </div>
  );
}

export default function TradingTerminal({ user }: { user: AuthUser }) {
  const [timeframe, setTimeframe] = useState("15m");
  const [candles, setCandles] = useState<Candle[]>(() => generateDemoCandles());
  const [dataSource, setDataSource] = useState("DEMO FEED");
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<"visuals" | "strategy" | "risk">("visuals");
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
    () => analyzeStrategy(candles, strategy),
    [candles, strategy],
  );
  const backtest = useMemo(
    () => simulateConfirmedSignals(candles, analysis, risk),
    [analysis, candles, risk],
  );
  const last = candles.at(-1);
  const firstVisible = candles.at(-97);
  const change = last && firstVisible ? ((last.close - firstVisible.close) / firstVisible.close) * 100 : 0;
  const signalColour =
    analysis.bias === "Bullish" ? "positive" : analysis.bias === "Bearish" ? "negative" : "neutral";

  const loadMarketData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/market?symbol=BTC_USDT&timeframe=${timeframe}`);
      if (!response.ok) throw new Error("Feed unavailable");
      const payload = (await response.json()) as {
        source: string;
        candles: Candle[];
      };
      if (payload.candles.length < 100) throw new Error("Insufficient candle history");
      setCandles(payload.candles);
      setDataSource(payload.source.toUpperCase());
    } catch {
      setCandles(generateDemoCandles());
      setDataSource("DEMO FEED");
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMarketData();
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
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSaveState("error");
      });
    return () => controller.abort();
  }, []);

  const applyPaperSettings = async () => {
    setSaveState("saving");
    try {
      const profileResponse = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ view, strategy, risk }),
      });
      if (!profileResponse.ok) throw new Error("Could not save settings");
      if (executionMode === "Paper") {
        const paperResponse = await fetch("/api/paper", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            symbol: "BTC_USDT",
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
            <strong>DizyCharts</strong>
            <small>&amp; DizySignals</small>
          </div>
        </div>
        <div className="system-strip">
          <span className="connection"><i /> MEXC market feed</span>
          <span className="confirmed">Confirmed candles</span>
          <span className="test-mode">Private test mode</span>
          <span className="lock-status">Live execution locked</span>
        </div>
        <div className="profile">
          <div className="account-switch static-account">
            <span>{user.name.slice(0, 1)}</span>
            <b>{user.name}</b>
            <em>{user.role}</em>
          </div>
          <button aria-label="Open settings" className="icon-button" type="button" onClick={() => setSettingsOpen((open) => !open)}>
            ⚙
          </button>
          <a aria-label="Sign out" className="icon-button signout-button" href="/api/auth/logout">
            ↗
          </a>
        </div>
      </header>

      <section className="market-toolbar">
        <div className="symbol-block">
          <span className="coin">₿</span>
          <div><strong>BTC / USDT</strong><small>MEXC perpetual</small></div>
        </div>
        <div className="quote-block">
          <strong>{last ? currency.format(last.close) : "—"}</strong>
          <span className={change >= 0 ? "positive" : "negative"}>{signed(change)}</span>
        </div>
        <div className="toolbar-divider" />
        <div className="timeframes" aria-label="Chart timeframe">
          {["5m", "15m", "1h", "4h"].map((item) => (
            <button
              className={timeframe === item ? "active" : ""}
              key={item}
              onClick={() => setTimeframe(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="toolbar-divider" />
        <button className="preset-button" type="button">
          <span>Preset</span>
          <strong>Scalping · 15m</strong>
        </button>
        <button className="refresh-button" disabled={loading} onClick={loadMarketData} type="button">
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
              <span>{candles.length} bars</span>
              <span>Last signal: {analysis.lastSignal}</span>
            </div>
          </div>
          <DizyChart analysis={analysis} candles={candles} view={view} />
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

        <aside className="settings-panel" aria-label="DizySignals settings">
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
                <div className="setting-section">
                  <h3>
                    Chart layers
                    <span>
                      {Object.values(view).filter((value) => typeof value === "boolean" && value).length} active
                    </span>
                  </h3>
                  <IndicatorToggle checked={view.supportResistance} colour="#2ee6a6" label="Support & resistance zones" onChange={(value) => setViewKey("supportResistance", value)} />
                  <IndicatorToggle checked={view.vwap} colour="#57a5ff" label="Rolling VWAP" onChange={(value) => setViewKey("vwap", value)} />
                  <IndicatorToggle checked={view.fibonacci} colour="#ffd071" label="Fibonacci levels" onChange={(value) => setViewKey("fibonacci", value)} />
                  <IndicatorToggle checked={view.channels} colour="#67d1ff" label="Regression channel" onChange={(value) => setViewKey("channels", value)} />
                  <IndicatorToggle checked={view.trendlines} colour="#ff8a65" label="Pivot trendlines" onChange={(value) => setViewKey("trendlines", value)} />
                  <IndicatorToggle checked={view.triangles} colour="#ff5c70" label="Shaded triangles" onChange={(value) => setViewKey("triangles", value)} />
                  <IndicatorToggle checked={view.volumeProfile} colour="#8c7dff" label="Right volume profile" onChange={(value) => setViewKey("volumeProfile", value)} />
                  <IndicatorToggle checked={view.waves} colour="#b994ff" label="Elliott / Wyckoff labels" onChange={(value) => setViewKey("waves", value)} />
                  <IndicatorToggle checked={view.signals} colour="#f2f5fb" label="BUY / SELL signals" onChange={(value) => setViewKey("signals", value)} />
                </div>
                <div className="setting-section">
                  <h3>Display density</h3>
                  <label className="field-row">
                    <span>Label size</span>
                    <select value={view.labelSize} onChange={(event) => setViewKey("labelSize", event.target.value as ViewSettings["labelSize"])}>
                      <option>Small</option><option>Medium</option><option>Large</option>
                    </select>
                  </label>
                  <RangeField label="Volume lookback" max={600} min={60} onChange={(value) => setViewKey("volumeBars", value)} step={20} suffix="bars" value={view.volumeBars} />
                  <RangeField label="Profile rows" max={80} min={12} onChange={(value) => setViewKey("volumeRows", value)} suffix="rows" value={view.volumeRows} />
                </div>
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
        </aside>
      </div>
    </main>
  );
}
