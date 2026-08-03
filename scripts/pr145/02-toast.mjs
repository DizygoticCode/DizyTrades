import {writeFile} from "node:fs/promises";
await writeFile("app/dizyflow-toast-rail.tsx",`"use client";

import { useEffect, useState } from "react";

import type { OrderFlowSettings } from "./lib/order-flow/settings";
import type { FlowAlert } from "./lib/order-flow/types";
import styles from "./dizyflow-toast-rail.module.css";

export function DizyFlowToastRail({
  alerts,
  settings,
  onHistory,
}: {
  alerts: FlowAlert[];
  settings: OrderFlowSettings;
  onHistory: () => void;
}) {
  const [dismissed, setDismissed] = useState(new Set<string>());
  const [paused, setPaused] = useState(false);
  const visible = alerts.filter((alert) => !dismissed.has(alert.id)).slice(0, 1);

  useEffect(() => {
    if (paused || !visible.length) return;
    const id = visible[0].id;
    const timer = setTimeout(
      () => setDismissed((current) => new Set([...current, id])),
      settings.alerts.durationMs,
    );
    return () => clearTimeout(timer);
  }, [paused, settings.alerts.durationMs, visible]);

  if (
    !settings.enabled ||
    !settings.alertsVisible ||
    !settings.alerts.toasts ||
    !visible.length
  )
    return null;

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={\`flow-toast-rail \${settings.alerts.placement} \${styles.rail}\`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {visible.map((alert) => {
        const buy = alert.type.includes("Buy") || alert.type.includes("Bid");
        return (
          <article className={styles.card} key={alert.id} role="status">
            <i className={buy ? "buy" : "sell"} />
            <span className={styles.message}>
              <small className={styles.eyebrow}>DizyFlow activity</small>
              <b className={styles.title} title={alert.type}>
                {alert.type}
              </b>
              <small className={styles.detail}>
                {alert.price.toLocaleString()} · $
                {alert.notional.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </small>
            </span>
            <span className={styles.actions}>
              <button
                aria-label="Open DizyFlow alert history"
                className={styles.history}
                onClick={onHistory}
                type="button"
              >
                History
              </button>
              <button
                aria-label={\`Dismiss \${alert.type}\`}
                className={styles.dismiss}
                onClick={() =>
                  setDismissed((current) => new Set([...current, alert.id]))
                }
                type="button"
              >
                ×
              </button>
            </span>
          </article>
        );
      })}
    </div>
  );
}

export function DizyFlowAlertHistory({
  alerts,
  open,
  onClose,
  onClear,
}: {
  alerts: FlowAlert[];
  open: boolean;
  onClose: () => void;
  onClear: () => void;
}) {
  if (!open) return null;
  return (
    <aside className="flow-history">
      <header>
        <b>Large-activity history</b>
        <button onClick={onClear}>Clear</button>
        <button onClick={onClose}>×</button>
      </header>
      <small>Large public market activity; trader identity is unknown.</small>
      {alerts.map((alert) => (
        <p key={alert.id}>
          <b>{alert.type}</b>
          <span>
            {new Date(alert.timeMs).toLocaleTimeString()} ·{" "}
            {alert.price.toLocaleString()} · $
            {alert.notional.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
          </span>
        </p>
      ))}
    </aside>
  );
}
`);
await writeFile("app/dizyflow-toast-rail.module.css",`.rail {
  position: fixed !important;
  z-index: 59;
  top: 74px;
  right: 18px;
  left: auto;
  display: block !important;
  inline-size: min(320px, calc(100vw - 24px));
  max-inline-size: 320px;
  block-size: auto;
  min-block-size: 0;
  padding: 0;
  overflow: visible;
  pointer-events: none;
  transform: none;
}

.rail .card {
  display: grid;
  grid-template-columns: 4px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: 68px;
  padding: 10px 10px 10px 9px;
  overflow: hidden;
  border: 1px solid rgba(133, 151, 184, 0.34);
  border-radius: 12px;
  background: rgba(11, 15, 25, 0.96);
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.52);
  pointer-events: auto;
  animation: toast-in 160ms ease-out;
}

.rail .card > i {
  inline-size: 4px;
  block-size: 100%;
  min-block-size: 46px;
  border-radius: 999px;
}

.message {
  display: flex !important;
  min-inline-size: 0;
  flex-direction: column !important;
  align-items: flex-start !important;
  gap: 2px !important;
}

.eyebrow {
  color: #8995aa;
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.title,
.detail {
  max-inline-size: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.title {
  color: #edf1fa;
  font-size: 12px;
}

.detail {
  color: #9da8bb !important;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.actions {
  display: flex;
  align-items: center;
  gap: 3px;
}

.history,
.dismiss {
  min-inline-size: 30px;
  min-block-size: 30px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #9ba6b9;
  cursor: pointer;
}

.history {
  font-size: 9px;
}

.dismiss {
  padding: 0;
  font-size: 18px;
}

.history:hover,
.history:focus-visible,
.dismiss:hover,
.dismiss:focus-visible {
  background: rgba(122, 100, 217, 0.16);
  color: #eee8ff;
  outline: 1px solid rgba(160, 137, 255, 0.55);
}

@keyframes toast-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 700px) {
  .rail {
    top: 68px;
    right: 8px;
    inline-size: min(310px, calc(100vw - 16px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .rail .card { animation: none; }
}
`);
