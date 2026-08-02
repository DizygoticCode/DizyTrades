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
  const visible = alerts.filter((alert) => !dismissed.has(alert.id)).slice(0, 1);

  useEffect(() => {
    if (paused || !visible.length) return;
    const timer = setTimeout(
      () =>
        setDismissed((current) =>
          new Set([...current, visible.at(-1)!.id]),
        ),
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
      aria-live="polite"
      className={`flow-toast-rail ${settings.alerts.placement} ${styles.rail}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {visible.map((alert) => (
        <article className={styles.card} key={alert.id}>
          <i
            className={
              alert.type.includes("Buy") || alert.type.includes("Bid")
                ? "buy"
                : "sell"
            }
          />
          <span className={styles.message}>
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
          <button
            aria-label={`Dismiss ${alert.type}`}
            className={styles.dismiss}
            onClick={() =>
              setDismissed((current) => new Set([...current, alert.id]))
            }
          >
            ×
          </button>
        </article>
      ))}
      <button
        className={`toast-history ${styles.history}`}
        onClick={onHistory}
      >
        History
      </button>
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
