import type { DepthLevel, DepthSnapshot, DepthUpdate } from "./types.ts";

const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const number = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
export function parseDepthLevels(value: unknown): DepthLevel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((tuple) => {
    if (!Array.isArray(tuple) || tuple.length < 3) return [];
    // MEXC contract depth tuples are [price, orderCount, orderQuantity].
    const price = number(tuple[0]), orderCount = number(tuple[1]), contractQuantity = number(tuple[2]);
    return price !== null && orderCount !== null && contractQuantity !== null && price > 0 && orderCount >= 0 && contractQuantity >= 0 ? [{ price, orderCount, contractQuantity }] : [];
  });
}
export function parseDepthCommits(raw: unknown, symbol: string): DepthUpdate[] {
  const root=object(raw), data=root?.data, nested=object(data);
  // root.commits is the canonical application DTO. The two data shapes remain
  // accepted only for compatibility with direct/legacy MEXC responses.
  const values=Array.isArray(root?.commits)?root.commits as unknown[]:Array.isArray(data)?data:Array.isArray(nested?.commits)?nested.commits as unknown[]:[];
  const parsed=values.flatMap(value=>{const item=object(value);if(!item)return [];const version=number(item.version),engineTimeMs=number(item.timestamp??item.cts??item.ts??Date.now());if(version===null||engineTimeMs===null||!Number.isInteger(version)||version<0)return [];return [{symbol,version,engineTimeMs,bids:parseDepthLevels(item.bids),asks:parseDepthLevels(item.asks)}]});
  return [...new Map(parsed.map(value=>[value.version,value])).values()].sort((a,b)=>a.version-b.version);
}
export function parseDepthMessage(raw: unknown, symbol: string): DepthUpdate | null {
  const envelope = object(raw), data = object(envelope?.data);
  if (!envelope || !data || envelope.channel !== "push.depth" || String(envelope.symbol ?? data.symbol ?? "") !== symbol) return null;
  const version = number(data.version), engineTimeMs = number(data.cts ?? data.ts ?? envelope.ts);
  if (version === null || engineTimeMs === null || !Number.isInteger(version) || version < 0) return null;
  return { symbol, version, engineTimeMs, bids: parseDepthLevels(data.bids), asks: parseDepthLevels(data.asks) };
}
export function parseDepthSnapshot(raw: unknown, symbol: string): DepthSnapshot | null {
  const root = object(raw), data = object(root?.data) ?? root;
  if (!data || (data.symbol != null && String(data.symbol) !== symbol)) return null;
  const version = number(data.version), engineTimeMs = number(data.timestamp ?? data.ts ?? Date.now());
  if (version === null || engineTimeMs === null) return null;
  return { symbol, version, engineTimeMs, bids: parseDepthLevels(data.bids), asks: parseDepthLevels(data.asks) };
}
export async function decodeMexcMessage(data: unknown): Promise<unknown | null> {
  try {
    if (typeof data === "string") return JSON.parse(data);
    let bytes: ArrayBuffer;
    if (data instanceof ArrayBuffer) bytes = data;
    else if (typeof Blob !== "undefined" && data instanceof Blob) bytes = await data.arrayBuffer();
    else return null;
    let decoded: string;
    const view = new Uint8Array(bytes);
    if (view[0] === 0x1f && view[1] === 0x8b && typeof DecompressionStream !== "undefined") decoded = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    else decoded = new TextDecoder().decode(bytes);
    return JSON.parse(decoded);
  } catch { return null; }
}
