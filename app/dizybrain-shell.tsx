"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DizyBrainSnapshot } from "./lib/dizybrain-snapshot";
import type { DizyFlowIntelligenceSnapshot } from "./lib/order-flow/intelligence";
import {
  clampDizyBrainWidth, DEFAULT_DIZYBRAIN_PREFERENCES, DIZYBRAIN_DEFAULT_WIDTH,
  DIZYBRAIN_MAX_WIDTH, DIZYBRAIN_MIN_WIDTH, DIZYBRAIN_MODULES,
  DIZYBRAIN_WORKSPACE_STORAGE_KEY, parseDizyBrainPreferences,
  type DizyBrainWorkspaceModule, type DizyBrainWorkspacePreferences,
} from "./lib/dizybrain-workspace";

export type DizyBrainWorkspaceData = Readonly<{
  snapshot: DizyBrainSnapshot;
  intelligence: DizyFlowIntelligenceSnapshot | null;
  symbol: string;
  market: string;
  timeframe: string;
  feedState: string;
  replay: boolean;
  flowEnabled: boolean;
  viewer: boolean;
}>;

type Controller = {
  preferences: DizyBrainWorkspacePreferences;
  data: DizyBrainWorkspaceData | null;
  launcherRef: React.RefObject<HTMLButtonElement | null>;
  publish(data: DizyBrainWorkspaceData): void;
  open(module?: DizyBrainWorkspaceModule): void;
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
  const launcherRef = useRef<HTMLButtonElement>(null);
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
  const open = useCallback((module?: DizyBrainWorkspaceModule) => update({ open: true, collapsed: false, ...(module ? { selectedModule: module } : {}) }), [update]);
  const close = useCallback(() => { update({ open: false }); requestAnimationFrame(() => launcherRef.current?.focus()); }, [update]);
  const publish = useCallback((next: DizyBrainWorkspaceData) => setData(next), []);
  const controller = useMemo(() => ({ preferences, data, launcherRef, publish, open, close, update }), [preferences, data, publish, open, close, update]);
  return <WorkspaceContext.Provider value={controller}>
    {children}
    <button ref={launcherRef} className="dizybrain-launch" onClick={() => open()} type="button" aria-expanded={preferences.open} aria-controls="dizybrain-workspace">
      <BrainMark /><span><b>DizyBrain</b><small>Analysis Workspace</small></span>
    </button>
  </WorkspaceContext.Provider>;
}

