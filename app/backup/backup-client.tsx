"use client";

import { useState } from "react";
import type { DizyTradesBackup } from "../lib/user-backup-model";
import type {
  BackupRestorePlan,
  BackupRestoreResult,
} from "../lib/user-backup-store";
import styles from "./backup.module.css";

type BackupUpload=Omit<DizyTradesBackup,"version"|"migration">&Readonly<{version:1|2;migration?:DizyTradesBackup["migration"]}>;
type LoadedBackup = Readonly<{
  name: string;
  bytes: number;
  backup: BackupUpload;
}>;

const count = (value: number) => value.toLocaleString();
const size = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

export default function BackupClient({ userName }: { userName: string }) {
  const [loaded, setLoaded] = useState<LoadedBackup | null>(null);
  const [plan, setPlan] = useState<BackupRestorePlan | null>(null);
  const [result, setResult] = useState<BackupRestoreResult | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Choose a DizyTrades JSON backup to begin a dry-run.");
  const [error, setError] = useState("");

  async function selectFile(file: File | null) {
    setLoaded(null);
    setPlan(null);
    setResult(null);
    setConfirmation("");
    setError("");
    if (!file) {
      setStatus("Choose a DizyTrades JSON backup to begin a dry-run.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("Backup exceeds the 100 MB recovery limit.");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as BackupUpload;
      if (!parsed || (parsed.version !== 1 && parsed.version !== 2) || parsed.application?.name !== "DizyTrades") {
        throw new Error("This is not a supported DizyTrades backup.");
      }
      setLoaded({ name: file.name, bytes: file.size, backup: parsed });
      setStatus("Backup loaded locally. Run the server validation dry-run next.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Backup could not be read.");
    }
  }

  async function dryRun() {
    if (!loaded) return;
    setBusy(true);
    setError("");
    setResult(null);
    setConfirmation("");
    try {
      const response = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun: true, backup: loaded.backup }),
      });
      const body = (await response.json()) as { plan?: BackupRestorePlan; error?: string };
      if (!response.ok || !body.plan) throw new Error(body.error ?? "Dry-run failed.");
      setPlan(body.plan);
      setStatus(
        body.plan.safeToApply
          ? "Dry-run passed. Review every change and warning before applying."
          : "Dry-run found conflicts. Nothing was changed.",
      );
    } catch (reason) {
      setPlan(null);
      setError(reason instanceof Error ? reason.message : "Dry-run failed.");
    } finally {
      setBusy(false);
    }
  }

  async function applyRestore() {
    if (!loaded || !plan || !plan.safeToApply || confirmation !== "RESTORE") return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dryRun: false,
          backup: loaded.backup,
          expectedBackupHash: plan.backupHash,
          confirmation,
        }),
      });
      const body = (await response.json()) as BackupRestoreResult & { error?: string };
      if (!response.ok || body.applied !== true) {
        throw new Error(body.error ?? "Restore failed.");
      }
      setResult(body);
      setStatus("Restore completed. Existing records were preserved and new data was added.");
      setConfirmation("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div><b>DizyTrades</b><span>DizyBackup</span></div>
        <nav>
          <a href="/terminal">DizyCharts</a>
          <a href="/journal">DizyJournal</a>
          <a href="/performance">DizyPerformance</a>
          <a href="/diagnostics">DizyOps</a>
          <strong>{userName}</strong>
        </nav>
      </header>

      <section className={styles.hero}>
        <div>
          <span>ACCOUNT EXPORT AND ADDITIVE RECOVERY</span>
          <h1>Back up the evidence chain, not merely the notes.</h1>
          <p>
            JSON export includes profile, simulator history, Manual Paper, Journal,
            Replay memories, Historical DizyFlow and DizyBrain reviews. Authentication
            records and credentials are never included.
          </p>
        </div>
        <div className={styles.downloads}>
          <a href="/api/backup/export">Download full JSON backup</a>
          <a href="/api/backup/journal.csv">Download Journal CSV</a>
        </div>
      </section>

      <section className={styles.rules}>
        <article><b>Same account only</b><span>Owner identity must match the signed-in user.</span></article>
        <article><b>Dry-run first</b><span>No restore can run without a fresh validated plan.</span></article>
        <article><b>Additive recovery</b><span>Existing Journal and evidence are never silently deleted.</span></article>
        <article><b>Paper safety</b><span>Open or existing Manual Paper state is never overwritten.</span></article>
        <article><b>Versioned migration</b><span>Older valid backups are hash-checked before recorded trade values are preserved into the current schema.</span></article>
      </section>

      <section className={styles.workspace}>
        <article className={styles.panel}>
          <header><h2>1. Load backup</h2><p>Parsing occurs locally before server validation.</p></header>
          <label className={styles.filePicker}>
            <span>Choose DizyTrades JSON</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => void selectFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {loaded ? (
            <div className={styles.loaded}>
              <b>{loaded.name}</b>
              <span>{size(loaded.bytes)}</span>
              <span>Backup schema v{loaded.backup.version} · Created {new Date(loaded.backup.generatedAt).toLocaleString()}</span>
              <span>Hash {loaded.backup.integrity?.contentHash?.slice(0, 14) ?? "Unavailable"}…</span>
              <dl>
                <div><dt>Journal</dt><dd>{count(loaded.backup.data?.journal?.length ?? 0)}</dd></div>
                <div><dt>Replay memories</dt><dd>{count(loaded.backup.data?.replayMemories?.length ?? 0)}</dd></div>
                <div><dt>Historical DizyFlow</dt><dd>{count(loaded.backup.data?.historicalDizyFlow?.length ?? 0)}</dd></div>
                <div><dt>DizyBrain reviews</dt><dd>{count(loaded.backup.data?.dizyBrainReviews?.length ?? 0)}</dd></div>
              </dl>
            </div>
          ) : null}
          <button disabled={!loaded || busy} onClick={() => void dryRun()}>
            {busy ? "Validating…" : "Run recovery dry-run"}
          </button>
        </article>

        <article className={styles.panel}>
          <header><h2>2. Review plan</h2><p>Nothing changes during this stage.</p></header>
          {!plan ? <p className={styles.empty}>A validated recovery plan will appear here.</p> : (
            <>
              <div className={styles.verdict} data-safe={plan.safeToApply}>
                <strong>{plan.safeToApply ? "SAFE TO APPLY" : "CONFLICTS FOUND"}</strong>
                <span>Backup hash {plan.backupHash.slice(0, 14)}…</span>
              </div>
              <dl className={styles.plan}>
                <div><dt>Journal entries to add</dt><dd>{count(plan.journal.entriesToAdd)}</dd></div>
                <div><dt>Replay memories to create</dt><dd>{count(plan.evidence.replayToCreate)}</dd></div>
                <div><dt>DizyFlow memories to create</dt><dd>{count(plan.evidence.flowToCreate)}</dd></div>
                <div><dt>DizyBrain reviews to create</dt><dd>{count(plan.evidence.reviewsToCreate)}</dd></div>
                <div><dt>Profile settings replace</dt><dd>{plan.profile.settingsWillReplace ? "Yes" : "No"}</dd></div>
                <div><dt>Saved simulator runs to add</dt><dd>{count(plan.profile.paperRunsToAdd)}</dd></div>
                <div><dt>Manual Paper</dt><dd>{plan.manualPaper.replaceAll("-", " ")}</dd></div>
                <div><dt>Backup schema</dt><dd>v{plan.migration.sourceBackupVersion} → v{plan.migration.targetBackupVersion}</dd></div>
                <div><dt>Paper history</dt><dd>{plan.migration.manualPaper.migrated ? "migrated from v"+plan.migration.manualPaper.sourceAccountVersion : "native v"+plan.migration.manualPaper.targetAccountVersion}</dd></div>
                <div><dt>Preserved Paper fills</dt><dd>{count(plan.migration.manualPaper.fillCount)}</dd></div>
              </dl>
              {plan.conflicts.length ? <div className={styles.conflicts}><b>Conflicts</b>{plan.conflicts.map((item) => <p key={item}>{item}</p>)}</div> : null}
              {plan.warnings.length ? <div className={styles.warnings}><b>Warnings</b>{plan.warnings.map((item) => <p key={item}>{item}</p>)}</div> : null}
            </>
          )}
        </article>
      </section>

      <section className={styles.apply}>
        <div>
          <h2>3. Apply validated recovery</h2>
          <p>Type <b>RESTORE</b>. The backup hash must still match the dry-run.</p>
        </div>
        <input
          aria-label="Restore confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="RESTORE"
          autoComplete="off"
        />
        <button
          disabled={
            busy ||
            !plan?.safeToApply ||
            confirmation !== "RESTORE" ||
            Boolean(result)
          }
          onClick={() => void applyRestore()}
        >
          {busy ? "Applying…" : "Apply additive restore"}
        </button>
      </section>

      <div className={styles.status} role="status">{status}</div>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {result ? (
        <section className={styles.success}>
          <h2>Recovery complete</h2>
          <p>
            Added {result.created.journalEntries} Journal entries, {result.created.replayMemories} Replay memories,
            {" "}{result.created.historicalDizyFlow} Historical DizyFlow memories and {result.created.dizyBrainReviews} DizyBrain reviews.
          </p>
          <p>Profile updated: {result.profileUpdated ? "yes" : "no"} · Manual Paper restored: {result.manualPaperRestored ? "yes" : "no"}</p>
        </section>
      ) : null}
    </main>
  );
}
