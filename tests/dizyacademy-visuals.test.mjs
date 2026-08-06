import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authoredVisuals = [
  ["dizy-workflow-overview", "dizy-workflow-loop.svg"],
  ["guided-trade-review", "guided-trade-review.svg"],
  ["dizybrain-behaviour", "dizybrain-behaviour.svg"],
  ["dizybackup-recovery", "dizybackup-recovery.svg"],
  ["pending-order-execution", "pending-order-lifecycle.svg"],
  ["spot-order-reservations", "spot-order-reservations.svg"],
];

const genericFallbacks = ["dom.svg", "risk-reward.svg", "support-resistance.svg"];

test("new conceptual Academy lessons use unique lesson-specific diagrams", () => {
  const source = readFileSync("app/school/concept-diagram.tsx", "utf8");
  assert.equal(new Set(authoredVisuals.map(([, file]) => file)).size, authoredVisuals.length);

  for (const [slug, file] of authoredVisuals) {
    const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedFile = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(source, new RegExp(`"${escapedSlug}"\\s*:\\s*\\{[^}]*${escapedFile}`));
    const mapping = source.match(new RegExp(`"${escapedSlug}"\\s*:\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    for (const fallback of genericFallbacks) assert.doesNotMatch(mapping, new RegExp(fallback.replace(".", "\\.")));
  }
});

test("authored Academy diagrams are genuine labelled 900 by 420 SVG files", () => {
  for (const [, file] of authoredVisuals) {
    const svg = readFileSync(`public/school/diagrams/${file}`, "utf8");
    assert.match(svg, /^<svg\b/);
    assert.match(svg, /viewBox="0 0 900 420"/);
    assert.match(svg, /<title\b[^>]*>[^<]+<\/title>/);
    assert.doesNotMatch(svg, /<image\b/i);
    assert.doesNotMatch(svg, /data:/i);
    assert.doesNotMatch(svg, /base64/i);
  }
});

test("every authored visual belongs to a current Academy lesson slug", () => {
  const workflow = readFileSync("app/school/academy-catalogue.ts", "utf8");
  const pending = readFileSync("app/school/pending-order-academy.ts", "utf8");
  const lessons = `${workflow}\n${pending}`;
  for (const [slug] of authoredVisuals) assert.match(lessons, new RegExp(`slug:\\s*"${slug}"`));
});
