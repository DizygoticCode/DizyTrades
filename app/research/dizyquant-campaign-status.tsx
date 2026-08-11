"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./research.module.css";

type CampaignPhase =
  | "starting"
  | "collecting"
  | "waiting-market-metadata"
  | "waiting-collector-capacity"
  | "waiting-depth-seed"
  | "storage-failed";

type CampaignStatus = Readonly<{
  phase: CampaignPhase;
  activeSymbol: string | null;
  residency: Readonly<{
    fromMs: number;
    predictorBoundaryMs: number;
    toMs: number;
  }> | null;
  stats: Readonly<{
    campaignQualifiedCount: number;
    campaignRejectedCount: number;
    representativeCoverage: boolean;
    cells: readonly Readonly<{ minimumRequired: number }>[];
  }> | null;
}>;

const phaseLabel: Record<CampaignPhase, string> = {
  starting: "Starting campaign recorder",
  collecting: "Collecting live",
  "waiting-market-metadata": "Waiting for market metadata",
  "waiting-collector-capacity": "Waiting for collector capacity",
  "waiting-depth-seed": "Seeding live depth",
  "storage-failed": "Campaign storage unavailable",
};

function isFiniteTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function parseCampaignStatus(value: unknown): CampaignStatus | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const phases: readonly CampaignPhase[] = [
    "starting",
    "collecting",
    "waiting-market-metadata",
    "waiting-collector-capacity",
    "waiting-depth-seed",
    "storage-failed",
  ];
  if (!phases.includes(candidate.phase as CampaignPhase)) return null;

  const residency = candidate.residency;
  let parsedResidency: CampaignStatus["residency"] = null;
  if (residency !== null) {
    if (!residency || typeof residency !== "object") return null;
    const record = residency as Record<string, unknown>;
    if (
      !isFiniteTime(record.fromMs) ||
      !isFiniteTime(record.predictorBoundaryMs) ||
      !isFiniteTime(record.toMs) ||
      record.fromMs >= record.predictorBoundaryMs ||
      record.predictorBoundaryMs >= record.toMs
    ) return null;
    parsedResidency = Object.freeze({
      fromMs: record.fromMs,
      predictorBoundaryMs: record.predictorBoundaryMs,
      toMs: record.toMs,
    });
  }

  const statsValue = candidate.stats;
  let parsedStats: CampaignStatus["stats"] = null;
  if (statsValue !== null) {
    if (!statsValue || typeof statsValue !== "object") return null;
    const record = statsValue as Record<string, unknown>;
    if (
      !Number.isSafeInteger(record.campaignQualifiedCount) ||
      Number(record.campaignQualifiedCount) < 0 ||
      !Number.isSafeInteger(record.campaignRejectedCount) ||
      Number(record.campaignRejectedCount) < 0 ||
      typeof record.representativeCoverage !== "boolean" ||
      !Array.isArray(record.cells)
    ) return null;
    const cells = record.cells.map((cell) => {
      if (!cell || typeof cell !== "object") return null;
      const minimumRequired = (cell as Record<string, unknown>).minimumRequired;
      if (!Number.isSafeInteger(minimumRequired) || Number(minimumRequired) < 1) return null;
      return Object.freeze({ minimumRequired: Number(minimumRequired) });
    });
    if (cells.some((cell) => cell === null)) return null;
    parsedStats = Object.freeze({
      campaignQualifiedCount: Number(record.campaignQualifiedCount),
      campaignRejectedCount: Number(record.campaignRejectedCount),
      representativeCoverage: record.representativeCoverage,
      cells: Object.freeze(cells as Readonly<{ minimumRequired: number }>[]) ,
    });
  }

  const activeSymbol = candidate.activeSymbol;
  if (activeSymbol !== null && typeof activeSymbol !== "string") return null;
  return Object.freeze({
    phase: candidate.phase as CampaignPhase,
    activeSymbol: activeSymbol as string | null,
    residency: parsedResidency,
    stats: parsedStats,
  });
}

function countdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function nextCampaignBoundary(status: CampaignStatus, now: number) {
  if (status.stats?.representativeCoverage || !status.residency) return null;
  const { fromMs, predictorBoundaryMs, toMs } = status.residency;
  if (predictorBoundaryMs > now) return predictorBoundaryMs;
  const predictorOffsetMs = predictorBoundaryMs - fromMs;
  return toMs + predictorOffsetMs;
}

export function DizyQuantCampaignStatus() {
  const [status, setStatus] = useState<CampaignStatus | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/dizyquant/evidence/status", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("Campaign status unavailable");
        const parsed = parseCampaignStatus(await response.json());
        if (!parsed) throw new Error("Campaign status malformed");
        if (!cancelled) {
          setStatus(parsed);
          setState("ready");
        }
      } catch {
        if (!cancelled) setState("unavailable");
      }
    };
    void refresh();
    const poll = window.setInterval(() => void refresh(), 15_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, []);

  const boundary = useMemo(() => status ? nextCampaignBoundary(status, now) : null, [status, now]);
  const target = status?.stats?.cells.reduce((sum, cell) => sum + cell.minimumRequired, 0) ?? null;
  const qualified = status?.stats?.campaignQualifiedCount ?? null;

  if (state === "loading") {
    return <div className={styles.campaignLive} data-phase="starting" role="status">
      <div><small>CAMPAIGN RECORDER</small><strong>Reading live campaign status…</strong></div>
    </div>;
  }

  if (state === "unavailable" || !status) {
    return <div className={styles.campaignLive} data-phase="unavailable" role="status">
      <div><small>CAMPAIGN RECORDER</small><strong>Campaign status unavailable</strong><span>Sign in to inspect the private recorder status.</span></div>
    </div>;
  }

  const coverageReady = status.stats?.representativeCoverage === true;
  return <div className={styles.campaignLive} data-phase={status.phase} role="status" aria-live="polite">
    <div>
      <small>CAMPAIGN RECORDER</small>
      <strong>{coverageReady ? "Representative coverage ready" : phaseLabel[status.phase]}</strong>
      <span>{status.activeSymbol ? `Active symbol ${status.activeSymbol}` : "No active symbol leased"}</span>
    </div>
    <div className={styles.campaignLiveMetrics}>
      <span><b>{qualified ?? "—"}</b>{target === null ? " qualified" : ` / ${target} qualified`}</span>
      <span>{coverageReady
        ? "Ready for offline closure review"
        : boundary === null
          ? "Waiting for the next campaign schedule"
          : `Next sample boundary in ${countdown(boundary - now)}`}</span>
      {status.stats && <span>{status.stats.campaignRejectedCount} rejected by evidence qualification</span>}
    </div>
  </div>;
}
