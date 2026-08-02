export const GUIDED_REVIEW_START = "=== DIZYTRADES GUIDED HISTORICAL REVIEW V1 ===";
export const GUIDED_REVIEW_END = "=== END DIZYTRADES GUIDED HISTORICAL REVIEW ===";

export type GuidedTradeReviewDraft = Readonly<{
  context: string;
  entryEvidence: string;
  management: string;
  exit: string;
  strength: string;
  improvement: string;
  repeatRule: string;
}>;

export type GuidedTradeReviewContext = Readonly<{
  tradeId: string;
  symbol: string;
  timeframe: string;
  direction: "long" | "short";
  pnlPct: number;
  closeReason: string;
  replayAvailable: boolean;
  historicalFlowAvailable: boolean;
  dizyBrainReviewAvailable: boolean;
}>;

export const emptyGuidedTradeReview = (): GuidedTradeReviewDraft =>
  Object.freeze({
    context: "",
    entryEvidence: "",
    management: "",
    exit: "",
    strength: "",
    improvement: "",
    repeatRule: "",
  });

const fields: ReadonlyArray<readonly [keyof GuidedTradeReviewDraft, string]> =
  Object.freeze([
    ["context", "Market context before entry"],
    ["entryEvidence", "Evidence supporting the entry"],
    ["management", "Trade management and thesis changes"],
    ["exit", "Exit decision and evidence"],
    ["strength", "One thing done well"],
    ["improvement", "One thing to improve"],
    ["repeatRule", "One rule to repeat next time"],
  ]);

const clean = (value: unknown) =>
  typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, 4_000) : "";

export function normaliseGuidedTradeReview(
  value: Partial<GuidedTradeReviewDraft> | null | undefined,
): GuidedTradeReviewDraft {
  return Object.freeze({
    context: clean(value?.context),
    entryEvidence: clean(value?.entryEvidence),
    management: clean(value?.management),
    exit: clean(value?.exit),
    strength: clean(value?.strength),
    improvement: clean(value?.improvement),
    repeatRule: clean(value?.repeatRule),
  });
}

export function guidedTradeReviewCompletion(value: GuidedTradeReviewDraft) {
  const completed = fields.filter(([key]) => clean(value[key]).length > 0).length;
  return Object.freeze({
    completed,
    total: fields.length,
    percentage: Math.round((completed / fields.length) * 100),
    complete: completed === fields.length,
  });
}

const evidenceLabel = (available: boolean) => (available ? "available" : "unavailable");

export function renderGuidedTradeReview(
  draft: GuidedTradeReviewDraft,
  context: GuidedTradeReviewContext,
) {
  const value = normaliseGuidedTradeReview(draft);
  const lines = [
    GUIDED_REVIEW_START,
    `Trade: ${context.tradeId} · ${context.symbol} · ${context.timeframe} · ${context.direction}`,
    `Outcome: ${context.pnlPct >= 0 ? "+" : ""}${context.pnlPct.toFixed(2)}% · ${context.closeReason}`,
    `Evidence: Replay ${evidenceLabel(context.replayAvailable)} · Historical DizyFlow ${evidenceLabel(context.historicalFlowAvailable)} · DizyBrain Review ${evidenceLabel(context.dizyBrainReviewAvailable)}`,
    "",
  ];
  for (const [key, label] of fields) {
    lines.push(`${label}:`, value[key] || "Not recorded.", "");
  }
  lines.push(GUIDED_REVIEW_END);
  return lines.join("\n").trim();
}

export function extractGuidedTradeReview(notes: string): GuidedTradeReviewDraft | null {
  const start = notes.indexOf(GUIDED_REVIEW_START);
  const end = notes.indexOf(GUIDED_REVIEW_END, start + GUIDED_REVIEW_START.length);
  if (start < 0 || end < 0) return null;
  const body = notes.slice(start + GUIDED_REVIEW_START.length, end);
  const result: Partial<Record<keyof GuidedTradeReviewDraft, string>> = {};
  for (let index = 0; index < fields.length; index += 1) {
    const [key, label] = fields[index];
    const marker = `${label}:\n`;
    const markerIndex = body.indexOf(marker);
    if (markerIndex < 0) continue;
    const valueStart = markerIndex + marker.length;
    const nextLabel = fields[index + 1]?.[1];
    const nextIndex = nextLabel ? body.indexOf(`\n${nextLabel}:\n`, valueStart) : body.length;
    const raw = body.slice(valueStart, nextIndex < 0 ? body.length : nextIndex).trim();
    result[key] = raw === "Not recorded." ? "" : raw;
  }
  return normaliseGuidedTradeReview(result);
}

export function upsertGuidedTradeReviewNotes(notes: string, block: string) {
  const source = notes.replace(/\r\n/g, "\n").trim();
  const start = source.indexOf(GUIDED_REVIEW_START);
  const end = source.indexOf(GUIDED_REVIEW_END, start + GUIDED_REVIEW_START.length);
  if (start >= 0 && end >= 0) {
    const before = source.slice(0, start).trimEnd();
    const after = source.slice(end + GUIDED_REVIEW_END.length).trimStart();
    return [before, block.trim(), after].filter(Boolean).join("\n\n").trim();
  }
  return [source, block.trim()].filter(Boolean).join("\n\n").trim();
}
