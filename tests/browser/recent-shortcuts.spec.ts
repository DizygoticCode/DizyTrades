import { expect, test } from "@playwright/test";

const owner = {
  email: "e2e-owner@dizytrades.local",
  password: "DizyTrades-E2E-Owner-2026!",
};

test("owner continues recent markets reviews and Academy learning", async ({ page }) => {
  const reviewTitle = `Recent review ${Date.now().toString(36)}`;
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Open DizyTrades" }).click();
  await expect(page).toHaveURL(/\/terminal$/);

  const skip = page.getByRole("button", { name: "Skip onboarding" });
  if (await skip.isVisible().catch(() => false)) await skip.click();

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
  await expect(dialog.getByRole("link", { name: new RegExp(reviewTitle) })).toHaveAttribute(
    "href",
    /\/journal\?entry=/,
  );

  await dialog.getByRole("button", { name: /ETH\/USDT/ }).click();
  await expect(page).toHaveURL(/\/terminal$/);
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
