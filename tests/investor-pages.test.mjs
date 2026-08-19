import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { showSharedProductNavigation } from "../app/lib/product-navigation.ts";

const investors = await readFile(new URL("../app/investors/page.tsx", import.meta.url), "utf8");
const businessPlan = await readFile(new URL("../app/business-plan/page.tsx", import.meta.url), "utf8");
const header = await readFile(new URL("../app/marketing/site-header.tsx", import.meta.url), "utf8");
const investorStyles = await readFile(new URL("../app/investors/investors.module.css", import.meta.url), "utf8");

const INVESTOR_EMAIL = "dizytrades+investor@gmail.com";

test("investor page leads with the project pitch and the requested actions", () => {
  assert.match(investors, /A trading platform built around/);
  assert.match(investors, /process you can inspect/);
  assert.match(investors, /href="\/business-plan"/);
  assert.match(investors, /href="\/contact"/);
  assert.ok(investors.includes(INVESTOR_EMAIL));
  assert.match(investors, /DizyTrades investor enquiry/);
});

test("business plan is substantive and does not invent achieved traction", () => {
  assert.match(businessPlan, /01 · EXECUTIVE SUMMARY/);
  assert.match(businessPlan, /06 · BUSINESS MODEL/);
  assert.match(businessPlan, /07 · GO-TO-MARKET/);
  assert.match(businessPlan, /11 · KEY RISKS/);
  assert.match(businessPlan, /12 · MILESTONES \+ FINANCIAL FRAMEWORK/);
  assert.match(businessPlan, /No user-count, market-share or traction figure is claimed here/);
  assert.match(businessPlan, /hypothetical revenue as achieved traction/);
  assert.ok(businessPlan.includes(INVESTOR_EMAIL));
});

test("investor-facing infrastructure terminology stays professional", () => {
  assert.doesNotMatch(investors, /Server Club/i);
  assert.doesNotMatch(businessPlan, /Server Club/i);
  assert.match(investors, /dedicated self-hosted production infrastructure/);
  assert.match(businessPlan, /dedicated self-hosted production infrastructure/);
});

test("DIZY and fundraising language stay non-promissory", () => {
  for (const source of [investors, businessPlan]) {
    assert.match(source, /does not represent (?:ownership, equity|equity, ownership)/);
    assert.match(source, /not an offer to sell/);
  }
  assert.match(businessPlan, /does not provide equity, revenue share, yield, governance rights or a promise of price appreciation/);
});

test("investor pages use public marketing chrome and are discoverable in the public header", () => {
  assert.equal(showSharedProductNavigation("/investors"), false);
  assert.equal(showSharedProductNavigation("/business-plan"), false);
  assert.equal(showSharedProductNavigation("/business-plan/appendix"), false);
  assert.match(header, /href="\/investors"/);
  assert.match(header, />Investors<\/Link>/);
  assert.match(investorStyles, /@media \(max-width: 640px\)/);
});
