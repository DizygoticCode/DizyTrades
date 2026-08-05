import { expect, test } from "@playwright/test";

const storageKey = "dizytrades:dizyquant-live:v1";
const storedSnapshot = (capturedAt: number) => ({
  schemaVersion: "dizyquant.live.v1",
  capturedAt,
  source: "derived-terminal-evidence",
  researchOnly: true,
  signalEligible: false,
  executionEligible: false,
  market: { symbol: "BTC_USDT", venue: "MEXC Perpetual", timeframe: "15m", feedState: "Live", replay: false },
  strategy: { timestamp: new Date(capturedAt).toISOString(), direction: "BUY", marketBias: "Bullish", marketPhase: "Accumulation", longScore: 4, shortScore: 1, qualificationThreshold: 3, qualified: true, confirmedSignal: "BUY", confidencePct: 80 },
  flow: { enabled: true, availability: "available", receivedAt: capturedAt, confidencePct: 70, confidenceBand: "moderate", referencePrice: 64_000, spreadPct: .0123, wallCount: 2, withdrawalCount: 1, replenishmentCount: 1, sweepCount: 1, absorptionCount: 0, limitationCount: 1 },
  factors: [
    { id: "strategy-balance", label: "Confirmed-candle balance", value: 60, unit: "%", evidence: "confirmed-candle", interpretation: "signed-pressure" },
    { id: "book-imbalance", label: "Visible book imbalance", value: 20, unit: "%", evidence: "snapshot", interpretation: "signed-pressure" },
    { id: "aggressor-imbalance", label: "Aggressor trade imbalance", value: -25, unit: "%", evidence: "continuous-stream", interpretation: "signed-pressure" },
    { id: "liquidity-balance", label: "Near-market liquidity balance", value: 20, unit: "%", evidence: "snapshot", interpretation: "signed-pressure" },
    { id: "spread-friction", label: "Spread friction", value: .0123, unit: "%", evidence: "snapshot", interpretation: "friction" },
  ],
  availableFactorCount: 5,
  totalFactorCount: 5,
  evidenceCoveragePct: 100,
  sourceConfidencePct: 75,
});

test("DizyQuant renders bounded live factors and marks expired evidence stale", async ({ page }) => {
  await page.addInitScript(({ key, snapshot }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(snapshot));
  }, { key: storageKey, snapshot: storedSnapshot(Date.now()) });
  await page.goto("/research");
  const panel = page.getByTestId("dizyquant-live-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-state", "live");
  await expect(panel).toContainText("BTC_USDT · 15m");
  await expect(panel).toContainText("Live terminal evidence");
  await expect(panel).toContainText("Confirmed-candle balance");
  await expect(panel).toContainText("+60.00%");
  await expect(panel).toContainText("Aggressor trade imbalance");
  await expect(panel).toContainText("-25.00%");
  await expect(panel).toContainText("Research-only observation");
  await expect(page.getByRole("button", { name: /order|trade|execute/i })).toHaveCount(0);

  await page.evaluate(({ key, snapshot }) => localStorage.setItem(key, JSON.stringify(snapshot)), { key: storageKey, snapshot: storedSnapshot(Date.now() - 60_000) });
  await page.reload();
  await expect(page.getByTestId("dizyquant-live-panel")).toHaveAttribute("data-state", "stale");
  await expect(page.getByTestId("dizyquant-live-panel")).toContainText("Stored evidence is stale");
});
