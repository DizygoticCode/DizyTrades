import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  outputDir: "artifacts/playwright/test-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/playwright/report", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          SESSION_SECRET:
            process.env.SESSION_SECRET ??
            "dizytrades-e2e-session-secret-2026-at-least-32-characters",
          PUBLIC_SIGNUP_ENABLED: "true",
          ALLOW_TEST_PLAINTEXT_PASSWORDS: "true",
          LEGACY_AUTH_FALLBACK_ENABLED: "true",
          LIVE_TRADING_ENABLED: "false",
          ROB_NAME: "E2E Owner",
          ROB_EMAIL: "e2e-owner@dizytrades.local",
          ROB_PASSWORD: "DizyTrades-E2E-Owner-2026!",
        },
      },
});
