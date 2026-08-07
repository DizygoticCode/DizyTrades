import {
  bookViewFromDepthSnapshot,
  depthBookCoversDizyQuantCampaignBand,
} from "./campaign-depth-runtime.ts";
import type { DepthCollector } from "../order-flow/depth-collector.ts";

export const DIZYQUANT_CAMPAIGN_SEED_WAIT_MS = 100 as const;
export const DIZYQUANT_CAMPAIGN_SEED_WAIT_ATTEMPTS = 25 as const;

export type DizyQuantCampaignCollectorReadiness = Readonly<{
  sourceMode: ReturnType<DepthCollector["diagnostic"]>["sourceMode"];
  authoritativeSnapshotSeeded: boolean;
  sequenceContinuous: boolean | null;
  snapshotComplete: boolean;
  coverageComplete: boolean | null;
  snapshotAgeMs: number | null;
  bids: number;
  asks: number;
  versionGaps: number;
  restRecoveries: number;
  websocketAgeMs: number | null;
  lastError: string | null;
}>;

const sleep = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export function readDizyQuantCampaignCollectorReadiness(
  collector: DepthCollector,
): DizyQuantCampaignCollectorReadiness {
  const diagnostic = collector.diagnostic();
  const latest = collector.getLatest();
  const snapshotComplete = latest?.diagnostic.snapshotComplete === true;
  let coverageComplete: boolean | null = null;
  if (snapshotComplete && latest?.snapshot.bids.length && latest.snapshot.asks.length) {
    coverageComplete = depthBookCoversDizyQuantCampaignBand(
      bookViewFromDepthSnapshot(latest.snapshot),
    );
  }
  return Object.freeze({
    sourceMode: diagnostic.sourceMode,
    authoritativeSnapshotSeeded: diagnostic.authoritativeSnapshotSeeded,
    sequenceContinuous: latest?.diagnostic.sequenceContinuous ?? null,
    snapshotComplete,
    coverageComplete,
    snapshotAgeMs: diagnostic.snapshotAgeMs,
    bids: diagnostic.bids,
    asks: diagnostic.asks,
    versionGaps: diagnostic.versionGaps,
    restRecoveries: diagnostic.restRecoveries,
    websocketAgeMs: diagnostic.websocketAgeMs,
    lastError: diagnostic.lastError,
  });
}

export function dizyQuantCampaignCollectorPublicationReady(
  readiness: DizyQuantCampaignCollectorReadiness,
) {
  return (
    readiness.authoritativeSnapshotSeeded &&
    readiness.sourceMode === "FULL DEPTH WS" &&
    readiness.sequenceContinuous === true &&
    readiness.snapshotComplete &&
    readiness.coverageComplete === true
  );
}

export async function ensureDizyQuantCampaignCollectorSeed(
  collector: DepthCollector,
  wait: (delayMs: number) => Promise<void> = sleep,
) {
  for (let attempt = 0; attempt < DIZYQUANT_CAMPAIGN_SEED_WAIT_ATTEMPTS; attempt += 1) {
    const before = readDizyQuantCampaignCollectorReadiness(collector);
    if (before.authoritativeSnapshotSeeded) return true;

    const polled = await collector.poll(false, true);
    if (!polled) {
      await wait(DIZYQUANT_CAMPAIGN_SEED_WAIT_MS);
      continue;
    }

    return readDizyQuantCampaignCollectorReadiness(collector).authoritativeSnapshotSeeded;
  }
  return false;
}
