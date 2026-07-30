export class BoundedTtlCache<T> {
  private values = new Map<string, { value: T; expires: number }>();
  private readonly max: number; private readonly ttlMs: number; private readonly now: () => number;
  constructor(max = 100, ttlMs = 30_000, now = Date.now) { this.max=max; this.ttlMs=ttlMs; this.now=now; }
  get(key: string) { const hit=this.values.get(key); if (!hit || hit.expires <= this.now()) { this.values.delete(key); return; } this.values.delete(key); this.values.set(key,hit); return hit.value; }
  set(key: string,value:T) { this.values.delete(key); this.values.set(key,{value,expires:this.now()+this.ttlMs}); while(this.values.size>this.max) this.values.delete(this.values.keys().next().value!); }
  get size(){ return this.values.size; }
}
