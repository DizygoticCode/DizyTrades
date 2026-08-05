import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptPath = new URL("../scripts/dizyflow-deployment-acceptance.mjs", import.meta.url);
const toolbarPath = new URL("../app/order-flow-toolbar.tsx", import.meta.url);

test("deployed DizyFlow acceptance uses the view-only terminal and bounded presentation controls", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /Open View-Only Terminal/);
  assert.match(source, /page\.on\("response", observeViewerResponse\)/);
  assert.match(source, /page\.waitForURL\(\/\\\/terminal/);
  assert.doesNotMatch(source, /waitForResponse/);
  assert.match(source, /viewerCookiePresent/);
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

test("deployed DizyFlow acceptance waits for renderer readiness and propagated controls", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /waitForRendererReady/);
  assert.match(source, /timeout = 45_000/);
  assert.match(source, /diagnostics\.primitiveAttached/);
  assert.match(source, /diagnostics\.renderEnabled/);
  assert.match(source, /diagnostics\.heatmapVisible/);
  assert.match(source, /diagnostics\.bubblesVisible/);
  assert.match(source, /heatmapCellsDrawn/);
  assert.match(source, /heatmapSegmentsDrawn/);
  assert.match(source, /waitForRendererBoolean/);
  assert.match(source, /waitForEffectiveTimeSlice/);
  assert.match(source, /renderer readiness timed out/);
});

test("deployed DizyFlow acceptance uses full-pixel and bounded renderer evidence", async () => {
  const source = await readFile(scriptPath, "utf8");
  const toolbar = await readFile(toolbarPath, "utf8");
  assert.match(source, /index \+= 4/);
  assert.doesNotMatch(source, /const stride/);
  assert.match(source, /observeFingerprintChange/);
  assert.match(source, /readRendererDiagnostics/);
  assert.match(source, /heatmapVisualChanged/);
  assert.match(source, /bubblesVisualEvidencePresent/);
  assert.match(source, /effectiveTimeSliceMs === 30_000/);
  assert.match(toolbar, /data-flow-primitive-attached/);
  assert.match(toolbar, /data-flow-render-heatmap-visible/);
  assert.match(toolbar, /data-flow-render-bubbles-visible/);
  assert.match(toolbar, /data-flow-heatmap-cells-drawn/);
  assert.match(toolbar, /data-flow-heatmap-segments-drawn/);
  assert.match(toolbar, /data-flow-bubbles-drawn/);
  assert.match(toolbar, /data-flow-effective-time-slice-ms/);
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
  assert.match(source, /sampledBytes/);
  assert.match(source, /serviceOrigin/);
});
