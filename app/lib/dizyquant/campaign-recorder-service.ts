import "server-only";

import { getMexcMarkets } from "../market/mexc.ts";
import {
  acquireDepthCollector,
  releaseDepthCollector,
  type DepthCollector,
} from "../order-flow/depth-collector.ts";
import type { DepthEnvelope } from "../order-flow/types.ts";
import {
  DizyQuantCampaignDepthRuntime,
  inferDizyQuantCampaignPriceStep,
} from "./campaign-depth-runtime.ts";
import {
  DizyQuantCampaignRecorderRunner,
  dizyQuantCampaignResidencyAt,
  type DizyQuantCampaignResidency,
} from "./campaign-recorder-runner.ts";
import {
  readDizyQuantCampaignRecorderState,
  writeDizyQuantCampaignRecorderState,
} from "./campaign-recorder-store.ts";
import { publishDizyQuantCampaignDepthPublication } from "./campaign-runtime-feed.ts";

export const DIZYQUANT_CAMPAIGN_RECORDER_SERVICE_VERSION =
  "dizyquant-campaign-recorder-service/1.0.0" as const;
export const DIZYQUANT_CAMPAIGN_LEASE_PULSE_MS = 5_000 as const;
export const DIZYQUANT_CAMPAIGN_MARKET_RETRY_MS = 15_000 as const;

export type DizyQuantCampaignRecorderServicePhase =
  | "starting"
  | "collecting"
  | "waiting-market-metadata"
  | "waiting-collector-capacity"
  | "storage-failed";

export type DizyQuantCampaignRecorderServiceStatus = Readonly<{
  serviceVersion: typeof DIZYQUANT_CAMPAIGN_RECORDER_SERVICE_VERSION;
  phase: DizyQuantCampaignRecorderServicePhase;
  activeSymbol: string | null;
  residency: DizyQuantCampaignResidency | null;
  lastError: string | null;
  startedAtMs: number;
  stats: ReturnType<DizyQuantCampaignRecorderRunner["stats"]> | null;
  researchOnly: true;
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
}>;

type CampaignMarket = Readonly<{
  symbol: string;
  contractSize: number;
  priceUnit: string | undefined;
}>;

type GlobalCampaignService = typeof globalThis & {
  __dizyQuantCampaignRecorderService?: DizyQuantCampaignRecorderService;
};

const safeError = (reason: unknown) =>
  reason instanceof Error ? reason.message.slice(0, 240) : "DizyQuant campaign service failure";

function validOutcomeEnvelope(envelope: DepthEnvelope) {
  const diagnostic = envelope.diagnostic;
  if (
    diagnostic.sourceTimestampKnown !== true ||
    diagnostic.snapshotComplete !== true ||
    diagnostic.recovering === true ||
    diagnostic.sourceMode === "RECONNECTING — LAST BOOK RETAINED" ||
    !Number.isSafeInteger(envelope.snapshot.engineTimeMs) ||
    envelope.snapshot.engineTimeMs <= 0 ||
    !envelope.snapshot.bids.length ||
    !envelope.snapshot.asks.length
  ) {
    return null;
  }
  const bestBid = envelope.snapshot.bids[0].price;
  const bestAsk = envelope.snapshot.asks[0].price;
  if (
    !Number.isFinite(bestBid) ||
    !Number.isFinite(bestAsk) ||
    bestBid <= 0 ||
    bestAsk <= 0 ||
    bestBid >= bestAsk
  ) {
    return null;
  }
  const midpoint = bestBid + (bestAsk - bestBid) / 2;
  if (!Number.isFinite(midpoint) || midpoint <= 0) return null;
  return Object.freeze({
    symbol: envelope.snapshot.symbol,
    timestampMs: envelope.snapshot.engineTimeMs,
    midpoint,
  });
}

export class DizyQuantCampaignRecorderService {
  private runner: DizyQuantCampaignRecorderRunner | null = null;
  private phase: DizyQuantCampaignRecorderServicePhase = "starting";
  private activeSymbol: string | null = null;
  private residency: DizyQuantCampaignResidency | null = null;
  private market: CampaignMarket | null = null;
  private collector: DepthCollector | null = null;
  private runtime: DizyQuantCampaignDepthRuntime | null = null;
  private unsubscribe: (() => void) | null = null;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private persistence: Promise<unknown> = Promise.resolve();
  private storageFailed = false;
  private lastError: string | null = null;
  private readonly startedAtMs = Date.now();
  private starting = false;

  start() {
    if (this.starting || this.runner || this.storageFailed) return;
    this.starting = true;
    void this.initialise();
  }

  private async initialise() {
    try {
      const state = await readDizyQuantCampaignRecorderState();
      this.runner = new DizyQuantCampaignRecorderRunner(state);
      this.starting = false;
      await this.pulseLease();
    } catch (reason) {
      this.starting = false;
      this.failStorage(reason);
    }
  }

