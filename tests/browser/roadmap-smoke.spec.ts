import { expect, test } from "@playwright/test";
import { createVerifiedBrowserUser } from "./account-fixture";

const user = {
  username: `e2e_user_${Date.now().toString(36)}`,
  email: `e2e-user-${Date.now().toString(36)}@example.test`,
  password: "DizyTrades-E2E-2026!",
};
const owner = {
  email: "e2e-owner@dizytrades.local",
  password: "DizyTrades-E2E-Owner-2026!",
};

test.describe.configure({ mode: "serial" });

test("protected workspaces redirect unauthenticated visitors", async ({ page }) => {
  await page.goto("/scanner");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("viewer session navigates the roadmap and remains read-only", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Open View-Only Terminal" }).click();
  await expect(page).toHaveURL(/\/terminal$/);

  const onboarding = page.getByRole("dialog", {
    name: /Welcome to DizyTrades/,
  });
  await expect(onboarding).toBeVisible();
  await expect(
    onboarding.getByText("Simulation and education only.", { exact: true }),
  ).toBeVisible();
  await expect(
    onboarding.getByRole("link", { name: /Open DizyAcademy/ }),
  ).toBeVisible();
  await expect(
    onboarding.getByRole("button", { name: /Open Manual Paper/ }),
  ).toBeVisible();
  await onboarding
    .getByRole("button", { name: /Continue to terminal/ })
    .click();
  await expect(onboarding).toBeHidden();

  const startHere = page.getByRole("button", {
    name: "Start Here",
    exact: true,
  });
  await expect(startHere).toBeVisible();
  await startHere.click();
  await expect(onboarding).toBeVisible();
  await onboarding.getByRole("button", { name: "Skip onboarding" }).click();
  await expect(onboarding).toBeHidden();

  const brainLauncher = page.getByRole("button", {
    name: "DizyBrain Explain this market",
    exact: true,
  });
  await expect(brainLauncher).toBeVisible();
  await brainLauncher.click();
  const brain = page.getByLabel("DizyBrain Analysis Workspace");
  await expect(brain.getByText("Current market read", { exact: true })).toBeVisible();
  await expect(brain.getByText(/Setup ready|Watch|Setup forming|No setup|Review mode/)).toBeVisible();
  await expect(brain.getByText("Why DizyBrain says that", { exact: true })).toBeVisible();
  await expect(brain.getByText("Detailed evidence", { exact: true })).toBeVisible();
  await brain.getByRole("button", { name: "Close DizyBrain workspace" }).click();

  await expect(page.getByRole("link", { name: /DizyScanner/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /DizyStructure/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /DizyPerformance/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /DizyJournal/ })).toBeVisible();

  const rejected = await page.request.patch("/api/profile", {
    data: { timeframe: "15m" },
  });
  expect(rejected.status()).toBe(403);
  await expect(rejected.json()).resolves.toMatchObject({
    error: "Viewer sessions are read-only.",
  });

  expect((await page.request.get("/api/admin/diagnostics")).status()).toBe(403);
  expect((await page.request.get("/api/backup/export")).status()).toBe(403);

  await page.goto("/scanner");
  await expect(
    page.getByRole("heading", {
      name: "Find current confluence without opening every chart.",
    }),
  ).toBeVisible();
  await expect(page.getByText(/Viewer/).first()).toBeVisible();

  await page.evaluate(() => {
    sessionStorage.setItem("dizy-viewer-market", "{corrupted-json");
    sessionStorage.setItem("dizy-scanner-watchlist", "{corrupted-json");
  });

  await page.goto("/structure");
  await expect(
    page.getByRole("heading", {
      name: "Sessions, anchored value and multi-timeframe structure in one workspace.",
    }),
  ).toBeVisible();
  await expect(page.getByText(/Viewer/).first()).toBeVisible();

  await page.goto("/diagnostics");
  await expect(page).toHaveURL(/\/terminal$/);
  await page.goto("/backup");
  await expect(page).toHaveURL(/\/terminal$/);
});

test("new user can persist profile data and validate a same-account backup", async ({ page }) => {
  await createVerifiedBrowserUser(page, user);

  const beforeResponse = await page.request.get("/api/profile");
  expect(beforeResponse.status()).toBe(200);
  const before = (await beforeResponse.json()) as {
    settings: Record<string, unknown> & {
      market: Record<string, unknown>;
      strategy: unknown;
      risk: unknown;
      orderFlow: unknown;
    };
  };

  const patchResponse = await page.request.patch("/api/profile", {
    data: {
      symbol: "BTC_USDT",
      marketKey: "mexc:futures:BTC_USDT",
      timeframe: "15m",
      favourites: [
        "mexc:futures:BTC_USDT",
        "mexc:futures:BTC_USDT",
      ],
    },
  });
  expect(patchResponse.status()).toBe(200);
  const patched = (await patchResponse.json()) as {
    settings: typeof before.settings;
  };

  expect(patched.settings.market).toMatchObject({
    exchange: "mexc",
    symbol: "BTC_USDT",
    marketKey: "mexc:futures:BTC_USDT",
    timeframe: "15m",
    favourites: ["mexc:futures:BTC_USDT"],
  });
  expect(patched.settings.strategy).toEqual(before.settings.strategy);
  expect(patched.settings.risk).toEqual(before.settings.risk);
  expect(patched.settings.orderFlow).toEqual(before.settings.orderFlow);

  await page.goto("/scanner");
  await expect(page.getByText(user.username, { exact: true })).toBeVisible();
  await expect(page.getByText(`${user.username} · Viewer`, { exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/admin/diagnostics")).status()).toBe(403);

  const exportResponse = await page.request.get("/api/backup/export");
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()["content-type"]).toContain("application/json");
  const backup = await exportResponse.json();
  expect(backup).toMatchObject({
    version: 2,
    application: { name: "DizyTrades" },
    data: { profile: { settings: { market: { symbol: "BTC_USDT" } } } },
    integrity: { algorithm: "sha256" },
  });

  const dryRun = await page.request.post("/api/backup/restore", {
    data: { dryRun: true, backup },
  });
  expect(dryRun.status()).toBe(200);
  await expect(dryRun.json()).resolves.toMatchObject({
    dryRun: true,
    plan: { safeToApply: true, journal: { entriesToAdd: 0 } },
  });

  await page.goto("/backup");
  await expect(
    page.getByRole("heading", {
      name: "Back up the evidence chain, not merely the notes.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Download full JSON backup" })).toBeVisible();
});

test("configured owner can open production diagnostics", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Open DizyTrades" }).click();
  await expect(page).toHaveURL(/\/terminal$/);

  const diagnosticsResponse = await page.request.get("/api/admin/diagnostics");
  expect(diagnosticsResponse.status()).toBe(200);
  await expect(diagnosticsResponse.json()).resolves.toMatchObject({
    version: 1,
    configuration: { liveTradingEnabled: false },
    storage: { readable: true, writable: true },
  });

  await page.goto("/diagnostics");
  await expect(
    page.getByRole("heading", {
      name: "Know what is deployed, retained and degraded.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Live execution")).toBeVisible();
});
