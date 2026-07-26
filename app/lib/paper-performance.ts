import type { BacktestSummary, PaperTrade } from "./backtest.ts";

export type LivePaperSnapshot = BacktestSummary & { pnl: number; openTrade: PaperTrade | null; liveMtm: boolean };

export function livePaperSnapshot(confirmed: BacktestSummary, mark: number | null, enabled: boolean): LivePaperSnapshot {
  const open = confirmed.closedTrades.at(-1)?.exitReason === "MARK" ? confirmed.closedTrades.at(-1)! : null;
  if (!enabled || !open || mark == null) return { ...confirmed, pnl: confirmed.endingEquity - confirmed.initialEquity, openTrade: open, liveMtm: false };
  const direction = open.direction === "long" ? 1 : -1;
  const markedPnl = open.realisedPnl + direction * (mark - open.entry) * open.remainingQuantity;
  const endingEquity = confirmed.endingEquity - open.pnl + markedPnl;
  return { ...confirmed, endingEquity, returnPct: ((endingEquity - confirmed.initialEquity) / confirmed.initialEquity) * 100, pnl: endingEquity - confirmed.initialEquity, openTrade: { ...open, exit: mark, pnl: markedPnl }, liveMtm: true };
}

export const formatSignedMoney = (value: number) => `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
export const tradeExitLabel = (reason: PaperTrade["exitReason"]) => reason === "MARK" ? "Open / MTM" : reason;
