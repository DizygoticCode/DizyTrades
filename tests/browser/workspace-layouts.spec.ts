import { expect, test } from "@playwright/test";

const owner = {
  email: "e2e-owner@dizytrades.local",
  password: "DizyTrades-E2E-Owner-2026!",
};

test("owner can save update and delete a named terminal workspace", async ({ page }) => {
  const name = `E2E workspace ${Date.now().toString(36)}`;
  // This layout test runs late in the serial Chromium suite, after the real
  // loopback login limiter has already been exercised by auth-focused tests.
  // Give this independent browser fixture its own proxy IP rather than
  // weakening or bypassing the production limiter.
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": "192.0.2.59" });
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Open DizyTrades" }).click();
  await expect(page).toHaveURL(/\/terminal$/);

  const layoutsButton = page.getByRole("button", { name: "Layouts" });
  await expect(layoutsButton).toBeVisible();
  const skip = page.getByRole("button", { name: "Skip onboarding" });
  if (await skip.isVisible().catch(() => false)) await skip.click();

  await layoutsButton.click();
  const dialog = page.getByRole("dialog", {
    name: "Save the whole setup, not just the symbol.",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Built-in presets", { exact: true })).toBeVisible();

  await dialog.getByLabel("Workspace name").fill(name);
  await dialog.getByRole("button", { name: "Save current" }).click();
  await expect(dialog.getByRole("status")).toContainText(`Saved ${name}.`);
  const saved = dialog.locator("article").filter({ hasText: name });
  await expect(saved).toContainText("BTC_USDT");
  await expect(saved.getByRole("button", { name: "Apply" })).toBeVisible();

  await dialog.getByLabel("Workspace name").fill(name.toUpperCase());
  await dialog.getByRole("button", { name: "Save current" }).click();
  await expect(dialog.getByRole("status")).toContainText(`Updated ${name.toUpperCase()}.`);
  await expect(dialog.locator("article").filter({ hasText: name.toUpperCase() })).toHaveCount(1);

  const updated = dialog.locator("article").filter({ hasText: name.toUpperCase() });
  await updated.getByRole("button", { name: "Delete" }).click();
  await expect(dialog.getByRole("status")).toContainText(`Deleted ${name.toUpperCase()}.`);
  await expect(dialog.locator("article").filter({ hasText: name.toUpperCase() })).toHaveCount(0);
});