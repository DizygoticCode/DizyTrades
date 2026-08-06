import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  activeDizyProduct,
  DIZY_PRODUCT_LINKS,
  MEXC_REFERRAL_CODE,
  MEXC_REFERRAL_URL,
  showSharedProductNavigation,
  TERMINAL_COMPANION_LINKS,
} from "../app/lib/product-navigation.ts";

const expectedDestinations = [
  "/terminal",
  "/school",
  "/terminal#dizybrain",
  "/research",
  "/account",
  "/scanner",
  "/structure",
  "/performance",
  "/journal",
  "/backup",
  "/diagnostics",
  "/dex",
];

test("shared product navigation exposes each current standalone destination once", () => {
  assert.deepEqual(DIZY_PRODUCT_LINKS.map((product) => product.href), expectedDestinations);
  assert.equal(new Set(DIZY_PRODUCT_LINKS.map((product) => product.id)).size, DIZY_PRODUCT_LINKS.length);
});

test("nested product pages retain their relevant active product", () => {
  assert.equal(activeDizyProduct("/scanner"), "scanner");
  assert.equal(activeDizyProduct("/account/control"), "account");
  assert.equal(activeDizyProduct("/school/lessons/order-flow"), "academy");
  assert.equal(activeDizyProduct("/explore"), "charts");
  assert.equal(activeDizyProduct("/"), null);
});

test("the shared strip avoids auth pages and the terminal's specialised toolbar", () => {
  assert.equal(showSharedProductNavigation("/"), true);
  assert.equal(showSharedProductNavigation("/scanner"), true);
  assert.equal(showSharedProductNavigation("/login"), false);
  assert.equal(showSharedProductNavigation("/signup"), false);
  assert.equal(showSharedProductNavigation("/terminal"), false);
});

test("terminal companion destinations come from the same central registry", () => {
  assert.deepEqual(
    TERMINAL_COMPANION_LINKS.map((product) => product.id),
    ["quant", "account", "scanner", "structure", "performance", "journal", "backup", "ops", "dex"],
  );
});

test("MEXC referral CTA is explicit, optional and safely opens a new tab", async () => {
  assert.equal(MEXC_REFERRAL_URL, "https://s.mexc.com/referral/zIGtvsj603");
  assert.equal(MEXC_REFERRAL_CODE, "12CDEd");
  const source = await readFile(new URL("../app/mexc-referral-link.tsx", import.meta.url), "utf8");
  assert.match(source, /Need a broker\?/);
  assert.match(source, /Referral/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer sponsored"/);
});

test("root layout mounts one shared navigation component", async () => {
  const source = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/<ProductNavigation \/>/g) ?? []).length, 1);
});
