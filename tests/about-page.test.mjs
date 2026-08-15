import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public founder story is linked and preserves the process-first copy", async () => {
  const [aboutPage, siteHeader] = await Promise.all([
    readSource("app/about/page.tsx"),
    readSource("app/marketing/site-header.tsx"),
  ]);

  assert.match(siteHeader, /href="\/about"[^>]*>About<\/Link>/);
  assert.match(aboutPage, /Built from mistakes\.<br \/><span>Built for process\.<\/span>/);
  assert.match(aboutPage, /I also wanted to build a project I felt there was a gap in the market for/);
  assert.match(aboutPage, /No weekend Lambo rentals for Instagram affiliate hype/);
  assert.match(aboutPage, /Uncertainty is part of the market\./);
  assert.match(aboutPage, /You won&apos;t always be right\. What matters is having a process that keeps mistakes bounded, reviewable and useful\./);
  assert.match(aboutPage, /Don&apos;t trust the screenshot\.<br \/>Test the claim\./);
  assert.match(aboutPage, /Trade the plan\.<br \/>Not the emotion\./);
});
