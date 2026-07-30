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
  assert.match(browser, /MEXC Markets","DizyDEX/);
  assert.match(browser, /market-browser-source-tabs/);
  assert.match(browser, /Search MEXC symbol or asset…/);
  assert.match(browser, /Search token, contract, mint or pool…/);
});

test("market browser reserves its flexible region for aligned results", () => {
  assert.match(browser, /market-browser-column-header/);
  assert.match(browser, /market-browser-result-row/);
  assert.match(browser, /Quote asset/);
  assert.match(browser, /All quotes/);
  assert.match(styles, /width:min\(720px,calc\(100vw - 24px\)\)/);
  assert.match(styles, /height:min\(720px,calc\(100vh - 40px\)\)/);
  assert.match(styles, /grid-template-rows:auto auto minmax\(300px,1fr\) auto/);
  assert.match(styles, /\.market-browser-results\{min-height:0;overflow-y:auto/);
  assert.match(styles, /\.market-browser-result-row\{min-height:54px/);
});

test("compact controls cannot inherit full-width button styling", () => {
  assert.match(styles, /market-browser-source-tabs\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(styles, /market-browser-primary-tabs,.market-browser-instrument-tabs\{display:flex/);
  assert.match(styles, /market-browser-filter-chip,.filters-toggle\{width:auto;flex:0 0 auto/);
  assert.match(styles, /market-browser-primary-tabs::-webkit-scrollbar/);
});

test("market browser retains DEX rows on provider degradation", () => {
  const catchBody = browser.slice(browser.indexOf("catch(error)"), browser.indexOf("finally", browser.indexOf("catch(error)")));
  assert.doesNotMatch(catchBody, /setDexItems/);
  assert.match(browser, /Cached results remain available/);
  assert.match(browser, /DEX data degraded/);
});

test("favorites, selected rows, Escape closing, filters and responsive sheet remain explicit", () => {
  assert.match(browser, /event\.key==="Escape"/);
  assert.match(browser, /aria-selected=\{active\}/);
  assert.match(browser, /onFavourite/);
  assert.match(browser, /Minimum liquidity/);
  assert.match(styles, /@media\(max-width:640px\)\{\.market-browser/);
  assert.match(styles, /width:calc\(100vw - 16px\)/);
});
