"use client";

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
  const activeAlert = alerts.find((alert) => !dismissed.has(alert.id));
  const activeAlertId = activeAlert?.id ?? null;

  useEffect(() => {
    if (paused || !activeAlertId) return;
    const timer = setTimeout(
      () => setDismissed((current) => new Set([...current, activeAlertId])),
      settings.alerts.durationMs,
    );
    return () => clearTimeout(timer);
  }, [activeAlertId, paused, settings.alerts.durationMs]);

  if (
    !settings.enabled ||
    !settings.alertsVisible ||
    !settings.alerts.toasts ||
    !activeAlert
  )
    return null;

  const buy = activeAlert.type.includes("Buy") || activeAlert.type.includes("Bid");
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={`flow-toast-rail ${settings.alerts.placement} ${styles.rail}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <article className={styles.card} key={activeAlert.id} role="status">
        <i className={buy ? "buy" : "sell"} />
        <span className={styles.message}>
          <small className={styles.eyebrow}>DizyFlow activity</small>
          <b className={styles.title} title={activeAlert.type}>
            {activeAlert.type}
          </b>
          <small className={styles.detail}>
            {activeAlert.price.toLocaleString()} · $
            {activeAlert.notional.toLocaleString(undefined, {
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
            aria-label={`Dismiss ${activeAlert.type}`}
            className={styles.dismiss}
            onClick={() =>
              setDismissed((current) => new Set([...current, activeAlert.id]))
            }
            type="button"
          >
            ×
          </button>
        </span>
      </article>
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
