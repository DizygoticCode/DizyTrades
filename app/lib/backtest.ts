import type { RiskSettings } from "./config";
import type { Candle, StrategyAnalysis } from "./strategy";

export type SignalPositionSizing = Readonly<{
  calculationMethod: "risk-stop-notional-leverage-cap-v1";
  configuredRiskCash: number;
  riskCash: number;
  quantity: number;
  notional: number;
  initialMargin: number;
  notionalCap: number;
  capSource: "risk-percent" | "maximum-notional" | "leverage-capacity";
}>;

export type PaperTrade = {
  id: string;
  direction: "long" | "short";
  signalTime: number;
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  stop: number;
  target?: number;
  positionSize?: number;
  riskPct?: number;
  leverage?: number;
  riskCash?: number;
  notional?: number;
  initialMargin?: number;
  sizingMethod?: SignalPositionSizing["calculationMethod"];
  sizingCapSource?: SignalPositionSizing["capSource"];
  rMultiple?: number;
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
  completedTrades?: number;
  openTrades?: number;
  realisedPnl?: number;
  markedPnl?: number;
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
  completedTrades: 0,
  openTrades: 0,
  realisedPnl: 0,
  markedPnl: 0,
  wins: 0,
  winRatePct: 0,
  profitFactor: null,
  closedTrades: [],
});

export function sizeSimulatedSignalPosition(input: {
  equity: number;
  entry: number;
  riskDistance: number;
  risk: RiskSettings;
}): SignalPositionSizing {
  const leverage = Math.max(1, input.risk.leverage);
  const configuredRiskCash = Math.max(0, input.equity) * (input.risk.riskPct / 100);
  const maximumNotional = Math.max(0, input.risk.maxNotional);
  const leverageCapacity = Math.max(0, input.equity) * leverage;
  const notionalCap = Math.min(maximumNotional, leverageCapacity);
  const notionalRiskCash = input.entry > 0
    ? notionalCap * input.riskDistance / input.entry
    : 0;
  const riskCash = Math.max(0, Math.min(configuredRiskCash, notionalRiskCash));
  const quantity = input.riskDistance > 0 ? riskCash / input.riskDistance : 0;
  const notional = quantity * input.entry;
  const initialMargin = leverage > 0 ? notional / leverage : 0;
  const tolerance = Math.max(1e-9, riskCash * 1e-10);
  const capSource: SignalPositionSizing["capSource"] =
    Math.abs(riskCash - configuredRiskCash) <= tolerance
      ? "risk-percent"
      : maximumNotional <= leverageCapacity
        ? "maximum-notional"
        : "leverage-capacity";
  return Object.freeze({
    calculationMethod: "risk-stop-notional-leverage-cap-v1",
    configuredRiskCash,
    riskCash,
    quantity,
    notional,
    initialMargin,
    notionalCap,
    capSource,
  });
}

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
    const sizing = sizeSimulatedSignalPosition({ equity, entry, riskDistance, risk });
    const { riskCash, quantity } = sizing;
    if (riskCash <= 0 || quantity <= 0) continue;
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
      target: tp2,
      positionSize: quantity,
      riskPct: risk.riskPct,
      leverage: risk.leverage,
      riskCash: sizing.riskCash,
      notional: sizing.notional,
      initialMargin: sizing.initialMargin,
      sizingMethod: sizing.calculationMethod,
      sizingCapSource: sizing.capSource,
      rMultiple: riskCash > 0 ? realised / riskCash : 0,
      pnl: realised,
      pnlPct: equityBefore > 0 ? (realised / equityBefore) * 100 : 0,
      result: realised > 0 ? "win" : realised < 0 ? "loss" : "flat",
      exitReason,
      remainingQuantity: exitReason === "MARK" ? quantity * (tp1Hit ? 0.5 : 1) : 0,
      realisedPnl: exitReason === "MARK" ? realisedBeforeMark : realised,
    });
    nextAvailableIndex = exitIndex + 1;
  }

  const completed = trades.filter((trade) => trade.exitReason !== "MARK");
  const openTrades = trades.length - completed.length;
  const grossProfit = completed
    .filter((trade) => trade.pnl > 0)
    .reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(
    completed
      .filter((trade) => trade.pnl < 0)
      .reduce((sum, trade) => sum + trade.pnl, 0),
  );
  const wins = completed.filter((trade) => trade.pnl > 0).length;
  const realisedPnl = trades.reduce((sum, trade) => sum + trade.realisedPnl, 0);
  const markedPnl = equity - initialEquity - realisedPnl;

  return {
    initialEquity,
    endingEquity: equity,
    returnPct: ((equity - initialEquity) / initialEquity) * 100,
    maxDrawdownPct,
    trades: trades.length,
    completedTrades: completed.length,
    openTrades,
    realisedPnl,
    markedPnl,
    wins,
    winRatePct: completed.length ? (wins / completed.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
    closedTrades: trades,
  };
}
