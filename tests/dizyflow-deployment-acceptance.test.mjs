import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptPath = new URL("../scripts/dizyflow-deployment-acceptance.mjs", import.meta.url);

test("deployed DizyFlow acceptance uses the view-only terminal and bounded presentation controls", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /Open View-Only Terminal/);
  assert.match(source, /\.first-run-onboarding-backdrop/);
  assert.match(source, /name: "Skip onboarding"/);
  assert.doesNotMatch(source, /force:\s*true/);
  assert.match(source, /\.dizyflow-controls/);
  assert.match(source, /DizyFlow components/);
  assert.match(source, /name: "Heatmap"/);
  assert.match(source, /name: "Bubbles"/);
  assert.match(source, /data-flow-presentation/);
  assert.doesNotMatch(source, /waitForFunction/);
  assert.match(source, /acceptedPresentations\.has/);
  assert.match(source, /recovering \/ sync/);
  assert.match(source, /\.chart-wrap canvas/);
});

test("deployed DizyFlow acceptance exercises layer, tuning and viewport behaviour", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /ensurePressed\(heatmap, false\)/);
  assert.match(source, /ensurePressed\(bubbles, false\)/);
  assert.match(source, /dizytrades:heatmap-display:v1/);
  assert.match(source, /timeSliceMs: 30000/);
  assert.match(source, /detectionRangeBps: 1000/);
  assert.match(source, /priceGrouping: "exchange"/);
  assert.match(source, /setViewportSize\(\{ width: 1024, height: 720 \}\)/);
  assert.match(source, /rendererChanged/);
  assert.match(source, /resized/);
});

test("deployed DizyFlow acceptance persists sanitised diagnostics only", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /dizyflow-acceptance\.json/);
  assert.match(source, /viewerEndpointStatus/);
  assert.match(source, /viewerCookiePresent/);
  assert.match(source, /context\.cookies\(serviceUrl\.origin\)/);
  assert.doesNotMatch(source, /document\.body\.innerText|page\.content\(|localStorage\.length|indexedDB|sessionStorage/);
  assert.doesNotMatch(source, /apiKey|password|secret|authorization|RawTrade|bidQuantity|askQuantity/i);
  assert.doesNotMatch(source, /\bcookie\.(?:name|value|domain|expires)\b|report\.(?:cookies?|headers?)\b|JSON\.stringify\([^)]*cookies?/i);
  assert.doesNotMatch(source, /writeFile\([^,]+,\s*await page|screenshot|video/i);
  assert.match(source, /checksum/);
  assert.match(source, /paintedPixels/);
  assert.match(source, /serviceOrigin/);
});
