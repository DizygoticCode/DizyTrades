import type {
  CompactLiquidityChange,
  LiquidityTileCell,
  LiquidityTileResponse,
} from "./types.ts";
import {
  expandHeatmapDetectionRange,
  readHeatmapDisplayTuning,
} from "./heatmap.ts";

export type LiquidityViewport = {
  from: number;
  to: number;
  minPrice: number;
  maxPrice: number;
  effectiveTimeBucketMs: number;
  effectivePriceStep: number;
  retentionMs?: number;
};
export type LiquidityCacheStatus =
  | "idle"
  | "loading"
  | "connected"
  | "unchanged"
  | "resynchronising"
  | "disconnected"
  | "gap";
export type LiquidityMetadata = {
  priceStep: number;
  coverage: {
    archiveStartMs: number | null;
    archiveEndMs: number | null;
    hasGaps: boolean;
  };
  diagnostic?: { sequence?: number };
};
export type LiquidityCacheSnapshot = {
  cells: readonly LiquidityTileCell[];
  endState: readonly CompactLiquidityChange[];
  priceStep: number;
  timeBucketMs: number;
  requests: number;
  requestsStarted: number;
  requestsCompleted: number;
  requestsAborted: number;
  requestsFailed: number;
  hits: number;
  misses: number;
  loadedFrom: number | null;
  loadedTo: number | null;
  archiveFrom: number | null;
  archiveTo: number | null;
  hasGap: boolean;
  sequence: number | null;
  status: LiquidityCacheStatus;
  revision: number;
  liveRevision: number;
  lastTileError: string | null;
  lastTileHttpStatus: number | null;
  lastRequestedTileRange: { from: number; to: number } | null;
  lastSuccessfulTileRange: { from: number; to: number } | null;
};
type Range = {
  key: string;
  from: number;
  to: number;
  cells: LiquidityTileCell[];
  used: number;
};

const MAX_CELLS = 40_000;
const MAX_RANGES = 24;
const CHUNK_MS = 6 * 60 * 60_000;
const keyFor = (exchange: string, symbol: string) =>
  `${exchange.toLowerCase()}:${symbol.toUpperCase()}`;

export class LiquidityHistoryCache {
  readonly exchange: string;
  readonly symbol: string;
  private maximumCells: number;
  private ranges = new Map<string, Range>();
  private listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private groupId = 0;
  private groupKey = "";
  private requestsStarted = 0;
  private requestsCompleted = 0;
  private requestsAborted = 0;
  private requestsFailed = 0;
  private hits = 0;
  private misses = 0;
  private priceStep = 1;
  private displayPriceStep = 1;
  private timeBucketMs = 5000;
  private archiveFrom: number | null = null;
  private archiveTo: number | null = null;
  private hasGap = false;
  private sequence: number | null = null;
  private status: LiquidityCacheStatus = "idle";
  private revision = 0;
  private liveRevision = 0;
  private endState: CompactLiquidityChange[] = [];
  private liveCells: LiquidityTileCell[] = [];
  private liveFrom: number | null = null;
  private liveTo: number | null = null;
  private liveChangedTicks = new Set<number>();
  private lastTileError: string | null = null;
  private lastTileHttpStatus: number | null = null;
  private lastRequestedTileRange: { from: number; to: number } | null = null;
  private lastSuccessfulTileRange: { from: number; to: number } | null = null;

