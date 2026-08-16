import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const aboutPage = await readFile(new URL("../app/about/page.tsx", import.meta.url), "utf8");
const headerSource = await readFile(new URL("../app/marketing/site-header.tsx", import.meta.url), "utf8");

test("about page ships the approved founder story and trust posture", () => {
  assert.ok(
    aboutPage.includes("Built from mistakes.<br /><span>Built for process.</span>"),
    "about page must lead with the approved process-first hero"
  );
  assert.ok(
    aboutPage.includes("I also wanted to build a project I felt there was a gap in the market for."),
    "about page must preserve the approved founder motivation"
  );
  assert.ok(
    aboutPage.includes("No weekend Lambo rentals for Instagram affiliate hype"),
    "about page must keep the approved anti-hype founder voice"
  );
  assert.ok(
    aboutPage.includes("Uncertainty is part of the market."),
    "about page must state that uncertainty is part of the market"
  );
  assert.ok(
    aboutPage.includes("You won&apos;t always be right."),
    "about page must keep the positive process framing"
  );
  assert.ok(
    aboutPage.includes("Don&apos;t trust the screenshot.<br />Test the claim."),
    "about page must keep the test-the-claim trust principle"
  );
  assert.ok(
    aboutPage.includes("Trade the plan.<br />Not the emotion."),
    "about page must close on the approved Dizy process line"
  );
});

test("public header exposes the About page", () => {
  assert.ok(headerSource.includes('href="/about"'), "public header must link to /about");
  assert.ok(headerSource.includes(">About</Link>"), "public header must label the route About");
});
