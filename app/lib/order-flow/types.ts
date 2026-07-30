export type FlowStatus = "Off" | "Connecting" | "Subscribing" | "LoadingSnapshot" | "Bridging" | "Live" | "Delayed" | "Offline" | "Stale" | "Recovering" | "Error";
export type DepthSide = "bid" | "ask";
export type DepthLevel = { price: number; orderCount: number; contractQuantity: number };
export type DepthUpdate = { symbol: string; version: number; engineTimeMs: number; bids: DepthLevel[]; asks: DepthLevel[] };
export type DepthSnapshot = DepthUpdate;
export type DepthSourceMode="FULL DEPTH WS"|"REST FALLBACK"|"RECONNECTING — LAST BOOK RETAINED"|"NO VALID BOOK";
export type DepthEnvelope = { snapshot:DepthSnapshot; receivedAt:number; diagnostic:{snapshotAgeMs:number;consecutiveFailures:number;lastError:string|null;sourceMode?:DepthSourceMode;wsMessagesReceived?:number;versionGaps?:number;restRecoveries?:number} };
export type DepthSnapshotResponse = { success: true; symbol: string; source: string; requestedAt: string; snapshot: DepthSnapshot };
/** Canonical response returned by the public depth-commit recovery route. */
export type DepthCommitsResponse = { success: true; symbol: string; source: string; requestedAt: string; commits: DepthUpdate[] };
export type BookView = { valid: boolean; version: number; bids: DepthLevel[]; asks: DepthLevel[] };
/** A depth transition in exchange coordinates. `price` never depends on a later display setting. */
export type LiquidityObservation = { timestampMs:number; price:number; priceTick:number; capturedPriceStep:number; bidQuantity:number; askQuantity:number };
export type CompactLiquidityChange = { timestampMs:number;priceTick:number;bidContracts:number;askContracts:number };
export type LiquidityTileCell = { fromMs:number;toMs:number;price:number;bidQuantity:number;askQuantity:number };
export type LiquidityTileResponse = { symbol:string;requestedFromMs:number;requestedToMs:number;capturedFromMs:number|null;capturedToMs:number|null;timeBucketMs:number;priceStep:number;cells:LiquidityTileCell[];endState:CompactLiquidityChange[];hasGaps:boolean };
/** Raw public execution retained in source coordinates until render time. */
export type RawTrade = { tradeId:string; timestampMs:number; price:number; quantity:number; notional:number; side:"buy"|"sell" };
/** @deprecated compatibility alias for diagnostics written before the timeline renderer. */
export type HeatmapCell = LiquidityObservation;
export type VolumeBubble = { id:string; timeBucket:number; priceBucket:number; timeMs: number; price: number; buyNotional: number; sellNotional: number; buyQuantity:number; sellQuantity:number; tradeCount: number };
export type FlowAlert = { id: string; type: "Large Market Buy" | "Large Market Sell" | "Large Bid Wall" | "Large Ask Wall" | "Bid Liquidity Pulled" | "Ask Liquidity Pulled"; symbol: string; timeMs: number; price: number; notional: number; message: string };
