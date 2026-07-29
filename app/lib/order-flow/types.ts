export type FlowStatus = "Off" | "Connecting" | "Subscribing" | "LoadingSnapshot" | "Bridging" | "Live" | "Delayed" | "Offline" | "Stale" | "Recovering" | "Error";
export type DepthSide = "bid" | "ask";
export type DepthLevel = { price: number; orderCount: number; contractQuantity: number };
export type DepthUpdate = { symbol: string; version: number; engineTimeMs: number; bids: DepthLevel[]; asks: DepthLevel[] };
export type DepthSnapshot = DepthUpdate;
export type DepthEnvelope = { snapshot:DepthSnapshot; receivedAt:number; diagnostic:{snapshotAgeMs:number;consecutiveFailures:number;lastError:string|null} };
export type DepthSnapshotResponse = { success: true; symbol: string; source: string; requestedAt: string; snapshot: DepthSnapshot };
/** Canonical response returned by the public depth-commit recovery route. */
export type DepthCommitsResponse = { success: true; symbol: string; source: string; requestedAt: string; commits: DepthUpdate[] };
export type BookView = { valid: boolean; version: number; bids: DepthLevel[]; asks: DepthLevel[] };
export type HeatmapCell = { timestampMs: number; price: number; bidNotional: number; askNotional: number; bidQuantity:number; askQuantity:number; mid: number; spread: number };
export type VolumeBubble = { timeMs: number; price: number; buyNotional: number; sellNotional: number; buyQuantity:number; sellQuantity:number; tradeCount: number };
export type FlowAlert = { id: string; type: "Large Market Buy" | "Large Market Sell" | "Large Bid Wall" | "Large Ask Wall" | "Bid Liquidity Pulled" | "Ask Liquidity Pulled"; symbol: string; timeMs: number; price: number; notional: number; message: string };
