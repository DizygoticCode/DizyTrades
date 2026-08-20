import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  activeDizyProduct,
  DIZY_PRODUCT_LINKS,
  MEXC_REFERRAL_CODE,
  MEXC_REFERRAL_URL,
  showSharedProductNavigation,
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
  "/dizy",
];

test("shared product navigation exposes each current standalone destination once", () => {
  assert.deepEqual(DIZY_PRODUCT_LINKS.map((product) => product.href), expectedDestinations);
  assert.equal(new Set(DIZY_PRODUCT_LINKS.map((product) => product.id)).size, DIZY_PRODUCT_LINKS.length);
});

test("nested product pages retain their relevant active product", () => {
  assert.equal(activeDizyProduct("/terminal"), "charts");
  assert.equal(activeDizyProduct("/scanner"), "scanner");
  assert.equal(activeDizyProduct("/account/control"), "account");
  assert.equal(activeDizyProduct("/school/lessons/order-flow"), "academy");
  assert.equal(activeDizyProduct("/dizy"), "dizy");
  assert.equal(activeDizyProduct("/explore"), "charts");
  assert.equal(activeDizyProduct("/"), null);
});

test("the shared product strip stays on workspace routes while public home owns its marketing chrome", () => {
  assert.equal(showSharedProductNavigation("/"), false);
  assert.equal(showSharedProductNavigation("/scanner"), true);
  assert.equal(showSharedProductNavigation("/terminal"), true);
  assert.equal(showSharedProductNavigation("/terminal/settings"), true);
  assert.equal(showSharedProductNavigation("/login"), false);
  assert.equal(showSharedProductNavigation("/signup"), false);
});

test("terminal uses the shared strip without obsolete duplicate product shortcuts", async () => {
  const terminalSource = await readFile(new URL("../app/terminal/page.tsx", import.meta.url), "utf8");
  const navigationSource = await readFile(new URL("../app/product-navigation.tsx", import.meta.url), "utf8");
  const navigationStyles = await readFile(new URL("../app/product-navigation.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(terminalSource, /DizyBrainTopbarLink/);
  assert.match(navigationSource, /opensTerminalBrain/);
  assert.match(navigationSource, /\.dizybrain-launch/);
  assert.match(
    navigationStyles,
    /height: calc\(100dvh - var\(--dizy-product-nav-height\)\)/,
  );
  assert.match(
    navigationStyles,
    /@media \(max-width: 760px\)[\s\S]*--dizy-product-nav-height: 76px;/,
  );
  assert.match(navigationStyles, /\.school-terminal-link\)[\s\S]*display: none !important/);
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