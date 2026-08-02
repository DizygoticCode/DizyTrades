"use client";

import { useCallback, useEffect, useState } from "react";
import type { OperationalDiagnostics } from "../lib/operational-diagnostics";
import styles from "./diagnostics.module.css";

const bytes = (value: number | null) => {
  if (value === null) return "Unavailable";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let next = value;
  let unit = -1;
  do {
    next /= 1024;
    unit += 1;
  } while (next >= 1024 && unit < units.length - 1);
  return `${next.toFixed(next >= 100 ? 0 : next >= 10 ? 1 : 2)} ${units[unit]}`;
};

const duration = (seconds: number) => {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", `${minutes}m`]
    .filter(Boolean)
    .join(" ");
};

export default function DiagnosticsClient({ userName }: { userName: string }) {
  const [report, setReport] = useState<OperationalDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/diagnostics", {
        cache: "no-store",
        signal,
      });
      const body = (await response.json()) as OperationalDiagnostics & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Diagnostics unavailable.");
      setReport(body);
    } catch (reason) {
      if ((reason as Error).name !== "AbortError") {
        setError(reason instanceof Error ? reason.message : "Diagnostics unavailable.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialTimer = window.setTimeout(
      () => void refresh(controller.signal),
      0,
    );
    const intervalTimer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      controller.abort();
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);
    };
  }, [refresh]);

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div><b>DizyTrades</b><span>DizyOps</span></div>
        <nav>
          <a href="/terminal">DizyCharts</a>
          <a href="/scanner">DizyScanner</a>
          <a href="/structure">DizyStructure</a>
          <a href="/performance">DizyPerformance</a>
          <a href="/journal">DizyJournal</a>
          <strong>{userName}</strong>
        </nav>
      </header>

      <section className={styles.hero}>
        <div>
          <span>OWNER-ONLY OPERATIONS WORKSPACE</span>
          <h1>Know what is deployed, retained and degraded.</h1>
          <p>
            Runtime and persistent-storage diagnostics only. Secrets, raw user data,
            credentials and filesystem paths are never returned.
          </p>
        </div>
        <button disabled={loading} onClick={() => void refresh()}>
          {loading ? "Checking…" : "Refresh diagnostics"}
        </button>
      </section>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {!report ? (
        <section className={styles.loading} aria-busy="true">
          {loading ? "Collecting production diagnostics…" : "No report available."}
        </section>
      ) : (
        <>
          <section className={styles.overview}>
            <article data-state={report.overall}>
              <span>OVERALL</span>
              <strong>{report.overall}</strong>
              <small>Generated {new Date(report.generatedAt).toLocaleString()}</small>
            </article>
            <article data-state={report.storage.state}>
              <span>STORAGE</span>
              <strong>{report.storage.state}</strong>
              <small>{report.storage.readable ? "Readable" : "Not readable"} · {report.storage.writable ? "Writable" : "Not writable"}</small>
            </article>
            <article>
              <span>DEPLOYED COMMIT</span>
              <strong>{report.deployment.commit?.slice(0, 10) ?? "Unavailable"}</strong>
              <small>{report.deployment.service ?? "Service name unavailable"}</small>
            </article>
            <article>
              <span>RUNTIME UPTIME</span>
              <strong>{duration(report.runtime.uptimeSeconds)}</strong>
              <small>{report.runtime.node} · {report.runtime.platform}</small>
            </article>
          </section>

          <section className={styles.grid}>
            <article className={styles.panel}>
              <header><h2>Runtime</h2><p>Current process only.</p></header>
              <dl>
                <div><dt>Resident memory</dt><dd>{bytes(report.runtime.residentMemoryBytes)}</dd></div>
                <div><dt>Heap used</dt><dd>{bytes(report.runtime.heapUsedBytes)}</dd></div>
                <div><dt>Instance</dt><dd>{report.deployment.instance ?? "Unavailable"}</dd></div>
                <div><dt>Deploy ID</dt><dd>{report.deployment.deployId ?? "Unavailable"}</dd></div>
                <div><dt>Live execution</dt><dd>{report.configuration.liveTradingEnabled ? "Enabled" : "Disabled"}</dd></div>
                <div><dt>Public signup</dt><dd>{report.configuration.publicSignupEnabled ? "Enabled" : "Disabled"}</dd></div>
              </dl>
            </article>

            <article className={styles.panel}>
              <header><h2>Persistent storage</h2><p>Bounded scan of retained files.</p></header>
              <dl>
                <div><dt>Capacity</dt><dd>{bytes(report.storage.totalBytes)}</dd></div>
                <div><dt>Used</dt><dd>{bytes(report.storage.usedBytes)}</dd></div>
                <div><dt>Free</dt><dd>{bytes(report.storage.freeBytes)}</dd></div>
                <div><dt>Scanned files</dt><dd>{report.storage.scannedFiles.toLocaleString()}</dd></div>
                <div><dt>Scanned bytes</dt><dd>{bytes(report.storage.scannedBytes)}</dd></div>
                <div><dt>Scan bounded</dt><dd>{report.storage.scanTruncated ? "Yes — partial totals" : "No"}</dd></div>
              </dl>
            </article>
          </section>

          <section className={styles.panel}>
            <header><h2>Retained data categories</h2><p>Names and aggregate size only.</p></header>
            <div className={styles.categories}>
              {report.storage.categories.length ? report.storage.categories.map((category) => (
                <div key={category.name}>
                  <strong>{category.name}</strong>
                  <span>{category.files.toLocaleString()} files</span>
                  <span>{bytes(category.bytes)}</span>
                  <small>{category.latestModifiedAt ? `Latest ${new Date(category.latestModifiedAt).toLocaleString()}` : "No retained timestamp"}</small>
                </div>
              )) : <p>No retained data files were found.</p>}
            </div>
          </section>

          <section className={styles.grid}>
            <article className={styles.panel}>
              <header><h2>Audit activity</h2><p>Sanitised action names only.</p></header>
              <dl>
                <div><dt>Audit state</dt><dd>{report.activity.state}</dd></div>
                <div><dt>Events in bounded tail</dt><dd>{report.activity.retainedEvents}</dd></div>
                <div><dt>Latest event</dt><dd>{report.activity.latestEventAt ? new Date(report.activity.latestEventAt).toLocaleString() : "Unavailable"}</dd></div>
              </dl>
              <div className={styles.failures}>
                {report.activity.recentFailures.length ? report.activity.recentFailures.map((event, index) => (
                  <div key={`${event.at}:${event.action}:${index}`}>
                    <b>{event.action}</b><span>{event.at === "unknown" ? "Unknown time" : new Date(event.at).toLocaleString()}</span>
                  </div>
                )) : <p>No failure-like actions appear in the retained audit tail.</p>}
              </div>
            </article>

            <article className={styles.panel}>
              <header><h2>Known limits</h2><p>What this page deliberately does not claim.</p></header>
              <ul>{report.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
