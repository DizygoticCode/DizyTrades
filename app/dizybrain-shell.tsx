"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DizyBrainSnapshot } from "./lib/dizybrain-snapshot";
import type { DizyFlowIntelligenceSnapshot } from "./lib/order-flow/intelligence";
import type { FlowRenderDiagnostics } from "./lib/order-flow/render-store";
import type { FlowSummary } from "./lib/order-flow/use-order-flow";
import type { ReplaySession } from "./lib/replay";
import type { HistoricalDizyFlowMemory } from "./lib/historical-dizyflow";
import type { HistoricalDizyFlowReplayView } from "./lib/historical-dizyflow-replay";
import {
  clampDizyBrainWidth, DEFAULT_DIZYBRAIN_PREFERENCES, DIZYBRAIN_DEFAULT_WIDTH,
  DIZYBRAIN_MAX_WIDTH, DIZYBRAIN_MIN_WIDTH, DIZYBRAIN_MODULES,
  DIZYBRAIN_WORKSPACE_STORAGE_KEY, parseDizyBrainPreferences,
  shouldUseDizyBrainOverlay,
  presentOverviewFlow,
  type DizyBrainWorkspaceModule, type DizyBrainWorkspacePreferences,
} from "./lib/dizybrain-workspace";

export type DizyBrainWorkspaceData = Readonly<{
  snapshot: DizyBrainSnapshot;
  liveFlow: DizyFlowIntelligenceSnapshot | null;
  historicalFlowReplay: HistoricalDizyFlowReplayView | null;
  historicalFlowState: {status:"unavailable";reason:string}|{status:"loading";memoryId:string}|{status:"available";memory:HistoricalDizyFlowMemory}|{status:"error";message:string};
  replaySession: ReplaySession | null;
  symbol: string;
  market: string;
  timeframe: string;
  feedState: string;
  replay: boolean;
  flowEnabled: boolean;
  viewer: boolean;
}>;
export type DizyBrainFlowDiagnostics = Readonly<{ summary: FlowSummary; renderer: FlowRenderDiagnostics; marketDepthVisible: boolean; displayMode: string; retry: () => void }>;

type Controller = {
  preferences: DizyBrainWorkspacePreferences;
  data: DizyBrainWorkspaceData | null;
  launcherRef: React.RefObject<HTMLButtonElement | null>;
  flowDiagnostics: DizyBrainFlowDiagnostics | null;
  publish(data: DizyBrainWorkspaceData): void;
  publishFlowDiagnostics(data: DizyBrainFlowDiagnostics): void;
  open(module?: DizyBrainWorkspaceModule, trigger?: HTMLElement | null): void;
  close(): void;
  update(patch: Partial<DizyBrainWorkspacePreferences>, persist?: boolean): void;
};
const WorkspaceContext = createContext<Controller | null>(null);

export function useDizyBrainWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("DizyBrain workspace must be used inside DizyBrainShell");
  return value;
}

export function DizyBrainSnapshotPublisher({ data }: { data: DizyBrainWorkspaceData }) {
  const { publish } = useDizyBrainWorkspace();
  useEffect(() => publish(data), [data, publish]);
  return null;
}

function BrainMark() { return <span aria-hidden="true">◉</span>; }

