export const DISPLAY_PRICE_SOURCES = ["last", "fair", "index"] as const;
export type DisplayPriceSource = (typeof DISPLAY_PRICE_SOURCES)[number];
export type PriceAvailability = "live" | "stale" | "unavailable" | "fallback";
export type PricePoint = { value: number | null; exchangeTimestampMs: number | null; state: PriceAvailability };
export type MexcPriceSnapshot = { instrumentKey: string; lastPrice: PricePoint; fairPrice: PricePoint; indexPrice: PricePoint };

const unavailable = (): PricePoint => ({ value: null, exchangeTimestampMs: null, state: "unavailable" });
export const emptyPriceSnapshot = (instrumentKey: string): MexcPriceSnapshot => ({ instrumentKey, lastPrice: unavailable(), fairPrice: unavailable(), indexPrice: unavailable() });
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const positive = (value: unknown) => { const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN; return Number.isFinite(parsed) && parsed > 0 ? parsed : null; };
const timestamp = (value: unknown, receivedAt: number) => { const parsed = positive(value); return parsed === null ? receivedAt : parsed < 1e12 ? parsed * 1000 : parsed; };

export function parseMexcPriceMessage(message: unknown, instrumentKey: string, symbol: string, receivedAt = Date.now()): Partial<MexcPriceSnapshot> | null {
  const envelope = record(message), data = record(envelope?.data);
  if (!envelope || !data || String(data.symbol ?? envelope.symbol ?? "") !== symbol) return null;
  const channel = String(envelope.channel ?? "");
  const time = timestamp(data.timestamp ?? data.ts ?? data.t ?? envelope.ts, receivedAt);
  if (channel === "push.fair.price") { const value = positive(data.fairPrice ?? data.price ?? data.p); return value === null ? null : { instrumentKey, fairPrice: { value, exchangeTimestampMs: time, state: "live" } }; }
  if (channel === "push.index.price") { const value = positive(data.indexPrice ?? data.price ?? data.p); return value === null ? null : { instrumentKey, indexPrice: { value, exchangeTimestampMs: time, state: "live" } }; }
  if (channel === "push.deal") return null;
  const last = positive(data.lastPrice), fair = positive(data.fairPrice), index = positive(data.indexPrice);
  if (last === null && fair === null && index === null) return null;
  return { instrumentKey, ...(last === null ? {} : { lastPrice: { value:last, exchangeTimestampMs:time, state:"live" as const } }), ...(fair === null ? {} : { fairPrice: { value:fair, exchangeTimestampMs:time, state:"live" as const } }), ...(index === null ? {} : { indexPrice: { value:index, exchangeTimestampMs:time, state:"live" as const } }) };
}

/** Merge only validated points, preserving the last valid value through malformed updates. */
export function mergePriceSnapshot(current: MexcPriceSnapshot, patch: Partial<MexcPriceSnapshot> | null): MexcPriceSnapshot { return !patch || patch.instrumentKey !== current.instrumentKey ? current : { ...current, ...patch, instrumentKey: current.instrumentKey }; }
export function markPriceFreshness(snapshot:MexcPriceSnapshot,now=Date.now(),staleAfterMs=30_000):MexcPriceSnapshot { const age=(point:PricePoint):PricePoint=>point.value!==null&&point.exchangeTimestampMs!==null&&now-point.exchangeTimestampMs>staleAfterMs?{...point,state:"stale"}:point;return {...snapshot,lastPrice:age(snapshot.lastPrice),fairPrice:age(snapshot.fairPrice),indexPrice:age(snapshot.indexPrice)}; }
export function displayPrice(snapshot:MexcPriceSnapshot, source:DisplayPriceSource):PricePoint { return source === "fair" ? snapshot.fairPrice : source === "index" ? snapshot.indexPrice : snapshot.lastPrice; }
export type AuthoritativeRiskPrice = PricePoint & { source: "fair" | "last" };
/** MEXC futures risk is marked to Fair Price. Last is an explicit availability fallback only. */
export function authoritativeRiskPrice(snapshot:MexcPriceSnapshot):AuthoritativeRiskPrice { if(snapshot.fairPrice.value!==null)return {...snapshot.fairPrice,source:"fair"};if(snapshot.lastPrice.value!==null)return {...snapshot.lastPrice,state:"fallback",source:"last"};return {...unavailable(),source:"fair"}; }
export function sanitiseDisplayPriceSource(value:unknown):DisplayPriceSource { return DISPLAY_PRICE_SOURCES.includes(value as DisplayPriceSource)?value as DisplayPriceSource:"last"; }
