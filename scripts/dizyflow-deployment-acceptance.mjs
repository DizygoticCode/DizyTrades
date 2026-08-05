import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = process.env.REHEARSAL_OUTPUT_DIR ?? path.join("artifacts", "render-rehearsal");
const renderReportPath = path.join(outputDir, "report.json");
const outputPath = path.join(outputDir, "dizyflow-acceptance.json");
const tuningKey = "dizytrades:heatmap-display:v1";
const tuningEvent = "dizytrades:heatmap-display-change";
const acceptedPresentations = new Set(["live", "recovering / sync", "replay"]);

const failure = (message) => {
  throw new Error(`DizyFlow deployment acceptance failed: ${message}`);
};
const pressed = async (locator) => (await locator.getAttribute("aria-pressed")) === "true";
const settle = (page, milliseconds = 700) => page.waitForTimeout(milliseconds);

async function settleRenderer(page, milliseconds = 700) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await settle(page, milliseconds);
}

async function fingerprint(page) {
  return page.locator(".chart-wrap canvas").evaluateAll((canvases) => {
    let hash = 2166136261;
    let sampledBytes = 0;
    let paintedPixels = 0;
    const dimensions = [];
    for (const canvas of canvases) {
      dimensions.push([canvas.width, canvas.height]);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || canvas.width < 1 || canvas.height < 1) continue;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3] ?? 0;
        if (alpha > 0) paintedPixels += 1;
        hash ^= pixels[index] ?? 0;
        hash = Math.imul(hash, 16777619);
        hash ^= pixels[index + 1] ?? 0;
        hash = Math.imul(hash, 16777619);
        hash ^= pixels[index + 2] ?? 0;
        hash = Math.imul(hash, 16777619);
        hash ^= alpha;
        hash = Math.imul(hash, 16777619);
        sampledBytes += 4;
      }
    }
    return { canvasCount: canvases.length, dimensions, paintedPixels, sampledBytes, checksum: hash >>> 0 };
  });
}

async function observeFingerprintChange(page, baseline, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  let current = baseline;
  while (Date.now() < deadline) {
    await settleRenderer(page, 250);
    current = await fingerprint(page);
    if (current.checksum !== baseline.checksum) return { changed: true, fingerprint: current };
  }
  return { changed: false, fingerprint: current };
}

async function readRendererDiagnostics(toolbar) {
  const [
    primitiveAttached,
    renderEnabled,
    heatmapVisible,
    bubblesVisible,
    paintCallCount,
    heatmapCellsDrawn,
    heatmapSegmentsDrawn,
    bubblesDrawn,
    effectiveTimeSliceMs,
    snapshotEnabled,
    snapshotHeatmapVisible,
    snapshotBubblesVisible,
    snapshotHeatmapObservations,
    snapshotHeatmapTiles,
    snapshotTrades,
  ] = await Promise.all([
    toolbar.getAttribute("data-flow-primitive-attached"),
    toolbar.getAttribute("data-flow-render-enabled"),
    toolbar.getAttribute("data-flow-render-heatmap-visible"),
    toolbar.getAttribute("data-flow-render-bubbles-visible"),
    toolbar.getAttribute("data-flow-paint-call-count"),
    toolbar.getAttribute("data-flow-heatmap-cells-drawn"),
    toolbar.getAttribute("data-flow-heatmap-segments-drawn"),
    toolbar.getAttribute("data-flow-bubbles-drawn"),
    toolbar.getAttribute("data-flow-effective-time-slice-ms"),
    toolbar.getAttribute("data-flow-snapshot-enabled"),
    toolbar.getAttribute("data-flow-snapshot-heatmap-visible"),
    toolbar.getAttribute("data-flow-snapshot-bubbles-visible"),
    toolbar.getAttribute("data-flow-snapshot-heatmap-observations"),
    toolbar.getAttribute("data-flow-snapshot-heatmap-tiles"),
    toolbar.getAttribute("data-flow-snapshot-trades"),
  ]);
  const finiteNumber = (value) => {
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    available: primitiveAttached !== null,
    primitiveAttached: primitiveAttached === "true",
    renderEnabled: renderEnabled === "true",
    heatmapVisible: heatmapVisible === "true",
    bubblesVisible: bubblesVisible === "true",
    paintCallCount: finiteNumber(paintCallCount),
    heatmapCellsDrawn: finiteNumber(heatmapCellsDrawn),
    heatmapSegmentsDrawn: finiteNumber(heatmapSegmentsDrawn),
    bubblesDrawn: finiteNumber(bubblesDrawn),
    effectiveTimeSliceMs: finiteNumber(effectiveTimeSliceMs),
    snapshotAvailable: snapshotEnabled !== null,
    snapshotEnabled: snapshotEnabled === "true",
    snapshotHeatmapVisible: snapshotHeatmapVisible === "true",
    snapshotBubblesVisible: snapshotBubblesVisible === "true",
    snapshotHeatmapObservations: finiteNumber(snapshotHeatmapObservations),
    snapshotHeatmapTiles: finiteNumber(snapshotHeatmapTiles),
    snapshotTrades: finiteNumber(snapshotTrades),
  };
}

