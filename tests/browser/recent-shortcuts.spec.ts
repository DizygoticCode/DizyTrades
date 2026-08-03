import { expect, test, type Page } from "@playwright/test";

const owner = {
  email: "e2e-owner@dizytrades.local",
  password: "DizyTrades-E2E-Owner-2026!",
};

async function dismissOnboarding(page: Page) {
  const skip = page.getByRole("button", { name: "Skip onboarding" });
  const appeared = await skip
    .waitFor({ state: "visible", timeout: 1_500 })
    .then(() => true)
    .catch(() => false);
  if (appeared) await skip.click();
  await expect(page.locator(".first-run-onboarding-backdrop")).toHaveCount(0);
}

test.afterEach(async ({ page }) => {
  // The browser suite reuses one configured owner. Restore its baseline market
  // even when this journey fails so later workspace tests remain independent.
  await page.request.patch("/api/profile", {
    data: {
      symbol: "BTC_USDT",
      marketKey: "mexc:futures:BTC_USDT",
      timeframe: "15m",
    },
  }).catch(() => undefined);
});

test("owner continues recent markets reviews and Academy learning", async ({ page }) => {
  const reviewTitle = `Recent review ${Date.now().toString(36)}`;
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Open DizyTrades" }).click();
  await expect(page).toHaveURL(/\/terminal$/);
  await dismissOnboarding(page);

  const journal = await page.request.post("/api/journal", {
    data: {
      type: "general",
      title: reviewTitle,
      notes: "Retained for recent-shortcut browser coverage.",
      tags: ["recent-shortcut"],
    },
  });
  expect(journal.status()).toBe(201);

  for (const market of [
    {
      symbol: "ETH_USDT",
      marketKey: "mexc:futures:ETH_USDT",
      timeframe: "1h",
    },
    {
      symbol: "SOL_USDT",
      marketKey: "mexc:futures:SOL_USDT",
      timeframe: "4h",
    },
  ]) {
    const response = await page.request.patch("/api/profile", { data: market });
    expect(response.status()).toBe(200);
  }

  await page.evaluate(() => {
    localStorage.setItem("dizyacademy-last-lesson-v1", "dizyscanner-watchlists");
    localStorage.setItem("dizyacademy-progress-v3", JSON.stringify([]));
  });
  await page.reload();
  await dismissOnboarding(page);
  await expect(page.getByRole("button", { name: "Recent" })).toBeVisible();
  await page.getByRole("button", { name: "Recent" }).click();

  const dialog = page.getByRole("dialog", { name: "DizyTrades recent shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("SOL/USDT", { exact: true })).toBeVisible();
  await expect(dialog.getByText("ETH/USDT", { exact: true })).toBeVisible();
  await expect(dialog.getByText(reviewTitle, { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("DizyScanner and saved watchlists", { exact: true }),
  ).toBeVisible();

  const reviewLink = dialog.getByRole("link", { name: new RegExp(reviewTitle) });
  await expect(reviewLink).toHaveAttribute("href", /\/journal\?entry=/);
  await reviewLink.click();
  await expect(page).toHaveURL(/\/journal\?entry=/);
  await expect(page.locator(".journal-detail input").first()).toHaveValue(reviewTitle);

  await page.goto("/terminal");
  await dismissOnboarding(page);
  await expect(page.getByRole("button", { name: "Recent" })).toBeVisible();
  await page.getByRole("button", { name: "Recent" }).click();
  await page
    .getByRole("dialog", { name: "DizyTrades recent shortcuts" })
    .getByRole("button", { name: /ETH\/USDT/ })
    .click();
  await expect(page).toHaveURL(/\/terminal$/);
  await dismissOnboarding(page);
  const profile = await page.request.get("/api/profile");
  expect(profile.status()).toBe(200);
  await expect(profile.json()).resolves.toMatchObject({
    settings: {
      market: {
        symbol: "ETH_USDT",
        marketKey: "mexc:futures:ETH_USDT",
        timeframe: "1h",
      },
    },
  });

  await page.getByRole("button", { name: "Recent" }).click();
  await page
    .getByRole("dialog", { name: "DizyTrades recent shortcuts" })
    .getByRole("link", { name: /DizyScanner and saved watchlists/ })
    .click();
  await expect(page).toHaveURL(/\/school\?lesson=dizyscanner-watchlists$/);
  await expect(
    page.getByLabel("DizyAcademy lesson: DizyScanner and saved watchlists"),
  ).toBeVisible();
});
