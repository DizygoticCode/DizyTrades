import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [page, card, marketRoute, logoRoute, tokenConfig] = await Promise.all([
  source("app/dizy/page.tsx"),
  source("app/dizy/DizyMarketCard.tsx"),
  source("app/api/dizy/market/route.ts"),
  source("app/api/dizy/logo/route.ts"),
  source("app/dizy/token-config.ts"),
]);

test("DIZY hero uses the same-origin token logo route", () => {
  assert.match(page, /src="\/api\/dizy\/logo"/);
  assert.doesNotMatch(page, /backgroundImage:\s*`url\(\$\{TOKEN_LOGO_URL\}\)`/);
  assert.match(logoRoute, /DIZY_TOKEN_LOGO_URL/);
  assert.match(logoRoute, /startsWith\("image\/"\)/);
  assert.match(logoRoute, /MAX_LOGO_BYTES/);
  assert.doesNotMatch(logoRoute, /export async function POST/);
});

test("DIZY live-market section renders a bounded public price card", () => {
  assert.match(page, /<DizyMarketCard \/>/);
  assert.match(card, /fetch\("\/api\/dizy\/market"/);
  assert.match(card, /REFRESH_MS = 60_000/);
  assert.match(card, /DIZY \/ USD/);
  assert.match(card, /24 hour price/);
  assert.match(card, /aria-label="DIZY 24 hour USD price chart"/);
});

test("DIZY market route uses the canonical mint and Raydium pool without an order surface", () => {
  assert.match(tokenConfig, /J9Bevbd4BS23cjoWbKazG1LGwRsAhr2iRQq6uo31BEaY/);
  assert.match(tokenConfig, /2mH8umwN2FfEx23bzTUuTXjQZ5G9rLNuJ2VWEkgynowA/);
  assert.match(marketRoute, /simple\/networks\/solana\/token_price/);
  assert.match(marketRoute, /ohlcv\/hour/);
  assert.match(marketRoute, /token: DIZY_MINT/);
  assert.match(marketRoute, /next: \{ revalidate: 60 \}/);
  assert.match(marketRoute, /export async function GET/);
  assert.doesNotMatch(marketRoute, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(marketRoute, /order|execute|LIVE_TRADING_ENABLED/);
});
