import assert from "node:assert/strict";
import test from "node:test";
import { MEXC_INTERVALS } from "../app/lib/market/mexc-shared.ts";
import { StableClockOffset, calculateExchangeAlignedCountdownSeconds, applyDealToLiveCandle, applyKlineUpdate, defaultVisibleCandleCount, formatCountdown, mergeClosedCandles, nextCandleCloseTimestamp, parseMexcDeals, parseMexcKline } from "../app/lib/market/realtime.ts";

const candle = { time: 100, open: 10, high: 12, low: 9, close: 11, volume: 5 };
test("shared intervals distinguish minutes and months", () => { assert.equal(MEXC_INTERVALS["1m"].api, "Min1"); assert.equal(MEXC_INTERVALS["1M"].api, "Month1"); });
test("parses valid current kline and rejects stale/malformed data", () => {
  const message = { channel: "push.kline", data: { symbol: "BTC_USDT", interval: "Min15", t: 100, o: "10", h: "12", l: "9", c: "11", q: "5" } };
  assert.deepEqual(parseMexcKline(message, "BTC_USDT", "15m"), { ...candle, symbol: "BTC_USDT", interval: "Min15" });
  assert.equal(parseMexcKline(message, "ETH_USDT", "15m"), null);
  assert.equal(parseMexcKline(message, "BTC_USDT", "1m"), null);
  assert.equal(parseMexcKline({ ...message, data: { ...message.data, c: "Infinity" } }, "BTC_USDT", "15m"), null);
});
test("same candle replaces and newer candle rolls exactly once", () => {
  const same = { ...candle, close: 11.5 }; const replaced = applyKlineUpdate([], candle, same); assert.equal(replaced.rolled, false); assert.equal(replaced.live.close, 11.5);
  const newer = { ...candle, time: 200 }; const rolled = applyKlineUpdate([], candle, newer); assert.equal(rolled.rolled, true); assert.deepEqual(rolled.closed, [candle]);
  assert.deepEqual(applyKlineUpdate(rolled.closed, candle, newer).closed, [candle]);
});
test("closed candle merge sorts, deduplicates, and caps", () => { assert.deepEqual(mergeClosedCandles([{ ...candle, close: 10 }], [candle]), [candle]); assert.equal(mergeClosedCandles([candle], [{ ...candle, time: 200 }], 1)[0].time, 200); });
test("deal smooths prices without changing authoritative volume", () => {
  const currentCandle={...candle,time:1700000000},dealMessage = { channel: "push.deal", symbol: "BTC_USDT", data: { p: "13", t: "1700000010", v: "2" } };
  const deal = parseMexcDeals(dealMessage, "BTC_USDT")[0]; const updated = applyDealToLiveCandle(currentCandle, deal, "1m"); assert.equal(updated.close, 13); assert.equal(updated.high, 13); assert.equal(updated.volume, 5);
  assert.deepEqual(parseMexcDeals(dealMessage, "ETH_USDT"), []);
});
test("countdown formatting and responsive viewport clamps", () => { assert.equal(formatCountdown(754), "12:34"); assert.equal(formatCountdown(3754), "01:02:34"); assert.equal(formatCountdown(0), "Closing…"); assert.equal(defaultVisibleCandleCount(200, 800), 80); assert.equal(defaultVisibleCandleCount(2000, 800), 180); assert.equal(defaultVisibleCandleCount(1200, 40), 40); });
test("UTC month boundaries handle leap years and year rollover", () => {
  const jan = Date.UTC(2024, 0, 1) / 1000; assert.equal(nextCandleCloseTimestamp(jan, "1M"), Date.UTC(2024, 1, 1) / 1000);
  const feb = Date.UTC(2024, 1, 1) / 1000; assert.equal(nextCandleCloseTimestamp(feb, "1M"), Date.UTC(2024, 2, 1) / 1000); assert.equal((nextCandleCloseTimestamp(feb, "1M") - feb) / 86400, 29);
  const dec = Date.UTC(2024, 11, 1) / 1000; assert.equal(nextCandleCloseTimestamp(dec, "1M"), Date.UTC(2025, 0, 1) / 1000);
});
import { sanitiseTerminalSettings } from "../app/lib/config.ts";
test("old settings profiles gain real-time visual defaults", () => { const migrated = sanitiseTerminalSettings({ view: { supportResistance: false } }); assert.equal(migrated.view.supportResistance, false); assert.equal(migrated.view.realtimeChartUpdates, true); assert.equal(migrated.view.candleCountdown, true); assert.equal(migrated.view.autoFitOnMarketChange, true); });

