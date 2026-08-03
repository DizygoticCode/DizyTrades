import { expect, test } from "@playwright/test";

test("viewer navigates and opens verified keyboard help through the palette", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Open View-Only Terminal" }).click();
  await expect(page).toHaveURL(/\/terminal$/);

  const skip = page.getByRole("button", { name: "Skip onboarding" });
  if (await skip.isVisible().catch(() => false)) await skip.click();

  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "DizyTrades command palette" });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("option", { name: /Open DizyBackup/ })).toHaveCount(0);
  await palette.getByRole("combobox", { name: "Search commands" }).fill("scanner");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/scanner$/);
  await expect(page.getByRole("heading", { name: "Find current confluence without opening every chart." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Commands/ })).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "?",
      code: "Slash",
      shiftKey: true,
      bubbles: true,
    }));
  });
  const reference = page.getByRole("dialog", { name: "DizyTrades keyboard reference" });
  await expect(reference).toBeVisible();
  await expect(reference.locator("kbd").filter({ hasText: "Ctrl/Cmd + K" })).toBeVisible();
  await expect(reference.locator("kbd").filter({ hasText: "DOM: PgUp / PgDn" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reference).toHaveCount(0);

  await page.keyboard.press("Control+K");
  await palette.getByRole("combobox", { name: "Search commands" }).fill("DizyBrain");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/terminal$/);
  await expect(page.getByLabel("DizyBrain Analysis Workspace")).toBeVisible();
});
