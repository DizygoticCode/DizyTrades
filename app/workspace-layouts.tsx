"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { UserTerminalSettings } from "./lib/config";
import {
  BUILT_IN_WORKSPACE_PRESETS,
  applyBuiltInWorkspacePreset,
  type BuiltInWorkspacePresetId,
  type WorkspaceLayoutSummary,
} from "./lib/workspace-layout";

const selector = ".topbar .system-strip";

function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function snapshot() {
  return document.querySelector<HTMLElement>(selector);
}

function serverSnapshot() {
  return null;
}

const time = (value: string) => new Date(value).toLocaleString();

export function WorkspaceLayouts({ readOnly }: { readOnly: boolean }) {
  const target = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [open, setOpen] = useState(false);
  const [layouts, setLayouts] = useState<WorkspaceLayoutSummary[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Loading saved workspaces…");
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (readOnly) return;
    try {
      const response = await fetch("/api/workspaces", { cache: "no-store" });
      const body = (await response.json()) as {
        layouts?: WorkspaceLayoutSummary[];
        error?: string;
      };
      if (!response.ok || !body.layouts) throw new Error(body.error ?? "Saved workspaces could not be loaded.");
      setLayouts(body.layouts);
      setStatus(
        body.layouts.length
          ? `${body.layouts.length} saved workspace${body.layouts.length === 1 ? "" : "s"}.`
          : "No named workspaces saved yet.",
      );
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Saved workspaces could not be loaded.");
    }
  }, [readOnly]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setStatus("Saving the current terminal profile…");
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await response.json()) as {
        layout?: WorkspaceLayoutSummary;
        created?: boolean;
        error?: string;
      };
      if (!response.ok || !body.layout) throw new Error(body.error ?? "Workspace could not be saved.");
      setName("");
      await load();
      setStatus(body.created ? `Saved ${body.layout.name}.` : `Updated ${body.layout.name}.`);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Workspace could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const applySaved = async (layout: WorkspaceLayoutSummary) => {
    setBusy(true);
    setStatus(`Applying ${layout.name}…`);
    try {
      const response = await fetch("/api/workspaces", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: layout.id }),
      });
      const body = (await response.json()) as { applied?: boolean; error?: string };
      if (!response.ok || body.applied !== true) throw new Error(body.error ?? "Workspace could not be applied.");
      window.location.reload();
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Workspace could not be applied.");
      setBusy(false);
    }
  };

  const remove = async (layout: WorkspaceLayoutSummary) => {
    setBusy(true);
    setStatus(`Deleting ${layout.name}…`);
    try {
      const response = await fetch("/api/workspaces", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: layout.id }),
      });
      const body = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || body.deleted !== true) throw new Error(body.error ?? "Workspace could not be deleted.");
      await load();
      setStatus(`Deleted ${layout.name}.`);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Workspace could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = async (preset: BuiltInWorkspacePresetId) => {
    setBusy(true);
    const definition = BUILT_IN_WORKSPACE_PRESETS.find((item) => item.id === preset)!;
    setStatus(`Applying ${definition.name}…`);
    try {
      const profileResponse = await fetch("/api/profile", { cache: "no-store" });
      const profile = (await profileResponse.json()) as {
        settings?: UserTerminalSettings;
        error?: string;
      };
      if (!profileResponse.ok || !profile.settings) throw new Error(profile.error ?? "Current profile could not be loaded.");
      const next = applyBuiltInWorkspacePreset(profile.settings, preset);
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || body.ok !== true) throw new Error(body.error ?? "Preset could not be applied.");
      window.location.reload();
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Preset could not be applied.");
      setBusy(false);
    }
  };

  if (readOnly) return null;

  const trigger = target
    ? createPortal(
        <button
          className="nav-tab workspace-layout-trigger"
          onClick={() => setOpen(true)}
          ref={triggerRef}
          title="Save or restore a terminal workspace"
          type="button"
        >
          <span aria-hidden="true">▦</span> Layouts
        </button>,
        target,
      )
    : null;

  const modal = open
    ? createPortal(
        <div className="workspace-layout-backdrop">
          <div
            aria-labelledby="workspace-layout-title"
            aria-modal="true"
            className="workspace-layout-dialog"
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <header>
              <div>
                <span>NAMED TERMINAL WORKSPACES</span>
                <h1 id="workspace-layout-title">Save the whole setup, not just the symbol.</h1>
                <p>
                  Each workspace snapshots the sanitised market, timeframe, chart view,
                  strategy, risk and DizyFlow settings currently stored in your account.
                </p>
              </div>
              <button aria-label="Close workspace layouts" onClick={() => setOpen(false)} type="button">×</button>
            </header>

            <section className="workspace-layout-save">
              <div>
                <h2>Save current workspace</h2>
                <p>Using an existing name updates that snapshot instead of creating a duplicate.</p>
              </div>
              <label>
                Workspace name
                <input
                  maxLength={40}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="BTC 15m research"
                  value={name}
                />
              </label>
              <button disabled={busy || !name.trim()} onClick={() => void save()} type="button">
                Save current
              </button>
            </section>

            <section className="workspace-layout-section">
              <header><h2>Built-in presets</h2><p>Deterministic starting views; current market and favourites are preserved.</p></header>
              <div className="workspace-layout-grid">
                {BUILT_IN_WORKSPACE_PRESETS.map((preset) => (
                  <article key={preset.id}>
                    <b>{preset.name}</b>
                    <p>{preset.description}</p>
                    <button disabled={busy} onClick={() => void applyPreset(preset.id)} type="button">Apply preset</button>
                  </article>
                ))}
              </div>
            </section>

            <section className="workspace-layout-section">
              <header><h2>Saved workspaces</h2><p>Account-scoped snapshots stored on the DizyTrades server.</p></header>
              {layouts.length ? (
                <div className="workspace-layout-list">
                  {layouts.map((layout) => (
                    <article key={layout.id}>
                      <div>
                        <b>{layout.name}</b>
                        <span>{layout.market} · {layout.timeframe} · DizyFlow {layout.orderFlowEnabled ? "on" : "off"}</span>
                        <small>Updated {time(layout.updatedAt)}</small>
                      </div>
                      <button disabled={busy} onClick={() => void applySaved(layout)} type="button">Apply</button>
                      <button disabled={busy} onClick={() => void remove(layout)} type="button">Delete</button>
                    </article>
                  ))}
                </div>
              ) : <p className="workspace-layout-empty">No named workspaces saved yet.</p>}
            </section>

            <footer role="status" aria-live="polite">{status}</footer>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {trigger}
      {modal}
      <style jsx global>{`
        .workspace-layout-trigger { color:#c8dcff; border-color:#3e608a; background:linear-gradient(180deg,#12243a,#0b1420); }
        .workspace-layout-trigger:hover,.workspace-layout-trigger:focus-visible { color:#fff; border-color:#70a8ea; box-shadow:0 0 14px #5c9fe72d; }
        .workspace-layout-backdrop { position:fixed; z-index:11000; inset:0; display:grid; place-items:center; padding:24px; overflow:auto; background:#03060dcc; backdrop-filter:blur(8px); }
        .workspace-layout-dialog { width:min(940px,100%); max-height:calc(100vh - 48px); overflow:auto; color:#eef3fb; border:1px solid #34445c; border-radius:15px; outline:none; background:linear-gradient(180deg,#101827,#090d14); box-shadow:0 36px 110px #000c; }
        .workspace-layout-dialog > header { display:flex; justify-content:space-between; gap:24px; padding:28px 30px 22px; border-bottom:1px solid #212d40; }
        .workspace-layout-dialog > header span { color:#72aaf1; font-size:9px; font-weight:850; letter-spacing:.16em; }
        .workspace-layout-dialog h1 { margin:8px 0; font-size:clamp(25px,4vw,38px); letter-spacing:-.035em; }
        .workspace-layout-dialog h2 { margin:0 0 5px; font-size:14px; }
        .workspace-layout-dialog p { margin:0; color:#919db2; font-size:11px; line-height:1.55; }
        .workspace-layout-dialog > header > button { width:36px; height:36px; flex:0 0 auto; color:#b5c0d2; border:1px solid #344158; border-radius:7px; background:#111827; font-size:20px; cursor:pointer; }
        .workspace-layout-save { display:grid; grid-template-columns:1fr minmax(190px,280px) auto; align-items:end; gap:16px; padding:20px 30px; border-bottom:1px solid #212d40; }
        .workspace-layout-save label { display:grid; gap:6px; color:#aeb9cb; font-size:10px; }
        .workspace-layout-save input { min-height:40px; padding:0 11px; color:#eef3fb; border:1px solid #35435b; border-radius:7px; background:#0b111c; }
        .workspace-layout-save button,.workspace-layout-section button { min-height:38px; padding:0 12px; color:#eef3fb; border:1px solid #42546f; border-radius:7px; background:#172236; font:inherit; font-size:11px; font-weight:750; cursor:pointer; }
        .workspace-layout-save button:disabled,.workspace-layout-section button:disabled { opacity:.45; cursor:not-allowed; }
        .workspace-layout-section { padding:20px 30px; border-bottom:1px solid #212d40; }
        .workspace-layout-section > header { display:flex; align-items:end; justify-content:space-between; gap:20px; margin-bottom:13px; }
        .workspace-layout-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
        .workspace-layout-grid article { min-height:142px; display:flex; flex-direction:column; padding:15px; border:1px solid #2b3950; border-radius:9px; background:#0d1420; }
        .workspace-layout-grid article b { font-size:13px; }
        .workspace-layout-grid article p { flex:1; margin:7px 0 14px; }
        .workspace-layout-list { display:grid; gap:8px; }
        .workspace-layout-list article { display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:9px; padding:12px; border:1px solid #2a374c; border-radius:8px; background:#0c121d; }
        .workspace-layout-list article div { display:grid; gap:3px; }
        .workspace-layout-list span,.workspace-layout-list small { color:#8997ac; font-size:10px; }
        .workspace-layout-list article button:last-child { color:#ffbdc8; border-color:#67404a; background:#211217; }
        .workspace-layout-empty { padding:18px; border:1px dashed #33425a; border-radius:8px; text-align:center; }
        .workspace-layout-dialog > footer { padding:13px 30px; color:#9eacc0; background:#0b1019; font-size:11px; }
        .workspace-layout-dialog button:hover:not(:disabled),.workspace-layout-dialog button:focus-visible,.workspace-layout-dialog input:focus-visible { border-color:#77aef0; outline:2px solid #6ca9f044; outline-offset:2px; }
        @media(max-width:760px){ .workspace-layout-save{grid-template-columns:1fr}.workspace-layout-grid{grid-template-columns:1fr}.workspace-layout-section>header{align-items:flex-start;flex-direction:column}.workspace-layout-list article{grid-template-columns:1fr 1fr}.workspace-layout-list article div{grid-column:1/-1} }
        @media(prefers-reduced-motion:reduce){.workspace-layout-dialog,.workspace-layout-dialog *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
      `}</style>
    </>
  );
}
