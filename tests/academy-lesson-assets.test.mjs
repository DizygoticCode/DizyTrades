import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");
const readBinary = (path) => readFile(new URL(path, root));

const svgAssets = [
  "dizy-workflow-loop.svg",
  "guided-trade-review.svg",
  "dizybrain-behaviour.svg",
  "dizybackup-recovery.svg",
  "pending-order-lifecycle.svg",
  "spot-order-reservations.svg",
];

const webpAssets = [
  ["dizyscanner-watchlists.webp", "dizyscanner-watchlists"],
  ["dizystructure-workspace.webp", "dizystructure-workspace"],
  ["dizyreplay-historical-flow.webp", "dizyreplay-historical-flow"],
  ["dizyperformance-dashboard.webp", "dizyperformance-dashboard"],
];

const publicLessonAssets = new Map([
  ["dizy-workflow-overview", "dizy-workflow-loop.svg"],
  ["dizyscanner-watchlists", "dizyscanner-watchlists.webp"],
  ["dizystructure-workspace", "dizystructure-workspace.webp"],
  ["dizyreplay-historical-flow", "dizyreplay-historical-flow.webp"],
  ["guided-trade-review", "guided-trade-review.svg"],
  ["dizyperformance-dashboard", "dizyperformance-dashboard.webp"],
  ["dizybrain-behaviour", "dizybrain-behaviour.svg"],
  ["dizybackup-recovery", "dizybackup-recovery.svg"],
  ["pending-order-execution", "pending-order-lifecycle.svg"],
  ["spot-order-reservations", "spot-order-reservations.svg"],
]);

test("new Academy lessons have explicit topic-specific visual mappings", async () => {
  const source = await readText("app/school/concept-diagram.tsx");
  for (const [slug, asset] of publicLessonAssets) {
    assert.match(source, new RegExp(`\\"${slug}\\"\\s*:\\s*\\{[^}]*${asset.replaceAll(".", "\\.")}`));
  }
  for (const slug of publicLessonAssets.keys()) {
    const entry = source.match(new RegExp(`\\"${slug}\\"\\s*:\\s*\\{([^}]*)\\}`));
    assert.ok(entry, `missing mapping for ${slug}`);
    assert.doesNotMatch(entry[1], /(?:dom|risk-reward|support-resistance)\.svg/);
  }
  assert.match(source, /simulated example results for education only/);
  assert.match(source, /Historical DizyFlow appears only where retained evidence exists/);
});

test("authored Academy SVGs are genuine labelled 900 by 420 vectors", async () => {
  for (const asset of svgAssets) {
    const source = await readText(`public/school/diagrams/${asset}`);
    assert.match(source, /^\s*<svg\b/);
    assert.match(source, /viewBox=["']0 0 900 420["']/);
    assert.match(source, /<title(?:\s|>)/);
    assert.doesNotMatch(source, /data:/i);
    assert.doesNotMatch(source, /base64/i);
    assert.doesNotMatch(source, /<image\b/i);
  }
});

test("Academy product captures are exact lossless WebP binaries at the shared frame", async () => {
  for (const [asset] of webpAssets) {
    const bytes = await readBinary(`public/school/diagrams/${asset}`);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, `${asset} RIFF length`);
    assert.equal(bytes.subarray(12, 16).toString("ascii"), "VP8L", `${asset} must be lossless WebP`);
    assert.equal(bytes[20], 0x2f, `${asset} VP8L signature`);
    const bits = bytes.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    assert.equal(width, 900, `${asset} width`);
    assert.equal(height, 420, `${asset} height`);
  }
});

test("owner-only DizyOps is excluded from the ordinary Academy course", async () => {
  const client = await readText("app/school/school-client.tsx");
  const page = await readText("app/school/page.tsx");
  assert.match(client, /academyLessons\.filter\(\(lesson\) => lesson\.slug !== "dizyops-diagnostics"\)/);
  assert.doesNotMatch(page, /operations/i);
});