  private scheduleWake(delayMs: number) {
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    const delay = Math.max(250, Math.min(delayMs, 2_147_000_000));
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      void this.pulseLease();
    }, delay);
  }

  private detachCollector() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.runtime?.clear();
    this.runtime = null;
    this.collector = null;
    this.activeSymbol = null;
  }

  private resetResidencyCollector() {
    this.detachCollector();
    this.market = null;
  }

  private failStorage(reason: unknown) {
    this.storageFailed = true;
    this.phase = "storage-failed";
    this.lastError = safeError(reason);
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = null;
    this.resetResidencyCollector();
    console.error("DizyQuant campaign collection stopped after storage failure", {
      error: this.lastError,
    });
  }

  private persistIfChanged(changed: boolean) {
    if (!changed || !this.runner || this.storageFailed) return;
    const state = this.runner.state();
    this.persistence = this.persistence
      .then(() => writeDizyQuantCampaignRecorderState(state))
      .catch((reason) => {
        this.failStorage(reason);
      });
  }

  private async marketFor(symbol: string): Promise<CampaignMarket | null> {
    if (this.market?.symbol === symbol) return this.market;
    const signal = AbortSignal.timeout(10_000);
    const markets = await getMexcMarkets(signal).catch(() => []);
    const market = markets.find(
      (value) => value.marketType === "futures" && value.sourceSymbol === symbol,
    );
    if (!market || !Number.isFinite(market.contractSize) || (market.contractSize ?? 0) <= 0) {
      return null;
    }
    this.market = Object.freeze({
      symbol,
      contractSize: market.contractSize!,
      priceUnit: market.priceUnit,
    });
    return this.market;
  }

  private processEnvelope(envelope: DepthEnvelope, market: CampaignMarket) {
    if (
      this.storageFailed ||
      !this.runner ||
      envelope.snapshot.symbol !== market.symbol ||
      this.activeSymbol !== market.symbol
    ) {
      return;
    }

    const outcome = validOutcomeEnvelope(envelope);
    if (outcome) {
      const mutation = this.runner.observeOutcome(outcome);
      this.persistIfChanged(mutation.changed);
    }

    try {
      if (!this.runtime) {
        const priceStep = inferDizyQuantCampaignPriceStep(
          envelope.snapshot,
          market.priceUnit,
        );
        if (priceStep === null) return;
        this.runtime = new DizyQuantCampaignDepthRuntime({
          symbol: market.symbol,
          contractSize: market.contractSize,
          priceStep,
        });
      }
      const publication = this.runtime.push(envelope);
      if (!publication) return;
      publishDizyQuantCampaignDepthPublication(publication);
      const mutation = this.runner.consumePublication(publication);
      this.persistIfChanged(mutation.changed);
    } catch (reason) {
      this.runtime?.clear();
      this.lastError = safeError(reason);
    }
  }

  private attachCollector(collector: DepthCollector, market: CampaignMarket) {
    if (collector === this.collector && this.activeSymbol === market.symbol) return;
    this.detachCollector();
    this.collector = collector;
    this.activeSymbol = market.symbol;
    this.runtime = null;
    const process = (envelope: DepthEnvelope) => this.processEnvelope(envelope, market);
    const latest = collector.getLatest();
    if (latest) process(latest);
    this.unsubscribe = collector.subscribe(process);
  }

  private async pulseLease() {
    if (this.storageFailed || !this.runner) return;
    const now = Date.now();
    const residency = dizyQuantCampaignResidencyAt(now);
    if (this.residency?.slot !== residency.slot) this.resetResidencyCollector();
    this.residency = residency;

    const market = await this.marketFor(residency.symbol);
    if (this.storageFailed) return;
    if (Date.now() >= residency.toMs) {
      this.scheduleWake(250);
      return;
    }
    if (!market) {
      this.phase = "waiting-market-metadata";
      this.lastError = "DizyQuant campaign market metadata is unavailable";
      this.scheduleWake(
        Math.min(DIZYQUANT_CAMPAIGN_MARKET_RETRY_MS, Math.max(250, residency.toMs - Date.now())),
      );
      return;
    }

    let collector: DepthCollector;
    try {
      collector = acquireDepthCollector(residency.symbol);
    } catch (reason) {
      this.detachCollector();
      this.phase = "waiting-collector-capacity";
      this.lastError = safeError(reason);
      this.scheduleWake(
        Math.min(DIZYQUANT_CAMPAIGN_LEASE_PULSE_MS, Math.max(250, residency.toMs - Date.now())),
      );
      return;
    }

    try {
      this.attachCollector(collector, market);
      this.lastError = null;
      this.phase = "collecting";
    } finally {
      // The campaign deliberately holds no registry reference between pulses.
      // Its idle collector can therefore be pruned immediately when normal terminal
      // traffic needs the remaining low-memory slot.
      releaseDepthCollector(residency.symbol);
    }
    this.scheduleWake(
      Math.min(DIZYQUANT_CAMPAIGN_LEASE_PULSE_MS, Math.max(250, residency.toMs - Date.now() + 25)),
    );
  }

  status(): DizyQuantCampaignRecorderServiceStatus {
    return Object.freeze({
      serviceVersion: DIZYQUANT_CAMPAIGN_RECORDER_SERVICE_VERSION,
      phase: this.phase,
      activeSymbol: this.activeSymbol,
      residency: this.residency,
      lastError: this.lastError,
      startedAtMs: this.startedAtMs,
      stats: this.runner?.stats() ?? null,
      researchOnly: true,
      decisionEligible: false,
      signalEligible: false,
      executionEligible: false,
      promotionEligible: false,
    });
  }
}

export function startDizyQuantCampaignRecorderService() {
  const root = globalThis as GlobalCampaignService;
  root.__dizyQuantCampaignRecorderService ??= new DizyQuantCampaignRecorderService();
  root.__dizyQuantCampaignRecorderService.start();
  return root.__dizyQuantCampaignRecorderService;
}

export function readDizyQuantCampaignRecorderServiceStatus(): DizyQuantCampaignRecorderServiceStatus {
  const root = globalThis as GlobalCampaignService;
  return (
    root.__dizyQuantCampaignRecorderService?.status() ??
    Object.freeze({
      serviceVersion: DIZYQUANT_CAMPAIGN_RECORDER_SERVICE_VERSION,
      phase: "starting" as const,
      activeSymbol: null,
      residency: null,
      lastError: null,
      startedAtMs: 0,
      stats: null,
      researchOnly: true as const,
      decisionEligible: false as const,
      signalEligible: false as const,
      executionEligible: false as const,
      promotionEligible: false as const,
    })
  );
}
