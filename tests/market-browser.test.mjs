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
  assert.match(browser, /source==="mexc"\?<><Chips/);
  assert.match(browser, /Search MEXC symbol or asset…/);
  assert.match(browser, /Search token, contract, mint or pool…/);
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
  assert.match(styles, /@media\(max-width:760px\)\{\.market-browser/);
  assert.match(styles, /\.browser-chips\{display:flex;flex-wrap:wrap/);
});
