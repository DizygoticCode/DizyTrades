import { expect, test } from "@playwright/test";

test("scanner and structure expose actionable catalogue recovery states", async ({ page }) => {
  await page.route("**/api/markets?exchange=mexc", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "catalogue unavailable in recovery-state test" }),
    });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Open View-Only Terminal" }).click();
  await expect(page).toHaveURL(/\/terminal$/);

  await page.goto("/scanner");
  const scannerState = page.locator(
    '[data-workspace-state-polish][data-workspace="scanner"]',
  );
  await expect(scannerState).toBeVisible();
  await expect(scannerState).toHaveAttribute("data-state-kind", "offline");
  await expect(
    scannerState.getByText("Market catalogue unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    scannerState.getByRole("button", { name: "Retry scanner" }),
  ).toBeVisible();
  await expect(scannerState.getByText(/saved watchlist remain available/i)).toBeVisible();
  await scannerState.getByRole("button", { name: /Dismiss Market catalogue unavailable/ }).click();
  await expect(scannerState).toHaveCount(0);

  await page.goto("/structure");
  const structureState = page.locator(
    '[data-workspace-state-polish][data-workspace="structure"]',
  );
  await expect(structureState).toBeVisible();
  await expect(structureState).toHaveAttribute("data-state-kind", "offline");
  await expect(
    structureState.getByRole("button", { name: "Retry structure" }),
  ).toBeVisible();
  await expect(
    structureState.getByText(/last completed structure calculation remains visible/i),
  ).toBeVisible();
});
