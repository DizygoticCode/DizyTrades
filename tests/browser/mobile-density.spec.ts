import { expect, test, type Page } from "@playwright/test";

async function dismissOnboarding(page: Page) {
  const backdrop = page.locator(".first-run-onboarding-backdrop");
  await backdrop.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  if (await backdrop.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Skip onboarding" }).click();
    await expect(backdrop).toBeHidden();
  }
}

async function loginViewer(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Open View-Only Terminal" }).click();
  await expect(page).toHaveURL(/\/terminal$/);
  await dismissOnboarding(page);
}

async function heightOf(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) =>
    element.getBoundingClientRect().height,
  );
}

test("phone terminal defaults to calm chrome and reveals dense tools on demand", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await loginViewer(page);

  const rail = page.getByRole("navigation", { name: "Compact terminal controls" });
  await expect(rail).toBeVisible();
  await expect(page.locator(".drawing-toolbar")).toBeHidden();
  await expect(page.locator(".signal-dock")).toBeHidden();
  await expect(page.locator(".replay-controls:not(.active)")).toBeHidden();

  await expect
    .poll(() => heightOf(page, "#manual-paper-panel"))
    .toBeLessThanOrEqual(40);

  const productNavHeight = await heightOf(page, '[data-testid="dizy-product-navigation"]');
  expect(productNavHeight).toBeLessThanOrEqual(46);

  const initialChartHeight = await heightOf(page, ".chart-wrap");
  expect(initialChartHeight).toBeGreaterThanOrEqual(160);

  const tools = rail.getByRole("button", { name: "Tools" });
  await tools.click();
  await expect(tools).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".drawing-toolbar")).toBeVisible();
  await expect(page.locator(".signal-dock")).toBeHidden();
  expect(await heightOf(page, ".chart-wrap")).toBeGreaterThanOrEqual(120);

  const signal = rail.getByRole("button").nth(1);
  await signal.click();
  await expect(signal).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".drawing-toolbar")).toBeHidden();
  await expect(page.locator(".signal-dock")).toBeVisible();
  expect(await heightOf(page, ".signal-dock")).toBeLessThanOrEqual(44);

  const paper = rail.getByRole("button", { name: "Paper" });
  await paper.click();
  await expect
    .poll(() => heightOf(page, "#manual-paper-panel"))
    .toBeGreaterThan(100);
  await paper.click();
  await expect
    .poll(() => heightOf(page, "#manual-paper-panel"))
    .toBeLessThanOrEqual(40);

  const overflow = await page.evaluate(() => ({
    width: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.width + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.width + 1);
});
