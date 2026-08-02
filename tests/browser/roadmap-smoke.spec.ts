import { expect, test } from "@playwright/test";

const owner = {
  username: `e2e_owner_${Date.now().toString(36)}`,
  password: "DizyTrades-E2E-2026!",
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
});

test("new owner account can persist a bounded market-only profile patch", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Username (optional)").fill(owner.username);
  await page.getByLabel("Password", { exact: true }).fill(owner.password);
  await page.getByLabel("Confirm password").fill(owner.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/terminal$/);

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
  await expect(page.getByText(owner.username, { exact: true })).toBeVisible();
  await expect(page.getByText(`${owner.username} · Viewer`, { exact: true })).toHaveCount(0);
});