const Row = ({ label, value }: { label: string; value: ReactNode }) => <div className="brain-row"><span>{label}</span><strong>{value ?? "Unavailable"}</strong></div>;
const Disclosure = ({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) => <details className="brain-disclosure" open={open}><summary>{title}</summary><div>{children}</div></details>;

function ModuleBody({ data, module }: { data: DizyBrainWorkspaceData | null; module: DizyBrainWorkspaceModule }) {
  if (!data) return <div className="brain-empty">Waiting for terminal evidence…</div>;
  const { snapshot, intelligence: flow } = data;
  if (module === "overview") return <>
    <Disclosure title="Market" open><Row label="Identity" value={`${data.symbol} · ${data.market}`} /><Row label="Timeframe" value={data.timeframe} /><Row label="Feed" value={data.feedState} /></Disclosure>
    <Disclosure title="Signal" open><Row label="Classification" value={data.replay ? "Unavailable in historical Replay" : snapshot.currentDirection} /><Row label="Confluence" value={`${snapshot.activeConfluence} / 5`} /><Row label="Confirmed candle" value={snapshot.confirmedSignal ?? "No signal"} /></Disclosure>
    <Disclosure title="Flow"><Row label="Availability" value={data.replay ? "Live evidence hidden" : flow?.availability ?? "Unavailable"} /><Row label="Confidence" value={data.replay ? "Unavailable" : flow ? `${flow.intelligenceConfidence}% · ${flow.confidenceBand}` : "Unavailable"} /><Row label="Visible walls" value={flow?.walls.candidates.length ?? 0} /></Disclosure>
    <Disclosure title="Position & Replay"><Row label="Manual Paper" value="Use authoritative ticket below chart" /><Row label="Mode" value={data.replay ? "Historical Replay" : "Live terminal"} /><Row label="Historical DizyFlow" value="Metadata only" /></Disclosure>
  </>;
  if (module === "signals") return data.replay ? <div className="brain-empty">Live signal evidence is hidden during historical Replay.</div> : <>
    <Disclosure title="Current confirmed-candle evidence" open><Row label="Direction" value={snapshot.currentDirection} /><Row label="Long / Short" value={`${snapshot.longScore}/5 · ${snapshot.shortScore}/5`} /><Row label="Threshold" value={snapshot.qualificationThreshold} /><Row label="Phase" value={snapshot.marketPhase} /><Row label="Bias" value={snapshot.marketBias} /></Disclosure>
    <Disclosure title="Qualification checks">{snapshot.checklist.map(item => <Row key={item.id} label={item.label} value={item.passed ? "Passed" : "Waiting"} />)}</Disclosure>
    <p className="brain-note">Signals use confirmed candles and entries are modelled on the following bar. Classification is not a prediction.</p>
  </>;
  if (module === "flow") {
    if (data.replay) return <><div className="brain-empty">Live DizyFlow hidden during historical Replay.</div><Row label="Historical DizyFlow" value="Retained metadata only; Replay presentation is not available yet" /></>;
    if (!data.flowEnabled) return <div className="brain-empty">DizyFlow is off. Enable it from the compact chart toolbar.</div>;
    if (!flow) return <div className="brain-empty">Waiting for a valid public depth snapshot…</div>;
    return <><Disclosure title="Summary" open><Row label="Feed" value={flow.availability} /><Row label="Evidence confidence" value={`${flow.intelligenceConfidence}% · ${flow.confidenceBand}`} /><Row label="Reference" value={`${flow.referencePriceSource} · ${flow.referencePrice}`} /><Row label="Spread" value={flow.spread.percentage === null ? "Unavailable" : `${flow.spread.percentage.toFixed(4)}% · ${flow.spread.classification}`} /></Disclosure>
      <Disclosure title="Liquidity"><Row label="Visible wall candidates" value={flow.walls.candidates.length} /><Row label="Withdrawals / replenishments" value={`${flow.walls.withdrawals.length} / ${flow.walls.replenishment.length}`} /><div className="brain-table"><table><thead><tr><th>Band</th><th>Bid</th><th>Ask</th><th>Imbalance</th></tr></thead><tbody>{flow.depth.bands.map((band, index) => <tr key={band.bandPct}><th>{band.bandPct}%</th><td>{band.bidNotional.toLocaleString()}</td><td>{band.askNotional.toLocaleString()}</td><td>{flow.imbalance.bands[index].value === null ? "—" : `${(flow.imbalance.bands[index].value! * 100).toFixed(1)}%`}</td></tr>)}</tbody></table></div></Disclosure>
      <Disclosure title="Trade Flow & Events"><Row label="Public trades" value={flow.trades.available ? flow.trades.tradeCount : "Unavailable"} /><Row label="Aggressor imbalance" value={flow.trades.aggressorImbalance === null ? "Unavailable" : `${(flow.trades.aggressorImbalance * 100).toFixed(1)}%`} /><Row label="Sweep / absorption candidates" value={`${flow.sweeps.candidates.length} / ${flow.absorption.candidates.length}`} />{flow.findings.map(finding => <p className="brain-finding" key={finding.code}><b>{finding.title}</b>{finding.summary}</p>)}</Disclosure>
      <Disclosure title={`Evidence & Limitations (${flow.limitations.length})`}>{flow.confidenceReasons.map(reason => <p key={reason}>{reason}</p>)}{flow.limitations.map(item => <p key={item.code}>{item.message}</p>)}</Disclosure></>;
  }
  if (module === "position") return <><div className="brain-empty">Manual Paper position context is read-only here.</div><Row label="Authoritative controls" value="Manual Paper ticket below chart" /><button onClick={() => document.querySelector<HTMLElement>(".manual-paper-ticket")?.scrollIntoView({ behavior: "smooth" })} type="button">Focus Manual Paper</button></>;
  if (module === "replay") return <><Row label="Mode" value={data.replay ? "Historical Replay" : "Live"} /><Row label="Retained candles" value={data.replay ? "Available for current session" : "Available when launched from Journal"} /><Row label="Historical DizyFlow" value="Unavailable for presentation until a later release" /></>;
  if (module === "journal") return <><Row label="DizyBrain Review" value="Available for completed Journal trades" /><Row label="Historical Replay Memory" value="Managed by DizyJournal" /><a className="brain-action" href="/journal">Open DizyJournal</a></>;
  if (module === "behaviour") return <><Row label="Behaviour Engine" value="Available in DizyJournal" /><p className="brain-note">No Journal scan or background polling is performed by the terminal.</p><a className="brain-action" href="/journal#behaviour">Open Behaviour</a></>;
  return <><Disclosure title="Terminal" open><Row label="Market" value={`${data.market} · ${data.symbol}`} /><Row label="Chart feed" value={data.feedState} /><Row label="Replay" value={data.replay ? "Historical source active" : "Idle"} /><Row label="Viewer mode" value={data.viewer ? "Read only" : "Owner"} /></Disclosure><Disclosure title="DizyFlow versions"><Row label="Engine" value={flow?.engineVersion ?? "Unavailable"} /><Row label="Schema" value={flow?.schemaVersion ?? "Unavailable"} /><Row label="Config" value={flow?.configVersion ?? "Unavailable"} /></Disclosure></>;
}

export function DizyBrainWorkspace() {
  const { preferences, data, open, close, update } = useDizyBrainWorkspace();
  const panelRef = useRef<HTMLElement>(null);
  const dragging = useRef(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("brain");
    const requestedModule = DIZYBRAIN_MODULES.find(item => item.id === query)?.id;
    if (requestedModule) open(requestedModule);
  }, [open]);
  useEffect(() => {
    if (!preferences.open) return;
    const narrow = matchMedia("(max-width: 900px)").matches;
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
  }, [preferences.open, close]);
  if (!preferences.open) return null;
  const resize = (width: number, persist = true) => update({ width: clampDizyBrainWidth(width) }, persist);
  const onPointerDown = (event: React.PointerEvent) => {
    dragging.current = true; document.body.classList.add("brain-resizing"); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => { if (dragging.current) resize(window.innerWidth - event.clientX, false); };
  const onPointerUp = (event: React.PointerEvent) => { if (!dragging.current) return; dragging.current = false; document.body.classList.remove("brain-resizing"); event.currentTarget.releasePointerCapture(event.pointerId); resize(preferences.width); };
  if (preferences.collapsed) return <aside className="dizybrain-rail" aria-label="DizyBrain Analysis Workspace"><button aria-label="Expand DizyBrain workspace" onClick={() => update({ collapsed: false })}>»</button>{DIZYBRAIN_MODULES.map(item => <button aria-label={item.label} aria-current={preferences.selectedModule === item.id ? "page" : undefined} key={item.id} onClick={() => open(item.id)}>{item.icon}<span>{item.label}</span></button>)}</aside>;
  return <><button className="brain-mobile-backdrop" aria-label="Close DizyBrain workspace" onClick={close} type="button" /><aside id="dizybrain-workspace" ref={panelRef} className="dizybrain-workspace" style={{ "--brain-width": `${preferences.width}px` } as React.CSSProperties} aria-label="DizyBrain Analysis Workspace">
    <div className="brain-resize" role="separator" aria-label="Resize DizyBrain workspace" aria-orientation="vertical" aria-valuemin={DIZYBRAIN_MIN_WIDTH} aria-valuemax={DIZYBRAIN_MAX_WIDTH} aria-valuenow={preferences.width} tabIndex={0} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onDoubleClick={() => resize(DIZYBRAIN_DEFAULT_WIDTH)} onKeyDown={event => { const step = event.shiftKey ? 48 : 16; if (event.key === "ArrowLeft") resize(preferences.width + step); else if (event.key === "ArrowRight") resize(preferences.width - step); else if (event.key === "Home") resize(DIZYBRAIN_MIN_WIDTH); else if (event.key === "End") resize(DIZYBRAIN_MAX_WIDTH); else return; event.preventDefault(); }} />
    <header className="brain-header"><div><strong>DIZY<span>BRAIN</span></strong><small>Analysis Workspace</small></div><div><button className="brain-collapse" aria-label="Collapse DizyBrain workspace" onClick={() => update({ collapsed: true })}>‹</button><button className="brain-close" aria-label="Close DizyBrain workspace" onClick={close}>×</button></div></header>
    <div className="brain-status"><span>{data?.replay ? "Historical" : "Live"}</span><b>{data?.symbol ?? "No market"}</b><span>{data?.feedState ?? "Loading"}</span></div>
    <nav className="brain-nav" aria-label="DizyBrain modules">{DIZYBRAIN_MODULES.map(item => <button aria-current={preferences.selectedModule === item.id ? "page" : undefined} key={item.id} onClick={() => update({ selectedModule: item.id })}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</nav>
    <section className="brain-module" aria-labelledby="brain-module-title"><h2 id="brain-module-title">{DIZYBRAIN_MODULES.find(item => item.id === preferences.selectedModule)?.label}</h2><ModuleBody data={data} module={preferences.selectedModule} /></section>
  </aside></>;
}
