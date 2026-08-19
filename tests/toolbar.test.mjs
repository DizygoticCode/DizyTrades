import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("toolbar has direct timeframe and separate imperative chart controls", async () => {
  const source = await readFile(new URL("../app/trading-terminal.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /aria-label="More timeframes"/);
  assert.match(
    source,
    /ALL_TIMEFRAMES\.filter\(\(item\) => chartMarketSupportsTimeframe\(chartMarket, item\)\)\.map/,
  );
  assert.match(source, /aria-pressed=\{timeframe === item\}/);
  assert.match(source, /chartControls\.current\?\.resetView\(\)/);
  assert.match(source, /chartControls\.current\?\.goToLive\(\)/);
  assert.match(source, /calculateAutoFit/);
  assert.match(source, /calculateGoToLive/);
});

test("responsive toolbar has no fixed workspace viewport subtraction", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.workspace\s*\{[^}]*height:\s*calc\(100vh/s);
  assert.match(css, /\.workspace\s*\{[^}]*flex:\s*1 1 auto/s);
  assert.match(css, /\.timeframes[^}]*overflow-x:\s*auto/s);
});
