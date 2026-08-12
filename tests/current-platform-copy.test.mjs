import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [readme, roadmap, homepage, metadata, research] = await Promise.all([
  source("README.md"),
  source("ROADMAP.md"),
  source("app/marketing/marketing-page.tsx"),
  source("app/page.tsx"),
  source("app/research/page.tsx"),
]);

test("README reflects the completed account, heatmap and pending-order programmes", () => {
  assert.match(readme, /### DizyAccount/);
  assert.match(readme, /DizyAccount is the owner-only, server-side, GET-only MEXC Futures account companion/i);
  assert.match(readme, /advanced order simulator adds futures LIMIT\/GTC\/IOC\/FOK\/post-only/i);
  assert.match(readme, /retained-liquidity heatmap history/i);
  assert.doesNotMatch(readme, /\[ \] server-side read-only MEXC Account Companion/);
  assert.doesNotMatch(readme, /\[ \] customer-facing liquidity heatmap presentation/);
  assert.doesNotMatch(readme, /DizyPerformance, Behaviour, DizyOps and Backup\/Recovery lessons/);
});

test("roadmap follows the agreed programme order", () => {
  const polish = roadmap.indexOf("Optional evidence-led polish");
  const housekeeping = roadmap.indexOf("Ongoing maintenance — supported stack, not dependency churn");
  const execution = roadmap.indexOf("Final major programme — guarded execution readiness");
  assert.ok(polish >= 0 && housekeeping > polish && execution > housekeeping);
  assert.match(roadmap, /first bounded representative campaign closed for the current roadmap/);
  assert.match(roadmap, /Read-only MEXC Account Companion and shadow reconciliation — complete/);
  assert.match(roadmap, /Liquidity heatmap presentation and DizyFlow evidence quality — complete for the current beta/);
});

test("public homepage describes the actual private-access boundary", () => {
  assert.match(homepage, /DizyAccount/);
  assert.match(homepage, /PRIVATE MEXC ACCESS/);
  assert.match(homepage, /Owner-only \/ read only/);
  assert.match(homepage, /server-side owner credentials/);
  assert.match(homepage, /advanced futures\/spot pending orders/);
  assert.doesNotMatch(homepage, /CREDENTIALS[\s\S]*Never requested/);
  assert.doesNotMatch(homepage, /Performance, operations and recovery/);
  assert.match(metadata, /owner-only read-only account reconciliation/);
});

test("DizyQuant homepage exposes campaign scope without claiming validation", () => {
  assert.match(research, /ACTIVE EVIDENCE CAMPAIGN/);
  assert.match(research, /BTC_USDT · ETH_USDT · SOL_USDT/);
  assert.match(research, /range · directional · volatility-shock/);
  assert.match(research, /450/);
  assert.match(research, /Coverage-ready is not validation/);
  assert.match(research, /promotion-ineligible/);
});
