import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Account Companion page authorises the owner before any private refresh", async () => {
  const source = await readFile("app/account/page.tsx", "utf8");

  assert.doesNotMatch(source, /^\s*["']use client["'];/m);
  assert.match(source, /const user = await requireUser\(\)/);
  assert.match(source, /if \(user\.role !== "owner"\) redirect\("\/terminal"\)/);
  assert.match(source, /await refreshOwnerMexcAccountSnapshot\(\)/);
  assert.ok(
    source.indexOf('user.role !== "owner"') <
      source.indexOf("refreshOwnerMexcAccountSnapshot()"),
  );
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /export const revalidate = 0/);
});

test("Account Companion page renders safe status, balance and position fields", async () => {
  const source = await readFile("app/account/page.tsx", "utf8");

  for (const text of [
    "DizyAccount Companion",
    "Balances",
    "Positions",
    "availableBalance",
    "positionMargin",
    "unrealizedPnl",
    "holdVolume",
    "liquidationPrice",
    "initialMargin",
    "realisedPnl",
  ]) {
    assert.match(source, new RegExp(text));
  }
  assert.match(source, /Write permission requested: no/);
  assert.match(source, /No key, secret, signature or signed request material/);
  assert.doesNotMatch(
    source,
    /OWNER_MEXC_READONLY_API_KEY|OWNER_MEXC_READONLY_API_SECRET|createHmac|\bApiKey\b|\bSignature\b/,
  );
  assert.doesNotMatch(source, /mexc-private-readonly/);
});

test("terminal exposes DizyAccount only through an owner-derived flag", async () => {
  const [topbar, terminal] = await Promise.all([
    readFile("app/dizybrain-topbar-link.tsx", "utf8"),
    readFile("app/terminal/page.tsx", "utf8"),
  ]);

  assert.match(topbar, /showAccountCompanion = false/);
  assert.match(topbar, /\{showAccountCompanion \? \(/);
  assert.match(topbar, /href="\/account"/);
  assert.match(topbar, />◉ DizyAccount<\/a>/);
  assert.match(
    terminal,
    /showAccountCompanion=\{user\.role === "owner"\}/,
  );
  assert.doesNotMatch(topbar, /mexc-owner-account-snapshot|mexc-private-readonly/);
});
