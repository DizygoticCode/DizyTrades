import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = process.env.REHEARSAL_OUTPUT_DIR ?? path.join("artifacts", "render-rehearsal");
const renderReportPath = path.join(outputDir, "report.json");
const acceptancePath = path.join(outputDir, "dizyflow-acceptance.json");
const maximumAttempts = 6;
const pauseMs = 2_000;

const boundedInteger = (value, maximum = 10_000) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(maximum, Math.floor(parsed))) : null;
};
const finitePresent = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));

export function classifyDepthError(value) {
  if (typeof value !== "string" || !value) return null;
  const http = value.match(/MEXC depth HTTP (\d{3})/);
  if (http) return `upstream-http-${http[1]}`;
  if (value.includes("Invalid MEXC depth envelope")) return "invalid-envelope";
  if (value.includes("Invalid MEXC depth version or timestamp")) return "invalid-version-or-time";
  if (value.includes("Invalid MEXC depth levels")) return "invalid-levels";
  if (/timeout|aborted/i.test(value)) return "timeout";
  if (/fetch failed|network|request failed/i.test(value)) return "network";
  return "other";
}

export function sanitiseDepthDiagnostic(httpStatus, body, attempts) {
  const diagnostic = body?.diagnostic && typeof body.diagnostic === "object" ? body.diagnostic : {};
  const status = typeof body?.status === "string" && ["CONNECTING", "ERROR", "LIVE", "STALE"].includes(body.status)
    ? body.status
    : "UNKNOWN";
  return Object.freeze({
    collected: true,
    attempts: boundedInteger(attempts, maximumAttempts),
    httpStatus: boundedInteger(httpStatus, 599),
    apiStatus: status,
    success: body?.success === true,
    running: diagnostic.running === true,
    lastSuccessfulSnapshotPresent: finitePresent(diagnostic.lastSuccessfulSnapshot),
    lastVersionPresent: finitePresent(diagnostic.lastVersion),
    bids: boundedInteger(diagnostic.bids, 1_000),
    asks: boundedInteger(diagnostic.asks, 1_000),
    consecutiveFailures: boundedInteger(diagnostic.consecutiveFailures, 1_000),
    errorKind: classifyDepthError(diagnostic.lastError),
  });
}

async function readJson(file, fallback = {}) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const renderReport = await readJson(renderReportPath);
  const acceptance = await readJson(acceptancePath);
  let diagnostic = Object.freeze({ collected: false, reason: "observer-unavailable" });
  let browser;
  try {
    const serviceUrl = new URL(renderReport?.service?.url);
    if (!/^https?:$/.test(serviceUrl.protocol)) throw new Error("unsupported service URL");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1024, height: 720 } });
    const page = await context.newPage();
    await page.goto(new URL("/login", serviceUrl).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const viewerButton = page.getByRole("button", { name: "Open View-Only Terminal" });
    await viewerButton.waitFor({ state: "visible", timeout: 30_000 });
    await viewerButton.click();
    await page.waitForURL(/\/terminal(?:\?|$)/, { timeout: 30_000 });

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const result = await page.evaluate(async () => {
        const response = await fetch("/api/dizyflow/depth?symbol=BTC_USDT", { cache: "no-store" });
        let body = {};
        try {
          body = await response.json();
        } catch {}
        return { httpStatus: response.status, body };
      });
      diagnostic = sanitiseDepthDiagnostic(result.httpStatus, result.body, attempt);
      if (diagnostic.success || diagnostic.apiStatus === "ERROR") break;
      await page.waitForTimeout(pauseMs);
    }
  } catch {
    diagnostic = Object.freeze({ collected: false, reason: "observer-unavailable" });
  } finally {
    await browser?.close();
  }
  acceptance.depthFailureDiagnostic = diagnostic;
  await writeFile(acceptancePath, `${JSON.stringify(acceptance, null, 2)}\n`, "utf8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
