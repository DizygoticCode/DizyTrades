import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptPath = new URL("../scripts/dizyflow-deployment-acceptance.mjs", import.meta.url);
const toolbarPath = new URL("../app/order-flow-toolbar.tsx", import.meta.url);

test("deployed DizyFlow acceptance waits for secure viewer and profile hydration", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /Open View-Only Terminal/);
  assert.match(source, /page\.on\("response", observeTerminalResponse\)/);
  assert.match(source, /page\.waitForURL\(\/\\\/terminal/);
  assert.doesNotMatch(source, /waitForResponse/);
  assert.match(source, /profileResponsePromise/);
  assert.match(source, /pathname === "\/api\/profile" && method === "GET"/);
  assert.match(source, /profileResponse\.finished\(\)/);
  assert.match(source, /terminal profile hydration was not observed/);
  assert.match(source, /profileEndpointStatus/);
  assert.match(source, /viewerCookiePresent/);
  assert.ok(
    source.indexOf("await profileResponse.finished()") <
      source.indexOf("await ensurePressed(master, true)"),
  );
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

test("deployed DizyFlow acceptance distinguishes store state from paint diagnostics", async () => {
  const source = await readFile(scriptPath, "utf8");
  const toolbar = await readFile(toolbarPath, "utf8");
  assert.match(toolbar, /renderStore\.subscribe,/);
  assert.match(toolbar, /renderStore\.getSnapshot/);
  assert.match(toolbar, /data-flow-snapshot-enabled/);
  assert.match(toolbar, /data-flow-snapshot-heatmap-visible/);
  assert.match(toolbar, /data-flow-snapshot-bubbles-visible/);
  assert.match(toolbar, /data-flow-snapshot-heatmap-observations/);
  assert.match(toolbar, /data-flow-snapshot-heatmap-tiles/);
  assert.match(toolbar, /data-flow-snapshot-trades/);
  assert.match(source, /snapshotAvailable/);
  assert.match(source, /snapshotEnabled/);
  assert.match(source, /snapshotHeatmapVisible/);
  assert.match(source, /snapshotBubblesVisible/);
  assert.match(source, /waitForSnapshotBoolean/);
});

test("pre-merge observer tolerates absent snapshot attributes and becomes strict when present", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(
    source,
    /const snapshotReady =\s*!state\.snapshotAvailable \|\|\s*\(state\.snapshotEnabled/,
  );
  assert.match(
    source,
    /if \(!state\.snapshotAvailable \|\| state\[key\] === expected\) return state/,
  );
  assert.match(
    source,
    /const snapshotSatisfied =\s*!state\.snapshotAvailable \|\|\s*\(state\.snapshotEnabled && state\.snapshotHeatmapVisible\)/,
  );
  assert.match(
    source,
    /const heatmapSnapshotVisibility =\s*!bothRenderer\.snapshotAvailable \|\|/,
  );
  assert.match(
    source,
    /const bubblesSnapshotVisibility =\s*!bothRenderer\.snapshotAvailable \|\|/,
  );
});

test("deployed DizyFlow acceptance waits for renderer attachment then primes an actual heatmap paint", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /waitForRendererReady/);
  assert.match(source, /timeout = 45_000/);
  assert.match(source, /const primitiveReady = !state\.available \|\| state\.primitiveAttached/);
  assert.match(source, /const snapshotReady =/);
  assert.match(source, /waitForHeatmapPainted/);
  assert.match(source, /heatmap renderer produced no drawn cells after priming/);
  assert.match(source, /waitForRendererBoolean/);
  assert.match(source, /waitForEffectiveTimeSlice/);
  assert.match(source, /renderer readiness timed out/);
  assert.ok(
    source.indexOf("await waitForSnapshotBoolean(page, toolbar, \"snapshotEnabled\", true)") <
      source.indexOf("const readiness = await waitForRendererReady"),
  );
});

test("deployed DizyFlow acceptance uses full-pixel and bounded renderer evidence", async () => {
  const source = await readFile(scriptPath, "utf8");
  const toolbar = await readFile(toolbarPath, "utf8");
  assert.match(source, /index \+= 4/);
  assert.doesNotMatch(source, /const stride/);
  assert.match(source, /observeFingerprintChange/);
  assert.match(source, /readRendererDiagnostics/);
  assert.match(source, /heatmapVisualChanged/);
  assert.match(source, /heatmapSnapshotVisibility/);
  assert.match(source, /heatmapRendererVisibility/);
  assert.match(source, /heatmapRendererPainted/);
  assert.match(source, /bubblesVisualEvidencePresent/);
  assert.match(source, /bubblesSnapshotVisibility/);
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
  assert.ok([...source.matchAll(/ensurePressed\(heatmap, false\)/g)].length >= 2);
  assert.ok([...source.matchAll(/ensurePressed\(heatmap, true\)/g)].length >= 2);
  assert.match(source, /ensurePressed\(bubbles, false\)/);
  assert.match(source, /ensurePressed\(bubbles, true\)/);
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
  assert.match(source, /profileEndpointStatus/);
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
