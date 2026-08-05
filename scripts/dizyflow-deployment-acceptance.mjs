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
      const stride = Math.max(4, Math.floor(pixels.length / 6000 / 4) * 4);
      for (let index = 0; index < pixels.length; index += stride) {
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

async function ensurePressed(button, value) {
  if ((await pressed(button)) !== value) await button.click();
  if ((await pressed(button)) !== value) failure(`could not set ${await button.textContent()} to ${value}`);
}

async function waitForPresentation(page, toolbar) {
  await toolbar.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    ({ selector, accepted }) => {
      const value = document.querySelector(selector)?.getAttribute("data-flow-presentation") ?? "";
      return accepted.includes(value);
    },
    { selector: ".dizyflow-controls", accepted: [...acceptedPresentations] },
    { timeout: 90_000 },
  );
  return (await toolbar.getAttribute("data-flow-presentation")) ?? "unknown";
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
  viewerCookiePresent: false,
  onboardingDismissed: false,
  presentation: "unknown",
  controls: { heatmapIndependent: false, bubblesIndependent: false },
  rendering: {},
  tuning: {},
  viewport: {},
  passed: false,
};

try {
  await page.goto(new URL("/login", serviceUrl).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const viewerButton = page.getByRole("button", { name: "Open View-Only Terminal" });
  await viewerButton.waitFor({ state: "visible", timeout: 30_000 });
  const viewerResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/viewer" && response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await viewerButton.click();
  const viewerResponse = await viewerResponsePromise;
  report.viewerEndpointStatus = viewerResponse.status();
  report.viewerCookiePresent = (await context.cookies(serviceUrl.origin)).some(
    (cookie) => cookie.httpOnly && cookie.secure && cookie.path === "/",
  );
  if (!viewerResponse.ok()) failure(`viewer endpoint returned HTTP ${viewerResponse.status()}`);
  if (!report.viewerCookiePresent) failure("viewer endpoint returned success without an HTTP-only production session cookie");
  await page.waitForURL(/\/terminal(?:\?|$)/, { timeout: 30_000 });
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
  report.presentation = await waitForPresentation(page, toolbar);

  const components = toolbar.getByRole("group", { name: "DizyFlow components" });
  const heatmap = components.getByRole("button", { name: "Heatmap" });
  const bubbles = components.getByRole("button", { name: "Bubbles" });
  await ensurePressed(heatmap, true);
  await ensurePressed(bubbles, true);
  await settle(page, 1_500);

  const bothOn = await fingerprint(page);
  if (bothOn.canvasCount < 1 || bothOn.paintedPixels < 1) failure("chart canvases contain no rendered pixels");

  await ensurePressed(heatmap, false);
  await settle(page);
  const heatmapOff = await fingerprint(page);
  await ensurePressed(heatmap, true);
  await settle(page);
  const heatmapRestored = await fingerprint(page);
  report.controls.heatmapIndependent = (await pressed(heatmap)) && heatmapOff.checksum !== heatmapRestored.checksum;

  await ensurePressed(bubbles, false);
  await settle(page);
  const bubblesOff = await fingerprint(page);
  await ensurePressed(bubbles, true);
  await settle(page);
  const bubblesRestored = await fingerprint(page);
  report.controls.bubblesIndependent = (await pressed(bubbles)) && bubblesOff.checksum !== bubblesRestored.checksum;

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
  await settle(page);
  const tuned = await fingerprint(page);
  await page.evaluate(({ key, eventName, original }) => {
    if (original === null) localStorage.removeItem(key);
    else localStorage.setItem(key, original);
    const restored = original === null ? null : JSON.parse(original);
    window.dispatchEvent(new CustomEvent(eventName, { detail: restored }));
  }, { key: tuningKey, eventName: tuningEvent, original: tuningResult.original });
  report.tuning = {
    applied: tuningResult.applied,
    rendererChanged: tuned.checksum !== bubblesRestored.checksum,
  };

  await page.setViewportSize({ width: 1024, height: 720 });
  await settle(page);
  const compact = await fingerprint(page);
  report.viewport = {
    desktopDimensions: bothOn.dimensions,
    compactDimensions: compact.dimensions,
    resized: JSON.stringify(bothOn.dimensions) !== JSON.stringify(compact.dimensions),
    toolbarVisible: await toolbar.isVisible(),
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
  };

  if (!report.controls.heatmapIndependent) failure("heatmap layer did not independently alter the rendered chart");
  if (!report.controls.bubblesIndependent) failure("trade-bubble layer did not independently alter the rendered chart");
  if (!report.tuning.rendererChanged) failure("display aggregation tuning did not alter the rendered chart");
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
