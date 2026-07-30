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

test("market browser exposes unified navigation and source-aware searches", () => {
  assert.match(browser, /"Favorites", "Spot", "Futures", "DizyDEX", "Movers"/);
  assert.doesNotMatch(browser, /market-browser-source-tabs/);
  assert.match(browser, /Search symbol, asset or contract…/);
  assert.match(browser, /Search token, mint, contract or pool…/);
});

test("market browser reserves its flexible region for aligned results", () => {
  assert.match(browser, /mb-columns/);
  assert.match(browser, /mb-row/);
  assert.match(styles, /width:420px;height:520px/);
  assert.match(styles, /grid-template-rows:38px 38px 30px 28px 24px minmax\(0,1fr\)/);
  assert.match(styles, /\.mb-results\{[\s\S]*?overflow-y:auto/);
  assert.match(styles, /\.mb-row\{[\s\S]*?height:46px;min-height:46px/);
  assert.match(styles, /grid-template-columns:minmax\(0,1fr\) 70px 56px 48px/);
});

test("compact controls and rows are collision-proof by construction", () => {
  assert.match(styles, /\.mb-primary,.mb-secondary-tabs\{display:flex;min-width:0/);
  assert.match(styles, /\.mb-identity strong>span,.mb-identity small\{overflow:hidden;text-overflow:ellipsis;white-space:nowrap/);
  assert.match(styles, /\.mb-number,.mb-change,.mb-volume\{min-width:0;overflow:hidden;text-align:right/);
  assert.doesNotMatch(styles, /\.mb-row\{[^}]*position:absolute/);
});

test("market browser retains DEX rows on provider degradation", () => {
  const catchBody = browser.slice(browser.indexOf("catch(error)"), browser.indexOf("finally", browser.indexOf("catch(error)")));
  assert.doesNotMatch(catchBody, /setDexItems/);
  assert.match(browser, /Cached results unavailable/);
  assert.match(browser, /⚠ Degraded/);
});

test("favorites, selected rows, Escape closing, filters and responsive sheet remain explicit", () => {
  assert.match(browser, /event\.key === "Escape"/);
  assert.match(browser, /aria-selected=\{selected\}/);
  assert.match(browser, /onFavourite/);
  assert.match(browser, /Minimum liquidity/);
  assert.match(styles, /@media\(max-width:520px\)/);
  assert.match(styles, /width:calc\(100vw - 12px\)/);
  assert.match(styles, /height:min\(540px,calc\(100dvh - 24px\)\)/);
});
