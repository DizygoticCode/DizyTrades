export const JOURNAL_SCHEMA_VERSION = 4 as const;
export const JOURNAL_TITLE_MAX = 120;
export const JOURNAL_TAG_MAX = 20;
export const JOURNAL_TAG_LENGTH_MAX = 40;
export type JournalEntryType = "trade-review" | "market-note" | "general";
export type TradeQuality = "good" | "mixed" | "poor";
export type PlanDiscipline = "completely" | "mostly" | "no";
export type Mood = "calm" | "confident" | "patient" | "hesitant" | "fearful" | "greedy" | "fomo" | "frustrated" | "revenge";

export type ReplayReference = Readonly<{ sessionId: string; marketKey: string; symbol: string; timeframe: string; entryTimeMs: number; available: boolean;source:"rolling-history"|"retained-memory"|"unavailable";memoryId:string|null;capturedRangeStartMs:number|null;capturedRangeEndMs:number|null;candleCount:number|null;integrityWarnings:readonly string[];brainAvailable:boolean;flowAvailability:"available"|"partially-available"|"unavailable"|"capture-not-supported"|"error" }>;
export type SnapshotReference = Readonly<{ id: string; capturedAt: string; summary: string }>;
export type SignalSummary = Readonly<{ direction: "long" | "short"; signalTime: string; label: string }>;
export type DizyBrainReviewReference = Readonly<{available:boolean;reviewId:string|null;engineVersion:string|null;generatedAt:string|null;generatedFromHash:string|null;reviewConfidence:number|null}>;

/** Small, immutable execution facts copied at completion. Replay candles and Brain datasets are references, never embedded. */
export type TradeSnapshot = Readonly<{
  tradeId: string; symbol: string; market: string; timeframe: string; direction: "long" | "short";
  entry: number; exit: number; stop: number | null; target: number | null; positionSize: number | null;
  riskPct: number | null; leverage: number | null; marginMode: "isolated" | "cross" | null; fees: number | null;
  pnl: number; pnlPct: number; rMultiple: number | null; openTime: string; closeTime: string;
  closeReason: string; strategyVersion: string | null; replay: ReplayReference | null;
  brain: SnapshotReference | null; signal: SignalSummary | null; dizyBrainReview:DizyBrainReviewReference;
}>;

export type JournalEntry = Readonly<{
  id: string; schemaVersion: typeof JOURNAL_SCHEMA_VERSION; type: JournalEntryType; createdAt: string; editedAt: string;
  title: string; archived: boolean; archivedAt: string | null; notes: string; tags: readonly string[];
  dismissedPrompts: readonly string[]; quality: TradeQuality | null; planDiscipline: PlanDiscipline | null;
  mood: Mood | null; trade: TradeSnapshot | null; marketContext: Readonly<{ symbol: string; timeframe: string }> | null;
}>;

export const REFLECTION_PROMPTS = Object.freeze(["Why did you enter?", "Did you follow your plan?", "Would you take this trade again?", "Did emotions affect this trade?", "What worked well?", "What would you improve?", "One lesson learned?"]);

export type JournalListItem = Pick<JournalEntry, "id" | "type" | "title" | "archived" | "archivedAt" | "createdAt" | "editedAt" | "tags" | "quality" | "planDiscipline" | "mood" | "marketContext"> & Readonly<{
  trade: null | Pick<TradeSnapshot, "symbol" | "timeframe" | "direction" | "pnl" | "pnlPct" | "closeReason"> & { replayAvailable: boolean; brainAvailable: boolean;reviewAvailable:boolean;reviewConfidence:number|null;reviewEngineVersion:string|null };
  notesPreview: string;
}>;

export function journalEntryLabel(entry: {title:string;trade:null|{symbol:string;direction:string};marketContext:null|{symbol:string;timeframe:string}}): string {
  if (entry.title) return entry.title;
  if (entry.trade) return `${entry.trade.symbol} · ${entry.trade.direction}`;
  if (entry.marketContext) return `${entry.marketContext.symbol} · ${entry.marketContext.timeframe}`;
  return "General Entry";
}

export function toJournalListItem(entry: JournalEntry): JournalListItem {
  return { id: entry.id, type: entry.type, title: entry.title, archived: entry.archived, archivedAt: entry.archivedAt, createdAt: entry.createdAt, editedAt: entry.editedAt, tags: entry.tags,
    quality: entry.quality, planDiscipline: entry.planDiscipline, mood: entry.mood, marketContext: entry.marketContext,
    notesPreview: entry.notes.slice(0, 140), trade: entry.trade ? { symbol: entry.trade.symbol, timeframe: entry.trade.timeframe,
      direction: entry.trade.direction, pnl: entry.trade.pnl, pnlPct: entry.trade.pnlPct, closeReason: entry.trade.closeReason,
      replayAvailable: Boolean(entry.trade.replay?.available), brainAvailable: Boolean(entry.trade.brain),reviewAvailable:entry.trade.dizyBrainReview.available,reviewConfidence:entry.trade.dizyBrainReview.reviewConfidence,reviewEngineVersion:entry.trade.dizyBrainReview.engineVersion } : null };
}

export const journalWritesAllowed = (role: string) => role !== "viewer";
