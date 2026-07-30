import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { geckoUrl } from "../app/lib/dex/providers.ts";

const browser = await readFile(new URL("../app/market-browser.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("GeckoTerminal URLs preserve the documented API v2 path", () => {
  assert.equal(geckoUrl("networks/solana/pools").pathname, "/api/v2/networks/solana/pools");
  assert.equal(geckoUrl("/networks/bsc/pools/address/ohlcv/minute").pathname, "/api/v2/networks/bsc/pools/address/ohlcv/minute");
});

test("market browser exposes one source switch and source-aware searches", () => {
  assert.match(browser, /items=\{\["MEXC", "DizyDEX"\]\}/);
  assert.match(browser, /market-browser-source-tabs/);
  assert.match(browser, /Search symbol or asset…/);
  assert.match(browser, /Search token, mint, contract or pool…/);
});

test("market browser reserves its flexible region for aligned results", () => {
  assert.match(browser, /market-browser-column-header/);
  assert.match(browser, /market-browser-result-row/);
  assert.match(browser, /Quote asset/);
  assert.match(browser, /All quotes/);
  assert.match(styles, /width: min\(520px, calc\(100vw - 24px\)\)/);
  assert.match(styles, /height: min\(590px, calc\(100vh - 80px\)\)/);
  assert.match(styles, /grid-template-rows: 44px auto minmax\(320px, 1fr\) auto/);
  assert.match(styles, /\.market-browser-results \{[\s\S]*?min-height: 320px;[\s\S]*?overflow-y: auto/);
  assert.match(styles, /\.market-browser-result-row \{[\s\S]*?height: 50px;[\s\S]*?min-height: 50px/);
  assert.doesNotMatch(styles, /width: min\(7[0-9]{2}px/);
});

test("compact controls cannot inherit full-width button styling", () => {
  assert.match(styles, /\.market-browser-source-tabs \{[\s\S]*?display: flex;[\s\S]*?flex: 0 0 auto/);
  assert.match(styles, /\.market-browser-primary-tabs \{[\s\S]*?display: flex/);
  assert.match(styles, /\.filters-toggle \{[\s\S]*?width: auto;[\s\S]*?flex: 0 0 auto/);
  assert.match(styles, /market-browser-primary-tabs::-webkit-scrollbar/);
});

test("market browser retains DEX rows on provider degradation", () => {
  const catchBody = browser.slice(browser.indexOf("catch(error)"), browser.indexOf("finally", browser.indexOf("catch(error)")));
  assert.doesNotMatch(catchBody, /setDexItems/);
  assert.match(browser, /Cached results available/);
  assert.match(browser, /⚠ Degraded/);
});

test("favorites, selected rows, Escape closing, filters and responsive sheet remain explicit", () => {
  assert.match(browser, /event\.key === "Escape"/);
  assert.match(browser, /aria-selected=\{active\}/);
  assert.match(browser, /onFavourite/);
  assert.match(browser, /Minimum liquidity/);
  assert.match(styles, /@media \(max-width: 560px\)/);
  assert.match(styles, /width: calc\(100vw - 16px\)/);
});