import { calculateCandleCountdownSeconds, startAlignedSecondClock, updatePriceLineCountdownTitle } from "../app/lib/market/realtime.ts";

test("countdown uses client seconds and server offset without depending on price", () => {
  const base = Date.UTC(2026, 6, 25, 12, 0, 0);
  const input = { candleStart: base / 1000, timeframe: "1m", clockOffsetMs: 2_000 };
  assert.equal(calculateCandleCountdownSeconds({ ...input, clientNowMs: base + 10_000 }), 48);
  assert.equal(calculateCandleCountdownSeconds({ ...input, clientNowMs: base + 11_000 }), 47);
  assert.equal(calculateCandleCountdownSeconds({ ...input, clientNowMs: base + 90_000 }), 0);
});

test("countdown calculation preserves calendar month rollover", () => {
  const start = Date.UTC(2024, 1, 1);
  assert.equal(calculateCandleCountdownSeconds({ candleStart: start / 1000, timeframe: "1M", clientNowMs: Date.UTC(2024, 1, 29, 23, 59, 59), clockOffsetMs: 0 }), 1);
});

test("aligned clock is independent of price updates and recalculates on visibility", () => {
  let now = 1_250, callback, delay, listener;
  const ticks = [];
  const document = { visibilityState: "visible", addEventListener: (_name, fn) => { listener = fn; }, removeEventListener: () => {} };
  const stop = startAlignedSecondClock({ now: () => now, schedule: (fn, ms) => { callback = fn; delay = ms; return 1; }, cancel: () => {}, document, onTick: value => ticks.push(value) });
  assert.deepEqual(ticks, [1_250]);
  assert.equal(delay, 750);
  // Arbitrarily many market-price updates have no scheduler input and cannot reset it.
  callback();
  assert.deepEqual(ticks, [1_250, 1_250]);
  now = 8_900;
  listener();
  assert.equal(ticks.at(-1), 8_900);
  assert.equal(delay, 100);
  stop();
});

test("price-line title updater runs when only countdown seconds change", () => {
  const titles = [];
  const line = { applyOptions: options => titles.push(options.title) };
  updatePriceLineCountdownTitle(line, 12, true);
  updatePriceLineCountdownTitle(line, 11, true);
  assert.deepEqual(titles, ["⏱ 00:12", "⏱ 00:11"]);
});

test("exchange aligned countdown rolls without a candle update",()=>{assert.equal(calculateExchangeAlignedCountdownSeconds({timeframe:"1m",clientNowMs:59_000,clockOffsetMs:0}),1);assert.equal(calculateExchangeAlignedCountdownSeconds({timeframe:"1m",clientNowMs:60_000,clockOffsetMs:0}),60);});
test("stable clock rejects outliers and rate-limits a sustained correction",()=>{const clock=new StableClockOffset();assert.equal(clock.add(10_100,10_000),100);clock.add(11_100,11_000);clock.add(12_100,12_000);assert.equal(clock.add(99_000,13_000),100);assert.equal(clock.add(13_900,13_000),100);clock.add(14_900,14_000);assert.equal(clock.add(15_900,15_000),350);assert.equal(clock.add(16_900,16_000),600);});
