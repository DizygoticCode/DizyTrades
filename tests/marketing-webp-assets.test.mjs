import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const assets = [
  ["hero-terminal.webp", 3840, 1940],
  ["feature-signals.webp", 2276, 300],
  ["feature-flow.webp", 2636, 284],
  ["feature-dom.webp", 736, 1772],
  ["feature-paper.webp", 2042, 628],
  ["feature-learning.webp", 1460, 1906],
];

function dimensions(buffer) {
  assert.equal(buffer.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(buffer.subarray(8, 12).toString("ascii"), "WEBP");
  const chunk = buffer.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return [width, height];
  }
  if (chunk === "VP8L") {
    assert.equal(buffer[20], 0x2f);
    const bits = buffer.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  if (chunk === "VP8 ") {
    assert.deepEqual([...buffer.subarray(23, 26)], [0x9d, 0x01, 0x2a]);
    return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  }
  throw new Error(`Unsupported WebP chunk ${chunk}`);
}

test("homepage screenshots are native high-resolution WebP binaries", async () => {
  for (const [name, width, height] of assets) {
    const file = await readFile(new URL(`../public/marketing/${name}`, import.meta.url));
    assert.deepEqual(dimensions(file), [width, height], name);
  }
});

test("homepage screenshot references no longer use raster-style SVG payloads", async () => {
  const terminal = await readFile(new URL("../app/marketing/terminal-preview.tsx", import.meta.url), "utf8");
  const features = await readFile(new URL("../app/marketing/real-feature-visuals.css", import.meta.url), "utf8");
  assert.match(terminal, /hero-terminal\.webp/);
  for (const name of assets.slice(1).map(([name]) => name)) assert.match(features, new RegExp(name.replace(".", "\\.")));
  assert.doesNotMatch(`${terminal}\n${features}`, /(?:hero-terminal|feature-(?:signals|flow|dom|paper|learning))\.svg/);
});
