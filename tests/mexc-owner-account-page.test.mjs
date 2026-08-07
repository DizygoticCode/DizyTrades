import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Account Companion page authorises the owner before any private refresh", async () => {
  const source = await readFile("app/account/page.tsx", "utf8");

  assert.doesNotMatch(source, /^\s*["']use client["'];/m);
  assert.match(source, /const user = await requireUser\(\)/);
  assert.match(source, /if \(user\.role !== "owner"\) redirect\("\/terminal"\)/);
  assert.match(source, /await refreshOwnerMexcAccountCompanion\(\)/);
  const authorisationIndex = source.indexOf('user.role !== "owner"');
  const refreshIndex = source.indexOf("refreshOwnerMexcAccountCompanion()");
  assert.ok(authorisationIndex >= 0 && refreshIndex > authorisationIndex);
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /export const revalidate = 0/);
});

test("Account Companion page renders safe account and provider risk context", async () => {
  const source = await readFile("app/account/page.tsx", "utf8");

  for (const text of [
    "DizyAccount Companion",
    "Balances",
    "Positions",
    "Risk limits",
    "availableBalance",
    "positionMargin",
    "unrealizedPnl",
    "holdVolume",
    "liquidationPrice",
    "initialMargin",
    "realisedPnl",
    "maxLeverage",
    "maxVolume",
    "maintenanceMarginRate",
    "initialMarginRate",
    "attentionReasons",
  ]) {
    assert.match(source, new RegExp(text));
  }
  assert.match(source, /Write permission requested: no/);
  assert.match(source, /Provider risk context is not a liquidation oracle/);
  assert.match(source, /No key, secret, signature or signed request material/);
  assert.doesNotMatch(
    source,
    /OWNER_MEXC_READONLY_API_KEY|OWNER_MEXC_READONLY_API_SECRET|createHmac|\bApiKey\b|\bSignature\b/,
  );
  assert.doesNotMatch(source, /mexc-private-readonly/);
});

test("shared navigation exposes DizyAccount while the Account Companion page remains owner-gated", async () => {
  const [navigation, accountPage] = await Promise.all([
    readFile("app/lib/product-navigation.ts", "utf8"),
    readFile("app/account/page.tsx", "utf8"),
  ]);

  assert.match(navigation, /id: "account"/);
  assert.match(navigation, /label: "DizyAccount"/);
  assert.match(navigation, /icon: "◉"/);
  assert.match(navigation, /href: "\/account"/);
  assert.match(navigation, /Open the owner-only read-only MEXC Account Companion/);
  assert.match(accountPage, /const user = await requireUser\(\)/);
  assert.match(accountPage, /if \(user\.role !== "owner"\) redirect\("\/terminal"\)/);
  assert.doesNotMatch(
    navigation,
    /mexc-owner-account-(?:snapshot|companion)|mexc-private-readonly/,
  );
});