  constructor(exchange: string, symbol: string, maximumCells = MAX_CELLS) {
    this.exchange = exchange;
    this.symbol = symbol.toUpperCase();
    this.maximumCells = maximumCells;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private aggregateEndState() {
    const exchangeStep = Math.max(1e-8, this.priceStep);
    const displayStep = Math.max(exchangeStep, this.displayPriceStep);
    const bins = new Map<number, { bid: number; ask: number }>();
    for (const state of this.endState) {
      const price = state.priceTick * exchangeStep;
      const bin = Math.round(price / displayStep);
      const value = bins.get(bin) ?? { bid: 0, ask: 0 };
      value.bid += state.bidContracts;
      value.ask += state.askContracts;
      bins.set(bin, value);
    }
    return [...bins.entries()]
      .filter(([, value]) => value.bid > 0 || value.ask > 0)
      .map(([bin, value]) => ({
        price: bin * displayStep,
        bidQuantity: value.bid,
        askQuantity: value.ask,
      }));
  }

  private appendLiveFrame(fromMs: number, toMs: number) {
    if (!(toMs > fromMs)) return;
    for (const value of this.aggregateEndState()) {
      this.liveCells.push({ fromMs, toMs, ...value });
    }
    const liveLimit = Math.max(32, Math.floor(this.maximumCells / 2));
    if (this.liveCells.length > liveLimit)
      this.liveCells.splice(0, this.liveCells.length - liveLimit);
  }

  private resetLiveBridge() {
    this.liveCells = [];
    this.liveFrom = null;
    this.liveTo = null;
    this.liveChangedTicks.clear();
  }

  snapshot(): LiquidityCacheSnapshot {
    const ranges = [...this.ranges.values()];
    const archiveCells = ranges.flatMap((value) => value.cells);
    const bridgeFrom = Math.max(this.liveFrom ?? 0, this.archiveTo ?? 0);
    const liveCells = this.liveCells
      .map((cell) => ({ ...cell, fromMs: Math.max(cell.fromMs, bridgeFrom) }))
      .filter((cell) => cell.toMs > cell.fromMs);
    const cells = [...archiveCells, ...liveCells]
      .sort((a, b) => a.fromMs - b.fromMs || a.price - b.price)
      .slice(-this.maximumCells);
    const loadedFrom = ranges.length
      ? Math.min(...ranges.map((value) => value.from))
      : null;
    const loadedTo = ranges.length
      ? Math.max(...ranges.map((value) => value.to))
      : null;
    return {
      cells,
      endState: this.endState,
      priceStep: this.priceStep,
      timeBucketMs: this.timeBucketMs,
      requests: this.requestsCompleted,
      requestsStarted: this.requestsStarted,
      requestsCompleted: this.requestsCompleted,
      requestsAborted: this.requestsAborted,
      requestsFailed: this.requestsFailed,
      hits: this.hits,
      misses: this.misses,
      loadedFrom,
      loadedTo,
      archiveFrom: this.archiveFrom,
      archiveTo: this.archiveTo,
      hasGap: this.hasGap,
      sequence: this.sequence,
      status: this.status,
      revision: this.revision,
      liveRevision: this.liveRevision,
      lastTileError: this.lastTileError,
      lastTileHttpStatus: this.lastTileHttpStatus,
      lastRequestedTileRange: this.lastRequestedTileRange,
      lastSuccessfulTileRange: this.lastSuccessfulTileRange,
    };
  }

  applyMetadata(metadata: LiquidityMetadata) {
    this.priceStep = metadata.priceStep || this.priceStep;
    this.archiveFrom = metadata.coverage.archiveStartMs;
    this.archiveTo = metadata.coverage.archiveEndMs;
    this.hasGap = metadata.coverage.hasGaps;
    this.sequence = metadata.diagnostic?.sequence ?? this.sequence;
    this.status = "connected";
    this.emit();
  }

  private evict() {
    let total = [...this.ranges.values()].reduce(
      (count, value) => count + value.cells.length,
      0,
    );
    while (this.ranges.size > MAX_RANGES || total > this.maximumCells) {
      const oldest = [...this.ranges.values()].sort((a, b) => a.used - b.used)[0];
      if (!oldest) break;
      this.ranges.delete(oldest.key);
      total -= oldest.cells.length;
    }
  }

  async ensure(view: LiquidityViewport, fetcher: typeof fetch = fetch) {
    if (
      !Number.isFinite(view.from) ||
      !Number.isFinite(view.to) ||
      view.to <= view.from ||
      view.minPrice <= 0 ||
      view.maxPrice <= view.minPrice
    )
      return;

    const bucket = Math.max(5000, view.effectiveTimeBucketMs);
    const viewportFrom = Math.floor(Math.max(0, view.from) / bucket) * bucket;
    const viewportTo = Math.ceil(view.to / bucket) * bucket;
    const fallbackFrom = viewportTo - (view.retentionMs ?? 6 * 60 * 60_000);
    const from = Math.max(viewportFrom, this.archiveFrom ?? fallbackFrom);
    const to = Math.min(viewportTo, this.archiveTo ?? viewportTo);
    this.lastRequestedTileRange = { from, to };
    if (to <= from) {
      this.status = "unchanged";
      this.lastTileError = null;
      this.lastTileHttpStatus = null;
      this.emit();
      return;
    }

    const tuning = readHeatmapDisplayTuning();
    const expanded = expandHeatmapDetectionRange(
      view.minPrice,
      view.maxPrice,
      tuning.detectionRangeBps,
    );
    const pricePad = (expanded.maxPrice - expanded.minPrice) * 0.02;
    const minPrice = Math.max(1e-8, expanded.minPrice - pricePad);
    const maxPrice = expanded.maxPrice + pricePad;
    const chunks: { from: number; to: number; key: string }[] = [];
    for (
      let start = Math.floor(from / CHUNK_MS) * CHUNK_MS;
      start < to;
      start += CHUNK_MS
    ) {
      const chunkFrom = Math.max(from, start);
      const chunkTo = Math.min(to, start + CHUNK_MS);
      const key = [
        chunkFrom,
        chunkTo,
        minPrice.toPrecision(8),
        maxPrice.toPrecision(8),
        bucket,
        view.effectivePriceStep,
      ].join(":");
      chunks.push({ from: chunkFrom, to: chunkTo, key });
    }

    const nextGroupKey = chunks.map((value) => value.key).join("|");
    if (nextGroupKey === this.groupKey && this.status === "loading") return;
    if (this.controller) {
      this.controller.abort();
      this.requestsAborted++;
    }
    this.controller = new AbortController();
    this.groupKey = nextGroupKey;
    const controller = this.controller;
    const id = ++this.groupId;
    const missing = chunks.filter((chunk) => {
      const found = this.ranges.get(chunk.key);
      if (found) {
        found.used = Date.now();
        this.hits++;
        return false;
      }
      this.misses++;
      return true;
    });
    if (!missing.length) {
      this.status = this.hasGap ? "gap" : "unchanged";
      this.emit();
      return;
    }

    this.status = "loading";
    this.lastTileError = null;
    this.lastTileHttpStatus = null;
    this.emit();
    let cursor = 0;
    const worker = async () => {
      while (cursor < missing.length) {
        const chunk = missing[cursor++];
        this.requestsStarted++;
        this.lastRequestedTileRange = { from: chunk.from, to: chunk.to };
        this.emit();
        try {
          const query = new URLSearchParams({
            symbol: this.symbol,
            fromMs: String(chunk.from),
            toMs: String(chunk.to),
            minPrice: String(minPrice),
            maxPrice: String(maxPrice),
            timeBucketMs: String(bucket),
            priceStep: String(view.effectivePriceStep),
          });
          const response = await fetcher(`/api/dizyflow/heatmap/tiles?${query}`, {
            signal: controller.signal,
          });
          if (!response.ok) {
            let message = "";
            try {
              const body = (await response.json()) as { error?: string };
              message = body.error?.slice(0, 240) ?? "";
            } catch {}
            const error = Error(
              `HTTP ${response.status}${message ? `: ${message}` : ""}`,
            );
            Object.assign(error, { status: response.status });
            throw error;
          }
          const tile = (await response.json()) as LiquidityTileResponse;
          if (id !== this.groupId) return;
          this.requestsCompleted++;
          this.displayPriceStep = Math.max(1e-8, tile.priceStep);
          this.timeBucketMs = tile.timeBucketMs;
          this.archiveFrom =
            tile.capturedFromMs === null
              ? this.archiveFrom
              : Math.min(this.archiveFrom ?? tile.capturedFromMs, tile.capturedFromMs);
          this.archiveTo =
            tile.capturedToMs === null
              ? this.archiveTo
              : Math.max(this.archiveTo ?? tile.capturedToMs, tile.capturedToMs);
          this.hasGap = this.hasGap || tile.hasGaps;

          if (this.liveTo === null) {
            this.endState = [...tile.endState];
          } else {
            for (const state of tile.endState) {
              if (this.liveChangedTicks.has(state.priceTick)) continue;
              const index = this.endState.findIndex(
                (value) => value.priceTick === state.priceTick,
              );
              if (index >= 0) this.endState[index] = state;
              else this.endState.push(state);
            }
            if (tile.capturedToMs !== null && tile.capturedToMs >= this.liveTo) {
              this.resetLiveBridge();
              this.endState = [...tile.endState];
            }
          }

          const captured =
            tile.capturedFromMs !== null && tile.capturedToMs !== null;
          if (!captured && !tile.cells.length) {
            this.emit();
            continue;
          }
          this.ranges.set(chunk.key, {
            key: chunk.key,
            from: chunk.from,
            to: chunk.to,
            cells: tile.cells,
            used: Date.now(),
          });
          this.lastSuccessfulTileRange = { from: chunk.from, to: chunk.to };
          this.evict();
          this.revision++;
          this.emit();
        } catch (error) {
          if (controller.signal.aborted) return;
          this.requestsFailed++;
          this.lastTileHttpStatus =
            typeof error === "object" && error !== null && "status" in error
              ? Number(error.status)
              : null;
          this.lastTileError =
            error instanceof Error ? error.message : "Tile request failed";
          this.status = "disconnected";
          this.emit();
          throw error;
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(2, missing.length) }, worker));
      if (id === this.groupId) {
        this.status = this.hasGap ? "gap" : "connected";
        this.lastTileError = null;
        this.lastTileHttpStatus = null;
        this.emit();
      }
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  mergeLive(
    changes: readonly CompactLiquidityChange[],
    sequence: number | null,
    priceStep = this.priceStep,
  ) {
    if (
      sequence !== null &&
      this.sequence !== null &&
      sequence !== this.sequence + 1
    ) {
      this.status = "resynchronising";
      this.sequence = sequence;
      this.ranges.clear();
      this.endState = [];
      this.resetLiveBridge();
      this.revision++;
      this.emit();
      return false;
    }

    this.priceStep = Math.max(1e-8, priceStep);
    this.sequence = sequence ?? this.sequence;
    const valid = changes
      .filter(
        (change) =>
          Number.isFinite(change.timestampMs) &&
          change.timestampMs > 0 &&
          Number.isFinite(change.priceTick) &&
          Number.isFinite(change.bidContracts) &&
          Number.isFinite(change.askContracts),
      )
      .sort((a, b) => a.timestampMs - b.timestampMs || a.priceTick - b.priceTick);

    if (valid.length) {
      if (this.liveFrom === null) {
        const first = valid[0].timestampMs;
        this.liveFrom = Math.min(this.archiveTo ?? first, first);
        this.liveTo = this.liveFrom;
      }

      let index = 0;
      while (index < valid.length) {
        const timestampMs = valid[index].timestampMs;
        const priorEdge = this.liveTo ?? timestampMs;
        this.appendLiveFrame(priorEdge, timestampMs);
        while (index < valid.length && valid[index].timestampMs === timestampMs) {
          const change = valid[index++];
          const existing = this.endState.findIndex(
            (value) => value.priceTick === change.priceTick,
          );
          if (
            existing >= 0 &&
            this.endState[existing].timestampMs > change.timestampMs
          )
            continue;
          if (existing >= 0) this.endState[existing] = change;
          else this.endState.push(change);
          this.liveChangedTicks.add(change.priceTick);
        }
        this.liveTo = Math.max(this.liveTo ?? timestampMs, timestampMs);
      }
    }

    this.liveRevision++;
    this.revision++;
    this.status = "connected";
    this.emit();
    return true;
  }

  markDisconnected() {
    this.status = "disconnected";
    this.emit();
  }

  markResynchronising() {
    this.status = "resynchronising";
    this.emit();
  }

  abort() {
    if (this.controller) {
      this.controller.abort();
      this.requestsAborted++;
      this.controller = null;
      this.emit();
    }
  }
}

const caches = new Map<string, LiquidityHistoryCache>();
export function liquidityHistoryCache(exchange: string, symbol: string) {
  const key = keyFor(exchange, symbol);
  let cache = caches.get(key);
  if (!cache) {
    cache = new LiquidityHistoryCache(exchange, symbol);
    caches.set(key, cache);
  }
  return cache;
}