async function waitForRendererReady(page, toolbar, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  let state = await readRendererDiagnostics(toolbar);
  let canvas = await fingerprint(page);
  while (Date.now() < deadline) {
    const canvasReady = canvas.canvasCount > 0 && canvas.paintedPixels > 0;
    const primitiveReady = !state.available || state.primitiveAttached;
    const snapshotReady =
      state.snapshotAvailable &&
      state.snapshotEnabled &&
      state.snapshotHeatmapVisible &&
      state.snapshotBubblesVisible;
    if (canvasReady && primitiveReady && snapshotReady) {
      return { ready: true, state, fingerprint: canvas };
    }
    await settleRenderer(page, 500);
    state = await readRendererDiagnostics(toolbar);
    canvas = await fingerprint(page);
  }
  return { ready: false, state, fingerprint: canvas };
}

async function waitForRendererBoolean(page, toolbar, key, expected, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let state = await readRendererDiagnostics(toolbar);
  while (Date.now() < deadline) {
    if (!state.available || state[key] === expected) return state;
    await settleRenderer(page, 250);
    state = await readRendererDiagnostics(toolbar);
  }
  return state;
}

async function waitForSnapshotBoolean(page, toolbar, key, expected, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let state = await readRendererDiagnostics(toolbar);
  while (Date.now() < deadline) {
    if (state.snapshotAvailable && state[key] === expected) return state;
    await settleRenderer(page, 250);
    state = await readRendererDiagnostics(toolbar);
  }
  return state;
}

async function waitForHeatmapPainted(page, toolbar, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  let state = await readRendererDiagnostics(toolbar);
  while (Date.now() < deadline) {
    const drawn = Math.max(state.heatmapCellsDrawn ?? 0, state.heatmapSegmentsDrawn ?? 0);
    if (
      state.available &&
      state.renderEnabled &&
      state.heatmapVisible &&
      state.snapshotEnabled &&
      state.snapshotHeatmapVisible &&
      drawn > 0
    ) {
      return state;
    }
    await settleRenderer(page, 500);
    state = await readRendererDiagnostics(toolbar);
  }
  return state;
}

async function waitForEffectiveTimeSlice(page, toolbar, expected, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let state = await readRendererDiagnostics(toolbar);
  while (Date.now() < deadline) {
    if (!state.available || state.effectiveTimeSliceMs === expected) return state;
    await settleRenderer(page, 250);
    state = await readRendererDiagnostics(toolbar);
  }
  return state;
}

async function ensurePressed(button, value) {
  if ((await pressed(button)) !== value) await button.click();
  if ((await pressed(button)) !== value) failure(`could not set ${await button.textContent()} to ${value}`);
}

async function waitForPresentation(page, toolbar) {
  await toolbar.waitFor({ state: "visible", timeout: 30_000 });
  const deadline = Date.now() + 90_000;
  let value = "unknown";
  while (Date.now() < deadline) {
    value = (await toolbar.getAttribute("data-flow-presentation")) ?? "unknown";
    if (acceptedPresentations.has(value)) return value;
    await settle(page, 500);
  }
  failure(`DizyFlow remained ${value}`);
}

await mkdir(outputDir, { recursive: true });
const renderReport = JSON.parse(await readFile(renderReportPath, "utf8"));
const serviceUrl = new URL(renderReport?.service?.url ?? failure("Render report has no service URL"));
if (!/^https?:$/.test(serviceUrl.protocol)) failure("service URL is not HTTP(S)");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const report = {
  schemaVersion: 1,
  observedAt: new Date().toISOString(),
  serviceOrigin: serviceUrl.origin,
  viewerSession: false,
  viewerEndpointStatus: null,
  profileEndpointStatus: null,
  viewerCookiePresent: false,
  onboardingDismissed: false,
  presentation: "unknown",
  controls: {
    heatmapIndependent: false,
    heatmapVisualChanged: false,
    bubblesIndependent: false,
    bubblesVisualEvidencePresent: false,
    bubblesVisualChanged: false,
  },
  renderer: {},
  rendering: {},
  tuning: {},
  viewport: {},
  passed: false,
};

