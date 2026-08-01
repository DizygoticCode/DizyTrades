export const JOURNAL_SCHEMA_VERSION = 1 as const;
export type JournalEntryType = "trade-review" | "market-note" | "general";
export type TradeQuality = "good" | "mixed" | "poor";
export type PlanDiscipline = "completely" | "mostly" | "no";
export type Mood = "calm" | "confident" | "patient" | "hesitant" | "fearful" | "greedy" | "fomo" | "frustrated" | "revenge";

export type ReplayReference = Readonly<{ sessionId: string; symbol: string; timeframe: string; entryTimeMs: number; available: boolean }>;
export type SnapshotReference = Readonly<{ id: string; capturedAt: string; summary: string }>;
export type SignalSummary = Readonly<{ direction: "long" | "short"; signalTime: string; label: string }>;

/** Small, immutable execution facts copied at completion. Replay candles and Brain datasets are references, never embedded. */
export type TradeSnapshot = Readonly<{
  tradeId: string; symbol: string; market: string; timeframe: string; direction: "long" | "short";
  entry: number; exit: number; stop: number | null; target: number | null; positionSize: number;
  riskPct: number; leverage: number; marginMode: "isolated" | "cross" | "simulated"; fees: number;
  pnl: number; pnlPct: number; rMultiple: number | null; openTime: string; closeTime: string;
  closeReason: string; strategyVersion: string; replay: ReplayReference | null;
  brain: SnapshotReference | null; signal: SignalSummary | null;
}>;

export type JournalEntry = Readonly<{
  id: string; schemaVersion: typeof JOURNAL_SCHEMA_VERSION; type: JournalEntryType; createdAt: string; editedAt: string;
  notes: string; tags: readonly string[]; dismissedPrompts: readonly string[]; quality: TradeQuality | null;
  planDiscipline: PlanDiscipline | null; mood: Mood | null; trade: TradeSnapshot | null;
  marketContext: Readonly<{ symbol: string; timeframe: string }> | null;
}>;

export const REFLECTION_PROMPTS = Object.freeze([
  "Why did you enter?", "Did you follow your plan?", "Would you take this trade again?",
  "Did emotions affect this trade?", "What worked well?", "What would you improve?", "One lesson learned?",
]);

export type JournalListItem = Pick<JournalEntry, "id" | "type" | "createdAt" | "editedAt" | "tags" | "quality" | "planDiscipline" | "mood" | "marketContext"> & Readonly<{
  trade: null | Pick<TradeSnapshot, "symbol" | "timeframe" | "direction" | "pnl" | "pnlPct" | "closeReason"> & { replayAvailable: boolean; brainAvailable: boolean };
  notesPreview: string;
}>;

export function toJournalListItem(entry: JournalEntry): JournalListItem {
  return { id: entry.id, type: entry.type, createdAt: entry.createdAt, editedAt: entry.editedAt, tags: entry.tags,
    quality: entry.quality, planDiscipline: entry.planDiscipline, mood: entry.mood, marketContext: entry.marketContext,
    notesPreview: entry.notes.slice(0, 140), trade: entry.trade ? { symbol: entry.trade.symbol, timeframe: entry.trade.timeframe,
      direction: entry.trade.direction, pnl: entry.trade.pnl, pnlPct: entry.trade.pnlPct, closeReason: entry.trade.closeReason,
      replayAvailable: Boolean(entry.trade.replay?.available), brainAvailable: Boolean(entry.trade.brain) } : null };
}