export function DizyBrainShell({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_DIZYBRAIN_PREFERENCES);
  const [data, setData] = useState<DizyBrainWorkspaceData | null>(null);
  const [flowDiagnostics, setFlowDiagnostics] = useState<DizyBrainFlowDiagnostics | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const hydrated = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPreferences(parseDizyBrainPreferences(window.localStorage.getItem(DIZYBRAIN_WORKSPACE_STORAGE_KEY)));
      hydrated.current = true;
    });
    return () => window.clearTimeout(timer);
  }, []);
  const update = useCallback((patch: Partial<DizyBrainWorkspacePreferences>, persist = true) => {
    setPreferences(current => {
      const next = { ...current, ...patch, width: clampDizyBrainWidth(patch.width ?? current.width) };
      if (persist && hydrated.current) window.localStorage.setItem(DIZYBRAIN_WORKSPACE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const open = useCallback((module?: DizyBrainWorkspaceModule, trigger?: HTMLElement | null) => { lastTrigger.current = trigger ?? launcherRef.current; update({ open: true, collapsed: false, ...(module ? { selectedModule: module } : {}) }); }, [update]);
  const close = useCallback(() => { update({ open: false }); requestAnimationFrame(() => (lastTrigger.current ?? launcherRef.current)?.focus()); }, [update]);
  const publish = useCallback((next: DizyBrainWorkspaceData) => setData(next), []);
  const publishFlowDiagnostics = useCallback((next: DizyBrainFlowDiagnostics) => setFlowDiagnostics(next), []);
  const controller = useMemo(() => ({ preferences, data, flowDiagnostics, launcherRef, publish, publishFlowDiagnostics, open, close, update }), [preferences, data, flowDiagnostics, publish, publishFlowDiagnostics, open, close, update]);
  return <WorkspaceContext.Provider value={controller}>
    {children}
    <button ref={launcherRef} className="dizybrain-launch" onClick={event => open(undefined, event.currentTarget)} type="button" aria-expanded={preferences.open} aria-controls="dizybrain-workspace">
      <BrainMark /><span><b>DizyBrain</b><small>Analysis Workspace</small></span>
    </button>
  </WorkspaceContext.Provider>;
}

const Row = ({ label, value }: { label: string; value: ReactNode }) => <div className="brain-row"><span>{label}</span><strong>{value ?? "Unavailable"}</strong></div>;
const Disclosure = ({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) => <details className="brain-disclosure" open={open}><summary>{title}</summary><div>{children}</div></details>;

const stamp = (value: number | null) => value ? new Date(value).toISOString() : "Unavailable";
const range = (value: { from: number; to: number } | null) => value ? `${value.from} — ${value.to}` : "Unavailable";

function ModuleBody({ data, diagnostics, module }: { data: DizyBrainWorkspaceData | null; diagnostics: DizyBrainFlowDiagnostics | null; module: DizyBrainWorkspaceModule }) {
  if (!data) return <div className="brain-empty">Waiting for terminal evidence…</div>;
  const { snapshot, liveFlow: flow, historicalFlowReplay: historical } = data;
  const overviewFlow = presentOverviewFlow(data.replay, flow);
  if (module === "overview") return <>
    <Disclosure title="Market" open><Row label="Identity" value={`${data.symbol} · ${data.market}`} /><Row label="Timeframe" value={data.timeframe} /><Row label="Feed" value={data.feedState} /></Disclosure>
    <Disclosure title="Signal" open><Row label="Classification" value={data.replay ? "Unavailable in historical Replay" : snapshot.currentDirection} /><Row label="Confluence" value={`${snapshot.activeConfluence} / 5`} /><Row label="Confirmed candle" value={snapshot.confirmedSignal ?? "No signal"} /></Disclosure>
    <Disclosure title="Flow">{data.replay ? <><Row label="Historical DizyFlow" value={data.historicalFlowState.status} /><Row label="Sample" value={historical?.sample ? stamp(historical.sample.timeMs) : "Unavailable"} /><Row label="Confidence" value={historical?.sample ? `${historical.sample.intelligenceConfidence}% · ${historical.sample.confidenceBand}` : "Unavailable"} /><Row label="Events this step" value={historical?.eventsAtStep.length??0} /></> : overviewFlow.hidden ? <p>{overviewFlow.message}</p> : <><Row label="Availability" value={overviewFlow.availability} /><Row label="Confidence" value={overviewFlow.confidence} /><Row label="Visible walls" value={overviewFlow.walls} /></>}</Disclosure>
    <Disclosure title="Position & Replay"><Row label="Manual Paper" value="Use authoritative ticket below chart" /><Row label="Mode" value={data.replay ? "Historical Replay" : "Live terminal"} /><Row label="Historical DizyFlow" value="Metadata only" /></Disclosure>
  </>;
  if (module === "signals") return data.replay ? <div className="brain-empty">Live signal evidence is hidden during historical Replay.</div> : <>
    <Disclosure title="Current confirmed-candle evidence" open><Row label="Direction" value={snapshot.currentDirection} /><Row label="Long / Short" value={`${snapshot.longScore}/5 · ${snapshot.shortScore}/5`} /><Row label="Threshold" value={snapshot.qualificationThreshold} /><Row label="Phase" value={snapshot.marketPhase} /><Row label="Bias" value={snapshot.marketBias} /></Disclosure>
    <Disclosure title="Qualification checks">{snapshot.checklist.map(item => <Row key={item.id} label={item.label} value={item.passed ? "Passed" : "Waiting"} />)}</Disclosure>
    <Disclosure title="Current setup timeline">{snapshot.explanation.timeline.map(item => <Row key={item.label} label={item.label} value={`${item.state} · ${item.detail}`} />)}<p className="brain-note">Historical per-candle rule events will require a dedicated rule ledger.</p></Disclosure>
    <Disclosure title="Why this is not qualified yet">{snapshot.explanation.rejectionReasons.length ? snapshot.explanation.rejectionReasons.map(reason => <p key={reason}>{reason}</p>) : <p>Current deterministic qualification checks passed.</p>}</Disclosure>
    <p className="brain-note">Signals use confirmed candles and entries are modelled on the following bar. Classification is not a prediction.</p>
  </>;
  if (module === "flow") {
    if (data.replay) return <HistoricalFlowModule data={data}/>;
    if (!data.flowEnabled) return <div className="brain-empty">DizyFlow is off. Enable it from the compact chart toolbar.</div>;
    if (!flow) return <div className="brain-empty">Waiting for a valid public depth snapshot…</div>;
    return <><Disclosure title="Summary" open><Row label="Feed" value={flow.availability} /><Row label="Evidence confidence" value={`${flow.intelligenceConfidence}% · ${flow.confidenceBand}`} /><Row label="Reference" value={`${flow.referencePriceSource} · ${flow.referencePrice}`} /><Row label="Spread" value={flow.spread.percentage === null ? "Unavailable" : `${flow.spread.percentage.toFixed(4)}% · ${flow.spread.classification}`} /></Disclosure>
      <Disclosure title="Liquidity"><Row label="Visible wall candidates" value={flow.walls.candidates.length} /><Row label="Withdrawals / replenishments" value={`${flow.walls.withdrawals.length} / ${flow.walls.replenishment.length}`} />{diagnostics?.marketDepthVisible ? <><Row label="Market Depth bid / ask" value={`${diagnostics.renderer.marketDepthBidTotal.toLocaleString()} / ${diagnostics.renderer.marketDepthAskTotal.toLocaleString()}`} /><Row label="Depth imbalance" value={diagnostics.summary.imbalance === null ? "Unavailable" : `${diagnostics.summary.imbalance.toFixed(1)}%`} /><Row label="Large clusters" value={diagnostics.renderer.marketDepthClusters} /><Row label="Presentation" value={`${diagnostics.renderer.marketDepthScaling} · ${diagnostics.displayMode}`} /><p className="brain-note">Resting orders can be cancelled, moved or consumed and do not predict future price.</p></> : <Row label="Market Depth visual" value="Off" />}<div className="brain-table"><table><thead><tr><th>Band</th><th>Bid</th><th>Ask</th><th>Imbalance</th></tr></thead><tbody>{flow.depth.bands.map((band, index) => <tr key={band.bandPct}><th>{band.bandPct}%</th><td>{band.bidNotional.toLocaleString()}</td><td>{band.askNotional.toLocaleString()}</td><td>{flow.imbalance.bands[index].value === null ? "—" : `${(flow.imbalance.bands[index].value! * 100).toFixed(1)}%`}</td></tr>)}</tbody></table></div></Disclosure>
      <Disclosure title="Trade Flow & Events"><Row label="Public trades" value={flow.trades.available ? flow.trades.tradeCount : "Unavailable"} /><Row label="Aggressor imbalance" value={flow.trades.aggressorImbalance === null ? "Unavailable" : `${(flow.trades.aggressorImbalance * 100).toFixed(1)}%`} /><Row label="Sweep / absorption candidates" value={`${flow.sweeps.candidates.length} / ${flow.absorption.candidates.length}`} />{flow.findings.map(finding => <p className="brain-finding" key={finding.code}><b>{finding.title}</b>{finding.summary}</p>)}</Disclosure>
      <Disclosure title={`Evidence & Limitations (${flow.limitations.length})`}>{flow.confidenceReasons.map(reason => <p key={reason}>{reason}</p>)}{flow.limitations.map(item => <p key={item.code}>{item.message}</p>)}</Disclosure></>;
  }
  if (module === "position") return <><div className="brain-empty">Manual Paper position context is read-only here.</div><Row label="Authoritative controls" value="Manual Paper ticket below chart" /><button onClick={() => { const ticket=document.getElementById("manual-paper-panel"); ticket?.scrollIntoView({ behavior: "smooth" }); ticket?.focus({ preventScroll: true }); }} type="button">Focus Manual Paper</button></>;
  if (module === "replay") return <><Disclosure title="Playback" open><Row label="State / speed" value={data.replaySession?`${data.replaySession.status} · ${data.replaySession.speed}×`:"Inactive"}/><Row label="Candle" value={data.replaySession?`${data.replaySession.visibleCandles} / ${data.replaySession.candlesLoaded}`:"Unavailable"}/><Row label="Replay timestamp" value={stamp(data.replaySession?.cursorTimeMs??null)}/></Disclosure><Disclosure title="Historical DizyFlow"><Row label="Memory" value={data.historicalFlowState.status}/><Row label="Sample coverage" value={historical?`${historical.memory.summary.sampleCoveragePct}%`:"Unavailable"}/><Row label="Retained events" value={historical?.memory.integrity.eventCount??"Unavailable"}/><Row label="Current match" value={historical?.status??"Unavailable"}/></Disclosure></>;
  if (module === "journal") return <><Row label="DizyBrain Review" value="Available for completed Journal trades" /><Row label="Historical Replay Memory" value="Managed by DizyJournal" /><a className="brain-action" href="/journal">Open DizyJournal</a></>;
  if (module === "behaviour") return <><Row label="Behaviour Engine" value="Available in DizyJournal" /><p className="brain-note">No Journal scan or background polling is performed by the terminal.</p><a className="brain-action" href="/journal#behaviour">Open Behaviour</a></>;
  return <DiagnosticsModule data={data} diagnostics={diagnostics} flow={flow} />;
}

function HistoricalFlowModule({data}:{data:DizyBrainWorkspaceData}) {
  const state=data.historicalFlowState,view=data.historicalFlowReplay;
  if(state.status!=="available")return <div className="brain-empty">{state.status==="loading"?"Loading Historical DizyFlow…":state.status==="error"?state.message:state.reason}</div>;
  if(!view?.sample)return <><h3>Historical DizyFlow — retained live public evidence</h3><div className="brain-empty">{view?.unavailableReason==="sample-too-old"?"The latest retained DizyFlow sample is outside the permitted historical matching window.":"No retained DizyFlow sample is available for this point."}</div></>;
  const {memory,sample}=view;
  return <><h3>Historical DizyFlow — retained live public evidence</h3><p className="brain-note">Compact public evidence captured live; not a reconstructed order book or trade tape.</p><Disclosure title="Capture" open><Row label="Provenance" value="Live DizyFlow Intelligence · server validated"/><Row label="Memory" value={`${memory.id.slice(0,12)}…`}/><Row label="Capture range" value={`${stamp(memory.captureStartMs)} — ${stamp(memory.captureEndMs)}`}/><Row label="Coverage" value={`${memory.summary.sampleCoveragePct}% · ${memory.integrity.gapCount} gaps`}/></Disclosure><Disclosure title="Current historical sample" open><Row label="Replay / sample" value={`${stamp(view.replayTimeMs)} / ${stamp(sample.timeMs)}`}/><Row label="Age / availability" value={`${view.sampleAgeMs}ms · ${view.status}`}/><Row label="Evidence confidence" value={`${sample.intelligenceConfidence}% · ${sample.confidenceBand}`}/><Row label="Reference" value={`${sample.referencePriceSource} · ${sample.referencePrice}`}/><Row label="Spread" value={sample.spreadPct===null?"Unavailable":`${sample.spreadPct}%`}/></Disclosure><Disclosure title="Depth"><div className="brain-table"><table><thead><tr><th>Band</th><th>Bid</th><th>Ask</th><th>Imbalance</th></tr></thead><tbody>{sample.depthBands.map(b=><tr key={b.bandPct}><th>{b.bandPct}%</th><td>{b.bidNotional.toLocaleString()}</td><td>{b.askNotional.toLocaleString()}</td><td>{b.centredImbalance===null?"—":`${(b.centredImbalance*100).toFixed(1)}%`}</td></tr>)}</tbody></table></div><Row label="Nearest bid wall" value={sample.nearestBidWall?`${sample.nearestBidWall.price} · ${sample.nearestBidWall.status}`:"Unavailable"}/><Row label="Nearest ask wall" value={sample.nearestAskWall?`${sample.nearestAskWall.price} · ${sample.nearestAskWall.status}`:"Unavailable"}/></Disclosure><Disclosure title="Trade flow & retained events"><Row label="Aggressor imbalance" value={sample.tradeFlowImbalance===null?"Unavailable":`${(sample.tradeFlowImbalance*100).toFixed(1)}%`}/>{view.eventsAtStep.length?view.eventsAtStep.map(event=><p key={event.id}>{stamp(event.timeMs)} · {event.type.replaceAll("-"," ")} {event.side??""}</p>):<p>No retained events at this step.</p>}</Disclosure><Disclosure title="Limitations"><p>{[...memory.limitations,...sample.limitationCodes].join(", ")||"No additional limitations retained."}</p></Disclosure></>;
}

function DiagnosticsModule({data,diagnostics,flow}:{data:DizyBrainWorkspaceData;diagnostics:DizyBrainFlowDiagnostics|null;flow:DizyFlowIntelligenceSnapshot|null}) {
  const [retryStatus,setRetryStatus]=useState("");
  if(!diagnostics)return <div className="brain-empty">Current live public-feed diagnostics are unavailable.</div>;
  const s=diagnostics.summary,r=diagnostics.renderer,coverage=s.archiveStartMs&&s.archiveEndMs?Math.max(0,s.archiveEndMs-s.archiveStartMs):0;
  return <>
    {data.replay?<><Disclosure title="Historical Replay evidence" open><Row label="Memory" value={data.historicalFlowState.status==="available"?data.historicalFlowState.memory.id:data.historicalFlowState.status}/><Row label="Schema / validation" value={data.historicalFlowState.status==="available"?`${data.historicalFlowState.memory.schemaVersion} / ${data.historicalFlowState.memory.validationVersion}`:"Unavailable"}/><Row label="Content hash" value={data.historicalFlowState.status==="available"?"Server validated":"Unavailable"}/><Row label="Samples / events" value={data.historicalFlowState.status==="available"?`${data.historicalFlowState.memory.integrity.sampleCount} / ${data.historicalFlowState.memory.integrity.eventCount}`:"Unavailable"}/></Disclosure><p className="brain-note">Current live feed — not historical Replay evidence.</p></>:null}
    <Disclosure title={data.replay?"Current live terminal diagnostics":"Feed"} open><Row label="WebSocket state / active symbol" value={`${s.wsState} · ${s.activeSymbol||"Unavailable"}`} /><Row label="Server snapshot / local version" value={`${s.snapshotVersion} / ${s.version}`} /><Row label="Buffered updates" value={s.bufferedUpdates} /><Row label="Snapshot bids / asks" value={`${s.snapshotBids} / ${s.snapshotAsks}`} /><Row label="Book bids / asks" value={`${s.bookBids} / ${s.bookAsks}`} /><Row label="Depth received / applied" value={`${s.depthMessagesReceived} / ${s.depthMessagesApplied}`} /><Row label="Version gaps / current gap" value={`${s.versionGaps} / ${s.currentGap??"none"}`} /><Row label="Recovery attempts" value={s.recoveryAttempts} /><Row label="Last recovery / upstream error" value={`${s.lastRecoveryError??"none"} / ${s.lastUpstreamError??"none"}`} /><Row label="Last valid snapshot / age" value={`${stamp(s.lastValidUpdate)} · ${s.latencyMs}ms`} /><Row label="Last trade event" value={stamp(s.lastTradeEvent)} /><button type="button" disabled={data.replay} onClick={()=>{diagnostics.retry();setRetryStatus("Retry requested for the current public feed.")}}>Retry public feed</button>{retryStatus?<p role="status" className="brain-note">{retryStatus}</p>:null}</Disclosure>
    <Disclosure title="Public trades"><Row label="REST loaded / websocket received" value={`${s.restTradesLoaded} / ${s.dealsReceived}`} /><Row label="Duplicate trades rejected" value={s.duplicatesRejected} /><Row label="Accepted / rejected / below threshold" value={`${s.dealsAccepted} / ${s.rejectedTimestamps} / ${s.belowThresholdDeals}`} /></Disclosure>
    <Disclosure title="Heatmap"><Row label="Captured history / retention" value={`${Math.floor(coverage/60000)}m · ${s.historyGaps?"gaps present":"building or ready"}`} /><Row label="Archive coverage" value={`${stamp(s.archiveStartMs)} — ${stamp(s.archiveEndMs)}`} /><Row label="Retained / candidate / projected / drawn" value={`${r.heatmapObservationsRetained} / ${r.heatmapCandidateCells} / ${r.heatmapProjectedCells} / ${r.heatmapCellsDrawn}`} /><Row label="Renderer status / error" value={`${r.failure??"OK"} / ${r.lastRendererError??"none"}`} /><Row label="Visible / loaded ranges" value={`${range(r.visibleLogicalRange)} · ${range(r.loadedHistoryRange)}`} /><Row label="History pages / browser cache" value={`${r.cachedHistoryPages} / ${r.browserCacheRecords}`} /><Row label="Tiles started / completed / aborted / failed" value={`${r.tileRequestsStarted} / ${r.tileRequestsCompleted} / ${r.tileRequestsAborted} / ${r.tileRequestsFailed}`} /><Row label="Cache hits / misses" value={`${r.tileCacheHits} / ${r.tileCacheMisses}`} /><Row label="Requested / successful ranges" value={`${range(r.lastRequestedTileRange)} · ${range(r.lastSuccessfulTileRange)}`} /><Row label="Latest HTTP / error" value={`${r.lastTileHttpStatus??"—"} / ${r.lastTileError??"none"}`} /><Row label="Effective time / price bins" value={`${r.effectiveTimeSliceMs}ms / ${r.effectiveHeatmapBinSize}`} /><Row label="Rebuild / patch / reuse" value={`${r.retainedFullRebuilds} / ${r.retainedIncrementalPatches} / ${r.retainedSurfaceReuses}`} /></Disclosure>
    <Disclosure title="Market Depth"><Row label="Visible bid / ask rows" value={`${r.marketDepthVisibleBids} / ${r.marketDepthVisibleAsks}`} /><Row label="Bid / ask totals" value={`${r.marketDepthBidTotal} / ${r.marketDepthAskTotal}`} /><Row label="Scaling / maximum size" value={`${r.marketDepthScaling} / ${r.marketDepthMaximumSize}`} /><Row label="Cluster count" value={r.marketDepthClusters} /><Row label="Paint / skipped redraws" value={`${r.marketDepthPaintCalls} / ${r.marketDepthSkippedRedraws}`} /><Row label="Data age / symbol" value={`${r.marketDepthLastUpdateAgeMs??"—"}ms / ${r.marketDepthSymbol||"—"}`} /></Disclosure>
    <Disclosure title="DOM"><Row label="Visible / generated / overscan" value={`${r.domVisibleRows} / ${r.domTotalRows} / ${r.domOverscan}`} /><Row label="Centre / navigation" value={`${r.domCentrePrice??"—"} / ${r.domNavigation}`} /><Row label="Book age / render count" value={`${r.domBookAgeMs??"—"}ms / ${r.domRenderCount}`} /><Row label="Flashes / clusters / queue" value={`${r.domRecentFlashes} / ${r.domClusterRows} / ${r.domQueueCalculations}`} /><Row label="Symbol / grouping / book state" value={`${r.domSymbol||"—"} / ${r.domGroupingStep} / ${r.domBookState}`} /></Disclosure>
    <Disclosure title="Renderer"><Row label="Primitive attached / render enabled" value={`${r.primitiveAttached} / ${r.renderEnabled}`} /><Row label="Heatmap / bubbles visible" value={`${r.heatmapVisible} / ${r.bubblesVisible}`} /><Row label="Paint calls / candles" value={`${r.paintCallCount} / ${r.candleCount}`} /><Row label="Logical range" value={range(r.visibleLogicalRange)} /><Row label="Raw trades / bubble groups / drawn" value={`${r.rawTradesRetained} / ${r.bubbleGroupsProduced} / ${r.bubblesDrawn}`} /><Row label="Rejected threshold / time / price" value={`${r.bubblesRejectedBelowThreshold} / ${r.bubblesRejectedByTimeProjection} / ${r.bubblesRejectedByPriceProjection}`} /><Row label="Price step" value={r.currentPriceStep} /><Row label="Drawing failure / renderer error" value={`${r.failure??"none"} / ${r.lastRendererError??"none"}`} /><Row label="Engine / schema / config" value={`${flow?.engineVersion??"—"} / ${flow?.schemaVersion??"—"} / ${flow?.configVersion??"—"}`} /></Disclosure>
  </>;
}

export function DizyBrainWorkspace() {
  const { preferences, data, flowDiagnostics, open, close, update } = useDizyBrainWorkspace();
  const panelRef = useRef<HTMLElement>(null);
  const dragging = useRef(false);
  const [availableWidth, setAvailableWidth] = useState(0);
  const overlay = shouldUseDizyBrainOverlay(availableWidth, preferences.width);
  useEffect(() => {
    const layout = document.querySelector<HTMLElement>(".terminal-body-layout");
    if (!layout) return;
    const measure = () => setAvailableWidth(layout.clientWidth);
    const observer = new ResizeObserver(measure); observer.observe(layout); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("brain");
    const requestedModule = DIZYBRAIN_MODULES.find(item => item.id === query)?.id;
    if (requestedModule) open(requestedModule);
  }, [open]);
  useEffect(() => {
    if (!preferences.open) return;
    const narrow = overlay;
    if (narrow) document.body.style.overflow = "hidden";
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && narrow) close();
      if (event.key !== "Tab" || !narrow || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"]')];
      if (!items.length) return;
      const first = items[0], last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    if (narrow) requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("button")?.focus());
    return () => { document.removeEventListener("keydown", keyboard); if (narrow) document.body.style.overflow = ""; };
  }, [preferences.open, overlay, close]);
  if (!preferences.open) return null;
  const resize = (width: number, persist = true) => update({ width: clampDizyBrainWidth(width) }, persist);
  const onPointerDown = (event: React.PointerEvent) => {
    dragging.current = true; document.body.classList.add("brain-resizing"); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => { if (dragging.current) { const bodyRight = document.querySelector<HTMLElement>(".terminal-body-layout")?.getBoundingClientRect().right ?? window.innerWidth; resize(bodyRight - event.clientX, false); } };
  const onPointerUp = (event: React.PointerEvent) => { if (!dragging.current) return; dragging.current = false; document.body.classList.remove("brain-resizing"); event.currentTarget.releasePointerCapture(event.pointerId); resize(preferences.width); };
  if (preferences.collapsed && !overlay) return <aside className="dizybrain-rail" aria-label="DizyBrain Analysis Workspace"><button aria-label="Expand DizyBrain workspace" onClick={() => update({ collapsed: false })}>»</button>{DIZYBRAIN_MODULES.map(item => <button aria-label={item.label} aria-current={preferences.selectedModule === item.id ? "page" : undefined} key={item.id} onClick={() => open(item.id)}>{item.icon}<span>{item.label}</span></button>)}</aside>;
  return <><button className={`brain-mobile-backdrop ${overlay ? "visible" : ""}`} aria-label="Close DizyBrain workspace" onClick={close} type="button" /><aside id="dizybrain-workspace" ref={panelRef} className={`dizybrain-workspace ${overlay ? "drawer" : ""}`} style={{ "--brain-width": `${preferences.width}px` } as React.CSSProperties} aria-label="DizyBrain Analysis Workspace">
    {!overlay ? <div className="brain-resize" role="separator" aria-label="Resize DizyBrain workspace" aria-orientation="vertical" aria-valuemin={DIZYBRAIN_MIN_WIDTH} aria-valuemax={DIZYBRAIN_MAX_WIDTH} aria-valuenow={preferences.width} tabIndex={0} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onDoubleClick={() => resize(DIZYBRAIN_DEFAULT_WIDTH)} onKeyDown={event => { const step = event.shiftKey ? 48 : 16; if (event.key === "ArrowLeft") resize(preferences.width + step); else if (event.key === "ArrowRight") resize(preferences.width - step); else if (event.key === "Home") resize(DIZYBRAIN_MIN_WIDTH); else if (event.key === "End") resize(DIZYBRAIN_MAX_WIDTH); else return; event.preventDefault(); }} /> : null}
    <header className="brain-header"><div><strong>DIZY<span>BRAIN</span></strong><small>Analysis Workspace</small></div><div><button className="brain-collapse" aria-label="Collapse DizyBrain workspace" onClick={() => update({ collapsed: true })}>‹</button><button className="brain-close" aria-label="Close DizyBrain workspace" onClick={close}>×</button></div></header>
    <div className="brain-status"><span>{data?.replay ? "Historical" : "Live"}</span><b>{data?.symbol ?? "No market"}</b><span>{data?.feedState ?? "Loading"}</span></div>
    <nav className="brain-nav" aria-label="DizyBrain modules">{DIZYBRAIN_MODULES.map(item => <button aria-current={preferences.selectedModule === item.id ? "page" : undefined} key={item.id} onClick={() => update({ selectedModule: item.id })}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</nav>
    <section className="brain-module" aria-labelledby="brain-module-title"><h2 id="brain-module-title">{DIZYBRAIN_MODULES.find(item => item.id === preferences.selectedModule)?.label}</h2><ModuleBody data={data} diagnostics={flowDiagnostics} module={preferences.selectedModule} /></section>
  </aside></>;
}