try {
  await page.goto(new URL("/login", serviceUrl).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const viewerButton = page.getByRole("button", { name: "Open View-Only Terminal" });
  await viewerButton.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => undefined);
  await settle(page, 250);

  let resolveProfileResponse;
  const profileResponsePromise = new Promise((resolve) => {
    resolveProfileResponse = resolve;
  });
  const observeTerminalResponse = (response) => {
    let pathname;
    try {
      pathname = new URL(response.url()).pathname.replace(/\/+$/, "");
    } catch {
      return;
    }
    const method = response.request().method();
    if (pathname === "/api/auth/viewer" && method === "POST") {
      report.viewerEndpointStatus = response.status();
    }
    if (pathname === "/api/profile" && method === "GET") {
      report.profileEndpointStatus = response.status();
      resolveProfileResponse(response);
    }
  };
  page.on("response", observeTerminalResponse);
  await viewerButton.click();
  await page.waitForURL(/\/terminal(?:\?|$)/, { timeout: 30_000 });
  const profileResponse = await Promise.race([
    profileResponsePromise,
    page.waitForTimeout(30_000).then(() => null),
  ]);
  page.off("response", observeTerminalResponse);
  if (!profileResponse) failure("terminal profile hydration was not observed");
  await profileResponse.finished();
  if (!profileResponse.ok()) failure(`profile endpoint returned HTTP ${profileResponse.status()}`);
  await settleRenderer(page, 500);

  report.viewerCookiePresent = (await context.cookies(serviceUrl.origin)).some(
    (cookie) => cookie.httpOnly && cookie.secure && cookie.path === "/",
  );
  if (
    report.viewerEndpointStatus !== null &&
    (report.viewerEndpointStatus < 200 || report.viewerEndpointStatus >= 300)
  ) {
    failure(`viewer endpoint returned HTTP ${report.viewerEndpointStatus}`);
  }
  if (!report.viewerCookiePresent) failure("viewer flow reached the terminal without an HTTP-only production session cookie");
  report.viewerSession = true;

  const onboarding = page.locator(".first-run-onboarding-backdrop");
  const onboardingOpened = await onboarding
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (onboardingOpened) {
    await onboarding.getByRole("button", { name: "Skip onboarding" }).click();
    await onboarding.waitFor({ state: "detached", timeout: 10_000 });
    report.onboardingDismissed = true;
  }

  const toolbar = page.locator(".dizyflow-controls");
  const master = toolbar.locator(".dizyflow-master");
  await master.waitFor({ state: "visible", timeout: 30_000 });
  await ensurePressed(master, true);
  await waitForSnapshotBoolean(page, toolbar, "snapshotEnabled", true);
  report.presentation = await waitForPresentation(page, toolbar);

  const components = toolbar.getByRole("group", { name: "DizyFlow components" });
  const heatmap = components.getByRole("button", { name: "Heatmap" });
  const bubbles = components.getByRole("button", { name: "Bubbles" });
  await ensurePressed(heatmap, true);
  await ensurePressed(bubbles, true);
  await waitForSnapshotBoolean(page, toolbar, "snapshotHeatmapVisible", true);
  await waitForSnapshotBoolean(page, toolbar, "snapshotBubblesVisible", true);

  const readiness = await waitForRendererReady(page, toolbar);
  const initialState = readiness.state;
  const initialCanvas = readiness.fingerprint;
  report.renderer = { readiness: initialState };
  report.rendering = {
    readinessChecksum: initialCanvas.checksum,
    readinessCanvasCount: initialCanvas.canvasCount,
    readinessPaintedPixels: initialCanvas.paintedPixels,
    readinessSampledBytes: initialCanvas.sampledBytes,
  };
  if (!readiness.ready) {
    failure(
      `renderer readiness timed out (primitive=${initialState.primitiveAttached}, snapshotEnabled=${initialState.snapshotEnabled}, snapshotHeatmap=${initialState.snapshotHeatmapVisible}, snapshotBubbles=${initialState.snapshotBubblesVisible})`,
    );
  }

  // Prime the custom primitive after profile hydration. The paint diagnostics are
  // produced by an actual primitive draw, so a known off/on cycle establishes a
  // heatmap-on baseline without treating initial diagnostic defaults as product state.
  await ensurePressed(heatmap, false);
  await waitForSnapshotBoolean(page, toolbar, "snapshotHeatmapVisible", false);
  await waitForRendererBoolean(page, toolbar, "heatmapVisible", false);
  await ensurePressed(heatmap, true);
  await waitForSnapshotBoolean(page, toolbar, "snapshotHeatmapVisible", true);
  const primedHeatmapRenderer = await waitForHeatmapPainted(page, toolbar);
  const primedHeatmapDrawn = Math.max(
    primedHeatmapRenderer.heatmapCellsDrawn ?? 0,
    primedHeatmapRenderer.heatmapSegmentsDrawn ?? 0,
  );
  if (primedHeatmapDrawn < 1) {
    failure(
      `heatmap renderer produced no drawn cells after priming (observations=${primedHeatmapRenderer.snapshotHeatmapObservations ?? 0}, tiles=${primedHeatmapRenderer.snapshotHeatmapTiles ?? 0})`,
    );
  }
  await settleRenderer(page, 500);
  const bothOn = await fingerprint(page);
  const bothRenderer = await readRendererDiagnostics(toolbar);

  await ensurePressed(heatmap, false);
  const heatmapOffSnapshot = await waitForSnapshotBoolean(
    page,
    toolbar,
    "snapshotHeatmapVisible",
    false,
  );
  const heatmapOffRenderer = await waitForRendererBoolean(page, toolbar, "heatmapVisible", false);
  const heatmapOffObservation = await observeFingerprintChange(page, bothOn);
  const heatmapOff = heatmapOffObservation.fingerprint;
  const heatmapOffState = !(await pressed(heatmap));

  await ensurePressed(heatmap, true);
  const heatmapRestoredSnapshot = await waitForSnapshotBoolean(
    page,
    toolbar,
    "snapshotHeatmapVisible",
    true,
  );
  const heatmapRestoredRenderer = await waitForHeatmapPainted(page, toolbar);
  const heatmapRestoredObservation = await observeFingerprintChange(page, heatmapOff);
  const heatmapRestored = heatmapRestoredObservation.fingerprint;
  const heatmapRestoredState = await pressed(heatmap);
  const heatmapSnapshotVisibility =
    !heatmapOffSnapshot.snapshotHeatmapVisible &&
    heatmapRestoredSnapshot.snapshotHeatmapVisible;
  const heatmapRendererVisibility =
    !heatmapOffRenderer.heatmapVisible && heatmapRestoredRenderer.heatmapVisible;
  const heatmapRendererPainted =
    Math.max(
      heatmapRestoredRenderer.heatmapCellsDrawn ?? 0,
      heatmapRestoredRenderer.heatmapSegmentsDrawn ?? 0,
    ) > 0;
  report.controls.heatmapVisualChanged =
    heatmapOffObservation.changed && heatmapRestoredObservation.changed;
  report.controls.heatmapIndependent =
    heatmapOffState &&
    heatmapRestoredState &&
    heatmapSnapshotVisibility &&
    heatmapRendererVisibility &&
    heatmapRendererPainted &&
    report.controls.heatmapVisualChanged;

  await ensurePressed(bubbles, false);
  const bubblesOffSnapshot = await waitForSnapshotBoolean(
    page,
    toolbar,
    "snapshotBubblesVisible",
    false,
  );
  const bubblesOffRenderer = await waitForRendererBoolean(page, toolbar, "bubblesVisible", false);
  const bubblesOffObservation = await observeFingerprintChange(page, heatmapRestored, 3_000);
  const bubblesOff = bubblesOffObservation.fingerprint;
  const bubblesOffState = !(await pressed(bubbles));

  await ensurePressed(bubbles, true);
  const bubblesRestoredSnapshot = await waitForSnapshotBoolean(
    page,
    toolbar,
    "snapshotBubblesVisible",
    true,
  );
  const bubblesRestoredRenderer = await waitForRendererBoolean(page, toolbar, "bubblesVisible", true);
  const bubblesRestoredObservation = await observeFingerprintChange(page, bubblesOff, 3_000);
  const bubblesRestored = bubblesRestoredObservation.fingerprint;
  const bubblesRestoredState = await pressed(bubbles);
  const bubblesSnapshotVisibility =
    !bubblesOffSnapshot.snapshotBubblesVisible &&
    bubblesRestoredSnapshot.snapshotBubblesVisible;
  const bubblesRendererVisibility =
    !bubblesOffRenderer.bubblesVisible && bubblesRestoredRenderer.bubblesVisible;
  report.controls.bubblesVisualEvidencePresent =
    Math.max(bothRenderer.bubblesDrawn ?? 0, bubblesRestoredRenderer.bubblesDrawn ?? 0) > 0;
  report.controls.bubblesVisualChanged =
    bubblesOffObservation.changed && bubblesRestoredObservation.changed;
  report.controls.bubblesIndependent =
    bubblesOffState &&
    bubblesRestoredState &&
    bubblesSnapshotVisibility &&
    bubblesRendererVisibility &&
    (!report.controls.bubblesVisualEvidencePresent || report.controls.bubblesVisualChanged);

  const tuningResult = await page.evaluate(({ key, eventName }) => {
    const original = localStorage.getItem(key);
    const next = {
      palette: "thermal",
      minimumTimePixels: 12,
      minimumPricePixels: 11,
      timeSliceMs: 30000,
      detectionRangeBps: 1000,
      priceGrouping: "exchange",
      manualPriceStep: 1,
    };
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(eventName, { detail: next }));
    return { original, applied: JSON.parse(localStorage.getItem(key) ?? "null") };
  }, { key: tuningKey, eventName: tuningEvent });
  const tunedRenderer = await waitForEffectiveTimeSlice(page, toolbar, 30_000);
  const tunedObservation = await observeFingerprintChange(page, bubblesRestored);
  const tuned = tunedObservation.fingerprint;
  await page.evaluate(({ key, eventName, original }) => {
    if (original === null) localStorage.removeItem(key);
    else localStorage.setItem(key, original);
    const restored = original === null ? null : JSON.parse(original);
    window.dispatchEvent(new CustomEvent(eventName, { detail: restored }));
  }, { key: tuningKey, eventName: tuningEvent, original: tuningResult.original });
  report.tuning = {
    applied: tuningResult.applied,
    rendererChanged:
      tunedObservation.changed ||
      (tunedRenderer.available && tunedRenderer.effectiveTimeSliceMs === 30_000),
  };

  await page.setViewportSize({ width: 1024, height: 720 });
  await settleRenderer(page);
  const compact = await fingerprint(page);
  report.viewport = {
    desktopDimensions: bothOn.dimensions,
    compactDimensions: compact.dimensions,
    resized: JSON.stringify(bothOn.dimensions) !== JSON.stringify(compact.dimensions),
    toolbarVisible: await toolbar.isVisible(),
  };
  report.renderer = {
    diagnosticsAvailable: bothRenderer.available,
    snapshotAvailable: bothRenderer.snapshotAvailable,
    initial: initialState,
    primed: primedHeatmapRenderer,
    bothOn: bothRenderer,
    heatmapOff: heatmapOffRenderer,
    heatmapRestored: heatmapRestoredRenderer,
    bubblesOff: bubblesOffRenderer,
    bubblesRestored: bubblesRestoredRenderer,
    tuned: tunedRenderer,
  };
  report.rendering = {
    bothOnChecksum: bothOn.checksum,
    heatmapOffChecksum: heatmapOff.checksum,
    heatmapRestoredChecksum: heatmapRestored.checksum,
    bubblesOffChecksum: bubblesOff.checksum,
    bubblesRestoredChecksum: bubblesRestored.checksum,
    tunedChecksum: tuned.checksum,
    canvasCount: bothOn.canvasCount,
    paintedPixels: bothOn.paintedPixels,
    sampledBytes: bothOn.sampledBytes,
  };

  if (!report.controls.heatmapIndependent) failure("heatmap layer did not produce independent store, renderer and canvas evidence");
  if (!report.controls.bubblesIndependent) failure("trade-bubble layer did not preserve independent bounded control evidence");
  if (!report.tuning.rendererChanged) failure("display aggregation tuning did not alter renderer diagnostics or the rendered chart");
  if (!report.viewport.resized || !report.viewport.toolbarVisible) failure("responsive chart acceptance failed");
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await browser.close();
}

if (!report.passed) failure(report.error ?? "unknown failure");
console.log(`DizyFlow deployment acceptance passed for ${report.serviceOrigin}`);
