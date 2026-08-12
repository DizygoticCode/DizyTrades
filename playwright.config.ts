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
          FRIEND_NAME: "E2E Admin",
          FRIEND_EMAIL: "e2e-admin@dizytrades.local",
          FRIEND_PASSWORD: "DizyTrades-E2E-Admin-2026!",
          // Browser signup tests need the mail boundary configured so the real
          // route creates a pending-verification account. Port 1 is intentionally
          // closed: delivery fails fast and is recorded as undelivered without
          // contacting an external mail service.
          SMTP_HOST: "127.0.0.1",
          SMTP_PORT: "1",
          SMTP_USER: "e2e-mailer@dizytrades.local",
          SMTP_APP_PASSWORD: "e2e-only-not-a-real-secret",
          MAIL_FROM: "DizyTrades E2E <e2e-mailer@dizytrades.local>",
          APP_BASE_URL: baseURL,
        },
      },
});
