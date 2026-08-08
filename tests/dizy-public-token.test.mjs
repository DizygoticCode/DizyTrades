import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const MINT = "J9Bevbd4BS23cjoWbKazG1LGwRsAhr2iRQq6uo31BEaY";
const WHITEPAPER_ID = "8mV7TWV5P7nqDim6YJJ2akP3HA8Fe6bUyTu1ivxu39QG";
const WHITEPAPER_SHA256 = "828327f13c8024fe1d0905e19eddfb36eb820921acafc2f99134fba0c8809139";

const [page, header] = await Promise.all([
  source("app/dizy/page.tsx"),
  source("app/marketing/site-header.tsx"),
]);

test("public DIZY page pins canonical identity and permanent whitepaper", () => {
  assert.match(page, new RegExp(MINT));
  assert.match(page, new RegExp(WHITEPAPER_ID));
  assert.match(page, new RegExp(WHITEPAPER_SHA256));
  assert.match(page, /1,000,000/);
  assert.match(page, /MINT AUTHORITY[\s\S]*Revoked/);
  assert.match(page, /FREEZE AUTHORITY[\s\S]*Revoked/);
  assert.match(page, /DizyCoin[\s\S]*nickname/);
});

test("DIZY page does not invent investment or market guarantees", () => {
  assert.match(page, /does not represent ownership of DizyTrades/);
  assert.match(page, /does not promise price appreciation, returns, yield, project revenue or governance rights/);
  assert.match(page, /does not currently claim active liquidity, an exchange listing or a guaranteed market/);
  assert.match(page, /does not determine DIZY&apos;s regulatory classification/);
});

test("public navigation exposes DIZY without changing the product login boundary", () => {
  assert.match(header, /href="\/dizy"[\s\S]*>DIZY<\/Link>/);
  assert.match(header, /href="\/login"/);
  assert.match(header, /href="\/signup"/);
});
