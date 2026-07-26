import assert from "node:assert/strict";
import test from "node:test";
import { buildDisplayTimeline, marketTimelineReducer } from "../app/lib/market/timeline.ts";
import { planSeriesSync } from "../app/lib/chart/series-sync.ts";
import { formatSignedMoney, livePaperSnapshot } from "../app/lib/paper-performance.ts";

const candle = (time, close = time) => ({ time, open: close, high: close, low: close, close, volume: 1 });
const reduce = (state, action) => marketTimelineReducer(state, { marketKey: "BTC_USDT:1m", ...action });

class StrictSeries {
  data = [];
  setData(data) { this.data = [...data]; }
  update(point) {
    if (point.time < (this.data.at(-1)?.time ?? -Infinity)) throw new Error(`Cannot update oldest data, last time=${this.data.at(-1).time}, new time=${point.time}`);
    const index = this.data.findIndex(item => item.time === point.time);
    if (index >= 0) this.data[index] = point; else this.data.push(point);
  }
}

test("atomic rollover survives delayed REST, corrections, duplicates, and old messages", () => {
  let state = { marketKey: "BTC_USDT:1m", closed: Array.from({ length: 800 }, (_, index) => candle(index + 1)), live: candle(801), lastPrice: 801, rolloverSequence: 0 };
  let display = buildDisplayTimeline(state.closed, state.live);
  const series = new StrictSeries(); series.setData(display);

  state = reduce(state, { type: "kline", candle: candle(802) });
  let next = buildDisplayTimeline(state.closed, state.live);
  let plan = planSeriesSync(display, next); assert.equal(plan.operation, "setData"); series.setData(plan.data);
  assert.equal(state.rolloverSequence, 1);
  assert.equal(state.closed.filter(item => item.time === 801).length, 1);
  display = next;

  state = reduce(state, { type: "reconcileClosed", closed: Array.from({ length: 800 }, (_, index) => candle(index + 1)) });
  assert.equal(state.live.time, 802);
  state = reduce(state, { type: "reconcileClosed", closed: [candle(799, 99)] });
  next = buildDisplayTimeline(state.closed, state.live);
  plan = planSeriesSync(display, next); assert.equal(plan.operation, "setData"); assert.equal(plan.data.at(-1).time, 802); series.setData(plan.data); display = next;

  state = reduce(state, { type: "kline", candle: candle(802, 803) });
  next = buildDisplayTimeline(state.closed, state.live); plan = planSeriesSync(display, next); assert.equal(plan.operation, "update"); series.update(plan.point); display = next;
  const duplicate = reduce(state, { type: "kline", candle: candle(802, 804) });
  assert.equal(duplicate.rolloverSequence, 1); assert.equal(duplicate.live.close, 804);
  const old = reduce(duplicate, { type: "kline", candle: candle(801, 1) });
  assert.deepEqual(old, duplicate);
  assert.deepEqual(buildDisplayTimeline(old.closed, old.live).map(item => item.time), [...new Set(buildDisplayTimeline(old.closed, old.live).map(item => item.time))]);
});

test("rapid rollover sync never sends an older update to a strict series", () => {
  let state = { marketKey: "BTC_USDT:1m", closed: [candle(800)], live: candle(801), lastPrice: 801, rolloverSequence: 0 };
  const series = new StrictSeries(); let plotted = buildDisplayTimeline(state.closed, state.live); series.setData(plotted);
  for (const action of [
    { type: "kline", candle: candle(801, 2) }, { type: "kline", candle: candle(802) },
    { type: "deal", deal: { symbol: "BTC_USDT", price: 3, timeMs: 802_500, volume: 1 }, timeframe: "1m" },
    { type: "reconcileClosed", closed: [candle(800, 4)] }, { type: "kline", candle: candle(803) },
  ]) {
    state = reduce(state, action); const next = buildDisplayTimeline(state.closed, state.live); const plan = planSeriesSync(plotted, next);
    if (plan.operation === "update") series.update(plan.point); else if (plan.operation === "setData") series.setData(plan.data);
    plotted = next;
  }
  assert.equal(series.data.at(-1).time, 803); assert.equal(state.rolloverSequence, 2);
});

test("paper formatting and malformed MTM values are safe", () => {
  assert.equal(formatSignedMoney(Number.NaN), "—");
  const confirmed = { initialEquity: 100, endingEquity: 100, returnPct: 0, trades: 0, wins: 0, losses: 0, winRatePct: 0, maxDrawdownPct: 0, profitFactor: null, closedTrades: [] };
  assert.doesNotThrow(() => livePaperSnapshot(confirmed, Number.NaN, true));
});

test("chart recovery boundary exposes the requested local recovery copy", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../app/chart-error-boundary.tsx", import.meta.url), "utf8"));
  assert.match(source, /Chart encountered an update error\./); assert.match(source, /Reload chart/);
});
