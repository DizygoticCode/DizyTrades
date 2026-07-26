import type { RiskSettings } from "./config";
import type { Candle, StrategyAnalysis } from "./strategy";

export type PaperTrade = {
  id: string;
  direction: "long" | "short";
  signalTime: number;
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  stop: number;
  pnl: number;
  pnlPct: number;
  result: "win" | "loss" | "flat";
  exitReason: "SL" | "BE" | "TP2" | "MARK";
  remainingQuantity: number;
  realisedPnl: number;
};

export type BacktestSummary = {
  initialEquity: number;
  endingEquity: number;
  returnPct: number;
  maxDrawdownPct: number;
  trades: number;
  wins: number;
  winRatePct: number;
  profitFactor: number | null;
  closedTrades: PaperTrade[];
};

const emptySummary = (equity: number): BacktestSummary => ({
  initialEquity: equity,
  endingEquity: equity,
  returnPct: 0,
  maxDrawdownPct: 0,
  trades: 0,
  wins: 0,
  winRatePct: 0,
  profitFactor: null,
  closedTrades: [],
});

export function simulateConfirmedSignals(
  candles: Candle[],
  analysis: StrategyAnalysis,
  risk: RiskSettings,
  initialEquity = 1000,
): BacktestSummary {
  if (candles.length < 40) return emptySummary(initialEquity);

  const candleIndexByTime = new Map(
    candles.map((candle, index) => [candle.time, index]),
  );
  const atrByTime = new Map(
    analysis.atr.map((point) => [point.time, point.value]),
  );
  const signals = analysis.tradeSignals;
  const trades: PaperTrade[] = [];
  let equity = initialEquity;
  let peakEquity = equity;
  let maxDrawdownPct = 0;
  let nextAvailableIndex = 0;

  for (const signal of signals) {
    const signalIndex = candleIndexByTime.get(signal.time);
    if (
      signalIndex == null ||
      signalIndex < nextAvailableIndex ||
      signalIndex + 1 >= candles.length
    ) {
      continue;
    }

    const direction = signal.direction === "buy" ? "long" : "short";
    const entryIndex = signalIndex + 1;
    const entryCandle = candles[entryIndex];
    const entry = entryCandle.open;
    const atr = atrByTime.get(signal.time) ?? Math.abs(entryCandle.high - entryCandle.low);
    const riskDistance = Math.max(atr * risk.atrStop, entry * 0.0001);
    const stop = direction === "long" ? entry - riskDistance : entry + riskDistance;
    const tp1 = direction === "long"
      ? entry + riskDistance * risk.tp1
      : entry - riskDistance * risk.tp1;
    const tp2 = direction === "long"
      ? entry + riskDistance * risk.tp2
      : entry - riskDistance * risk.tp2;
    const riskCash = Math.min(
      equity * (risk.riskPct / 100),
      risk.maxNotional / Math.max(risk.leverage, 1),
    );
    const quantity = riskCash / riskDistance;
    let realised = 0;
    let tp1Hit = false;
    let exit = entry;
    let exitIndex = candles.length - 1;
    let exitReason: PaperTrade["exitReason"] = "MARK";
    let realisedBeforeMark = 0;

    for (let index = entryIndex; index < candles.length; index += 1) {
      const candle = candles[index];
      if (direction === "long") {
        if (!tp1Hit && candle.low <= stop) {
          realised = -riskCash;
          exit = stop;
          exitIndex = index;
          exitReason = "SL";
          break;
        }
        if (!tp1Hit && candle.high >= tp1) {
          realised += quantity * 0.5 * (tp1 - entry);
          tp1Hit = true;
        }
        if (tp1Hit && candle.low <= entry) {
          exit = entry;
          exitIndex = index;
          exitReason = "BE";
          break;
        }
        if (tp1Hit && candle.high >= tp2) {
          realised += quantity * 0.5 * (tp2 - entry);
          exit = tp2;
          exitIndex = index;
          exitReason = "TP2";
          break;
        }
      } else {
        if (!tp1Hit && candle.high >= stop) {
          realised = -riskCash;
          exit = stop;
          exitIndex = index;
          exitReason = "SL";
          break;
        }
        if (!tp1Hit && candle.low <= tp1) {
          realised += quantity * 0.5 * (entry - tp1);
          tp1Hit = true;
        }
        if (tp1Hit && candle.high >= entry) {
          exit = entry;
          exitIndex = index;
          exitReason = "BE";
          break;
        }
        if (tp1Hit && candle.low <= tp2) {
          realised += quantity * 0.5 * (entry - tp2);
          exit = tp2;
          exitIndex = index;
          exitReason = "TP2";
          break;
        }
      }

      if (index === candles.length - 1) {
        realisedBeforeMark = realised;
        exit = candle.close;
        const remainingFraction = tp1Hit ? 0.5 : 1;
        const markedPnl = direction === "long"
          ? quantity * remainingFraction * (exit - entry)
          : quantity * remainingFraction * (entry - exit);
        realised += markedPnl;
      }
    }

    const equityBefore = equity;
    equity += realised;
    peakEquity = Math.max(peakEquity, equity);
    maxDrawdownPct = Math.max(
      maxDrawdownPct,
      peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0,
    );
    trades.push({
      id: `${signal.time}-${direction}`,
      direction,
      signalTime: signal.time,
      entryTime: entryCandle.time,
      exitTime: candles[exitIndex].time,
      entry,
      exit,
      stop,
      pnl: realised,
      pnlPct: equityBefore > 0 ? (realised / equityBefore) * 100 : 0,
      result: realised > 0 ? "win" : realised < 0 ? "loss" : "flat",
      exitReason,
      remainingQuantity: exitReason === "MARK" ? quantity * (tp1Hit ? 0.5 : 1) : 0,
      realisedPnl: exitReason === "MARK" ? realisedBeforeMark : realised,
    });
    nextAvailableIndex = exitIndex + 1;
  }

  const grossProfit = trades
    .filter((trade) => trade.pnl > 0)
    .reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(
    trades
      .filter((trade) => trade.pnl < 0)
      .reduce((sum, trade) => sum + trade.pnl, 0),
  );
  const wins = trades.filter((trade) => trade.pnl > 0).length;

  return {
    initialEquity,
    endingEquity: equity,
    returnPct: ((equity - initialEquity) / initialEquity) * 100,
    maxDrawdownPct,
    trades: trades.length,
    wins,
    winRatePct: trades.length ? (wins / trades.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
    closedTrades: trades,
  };
}
