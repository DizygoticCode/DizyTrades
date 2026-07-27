import type { BookView, DepthLevel, DepthSnapshot, DepthUpdate } from "./types.ts";

export class OrderBook {
  private bids = new Map<number, DepthLevel>(); private asks = new Map<number, DepthLevel>();
  private future = new Map<number, DepthUpdate>(); private _version = -1; private _valid = false;
  private resnapshotBuffer: Map<number, DepthUpdate> | null = null;
  private readonly maxBuffered: number;
  constructor(maxBuffered = 250) { this.maxBuffered = maxBuffered; }
  reset() { this.bids.clear(); this.asks.clear(); this.future.clear(); this.resnapshotBuffer=null; this._version = -1; this._valid = false; }
  /** Start an atomic fresh-snapshot generation. New socket events are isolated. */
  beginResnapshot() { this.resnapshotBuffer=new Map(); }
  /** Replace a poisoned buffer and join only events received during this request. */
  applyResnapshot(value: DepthSnapshot) {
    const received=this.resnapshotBuffer??new Map<number,DepthUpdate>();
    this.resnapshotBuffer=null;this.bids.clear();this.asks.clear();this.future.clear();
    this._version=value.version;this.applyLevels(value);
    for(const update of received.values())if(update.version>value.version)this.future.set(update.version,update);
    this.drain();
  }
  snapshot(value: DepthSnapshot) {
    this.installSnapshot(value); this.reconcile([]);
  }
  /** Install displayable REST levels without waiting for the socket join. */
  installSnapshot(value: DepthSnapshot) {
    const buffered = [...this.future.values()].filter((update) => update.version > value.version);
    this.bids.clear(); this.asks.clear(); this.future.clear();
    buffered.forEach((update) => this.future.set(update.version, update));
    this._version = value.version; this.applyLevels(value); this._valid = buffered.length === 0;
  }
  /** Merge recovery commits with buffered socket updates; socket wins a version. */
  reconcile(values: readonly DepthUpdate[]) {
    for (const value of values) if(value.version>this._version&&!this.future.has(value.version)) this.future.set(value.version,value);
    this.drain(); return this._valid;
  }
  /** Apply sorted public commit history without allowing a jump. */
  bridge(values: readonly DepthUpdate[]) {
    return this.reconcile(values);
  }
  update(value: DepthUpdate): "applied" | "ignored" | "buffered" | "gap" {
    if(this.resnapshotBuffer){this.resnapshotBuffer.set(value.version,value);while(this.resnapshotBuffer.size>this.maxBuffered)this.resnapshotBuffer.delete(Math.min(...this.resnapshotBuffer.keys()));return "buffered";}
    if (value.version <= this._version) return "ignored";
    if (value.version > this._version + 1 || this._version < 0) { this.future.set(value.version, value); while (this.future.size > this.maxBuffered) this.future.delete(Math.min(...this.future.keys())); this._valid = false; return this._version < 0 ? "buffered" : "gap"; }
    // A commit recovery deliberately supplies localVersion + 1 while invalid.
    // Applying it and draining the already buffered tail repairs the sequence.
    this.applyLevels(value); this._version = value.version; this.drain(); return "applied";
  }
  private drain() { while (this.future.has(this._version + 1)) { const next = this.future.get(this._version + 1)!; this.future.delete(next.version); this.applyLevels(next); this._version = next.version; } this._valid = this.future.size === 0; }
  private applyLevels(value: Pick<DepthUpdate, "bids" | "asks">) { const apply = (map: Map<number, DepthLevel>, levels: DepthLevel[]) => levels.forEach((level) => level.contractQuantity === 0 ? map.delete(level.price) : map.set(level.price, level)); apply(this.bids, value.bids); apply(this.asks, value.asks); }
  view(): BookView { return { valid: this._valid, version: this._version, bids: [...this.bids.values()].sort((a,b)=>b.price-a.price), asks: [...this.asks.values()].sort((a,b)=>a.price-b.price) }; }
}
