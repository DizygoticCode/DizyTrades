import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public founder story is linked and preserves the process-first copy", async () => {
  const [aboutPage, siteHeader] = await Promise.all([
    readSource("app/about/page.tsx"),
    readSource("app/marketing/site-header.tsx"),
  ]);

  assert.ok(siteHeader.includes('href="/about"') && siteHeader.includes(">About</Link>"));
  assert.ok(aboutPage.includes("Built from mistakes.<br /><span>Built for process.</span>"));
  assert.ok(aboutPage.includes("I also wanted to build a project I felt there was a gap in the market for"));
  assert.ok(aboutPage.includes("No weekend Lambo rentals for Instagram affiliate hype"));
  assert.ok(aboutPage.includes("Uncertainty is part of the market."));
  assert.ok(aboutPage.includes("You won&apos;t always be right. What matters is having a process that keeps mistakes bounded, reviewable and useful."));
  assert.ok(aboutPage.includes("Don&apos;t trust the screenshot.<br />Test the claim."));
  assert.ok(aboutPage.includes("Trade the plan.<br />Not the emotion."));
});
