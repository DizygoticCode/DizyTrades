import { expect, test, type Page } from "@playwright/test";
import { createVerifiedBrowserUser } from "./account-fixture";

const testUser = {
  username: `issue-377-${Date.now()}`,
  email: `issue-377-${Date.now()}@example.test`,
  password: "DizyTrades-Issue-377-2026!",
};

async function dismissOnboarding(page: Page) {
  const backdrop = page.locator(".first-run-onboarding-backdrop");
  await backdrop.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  if (await backdrop.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Skip onboarding" }).click();
    await expect(backdrop).toBeHidden();
  }
}

async function createStandardUser(page: Page) {
  await createVerifiedBrowserUser(page, testUser);
  await dismissOnboarding(page);
}

async function expectNoPageOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewport + 1);
}

test("terminal interaction audit keeps overlays, drawings and mobile chrome contained", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await createStandardUser(page);

  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: "Open settings" }).click();
  const settings = page.locator(".settings-panel");
  await expect(settings).toBeVisible();

  const layerLabels = [
    "Show Rolling VWAP",
    "Show Fibonacci levels",
    "Show Regression channel",
    "Show Pivot trendlines",
    "Show Triangle outlines",
    "Show Completed pattern fills",
    "Show Right volume profile",
    "Show Elliott/Wyckoff stage bubbles",
    "Show BUY/SELL signal bubbles",
  ];

  for (const label of layerLabels) {
    const toggle = page.getByLabel(label);
    await expect(toggle).toBeVisible();
    const original = await toggle.isChecked();
    await toggle.click();
    await expect(toggle).toBeChecked({ checked: !original });
    await toggle.click();
    await expect(toggle).toBeChecked({ checked: original });
  }

  const panelGeometry = await settings.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      overflowY: getComputedStyle(node).overflowY,
    };
  });
  expect(panelGeometry.left).toBeGreaterThanOrEqual(0);
  expect(panelGeometry.right).toBeLessThanOrEqual(panelGeometry.viewportWidth + 1);
  expect(panelGeometry.top).toBeGreaterThanOrEqual(0);
  expect(panelGeometry.bottom).toBeLessThanOrEqual(panelGeometry.viewportHeight + 1);
  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(settings).toBeHidden();

  const toolbar = page.getByRole("complementary", { name: "Drawing tools" });
  await expect(toolbar).toBeVisible();

  for (const name of [
    "Trend line",
    "Horizontal line",
    "Parallel channel",
    "Fibonacci retracement",
  ]) {
    const tool = toolbar.getByRole("button", { name });
    await expect(tool).toBeEnabled();
    await tool.click();
    await expect(tool).toHaveClass(/active/);
  }

  await toolbar.getByRole("button", { name: "Horizontal line" }).click();
  const canvas = page.getByLabel("Manual drawing interaction layer");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * 0.45, box!.y + box!.height * 0.45);

  await expect(page.getByRole("complementary", { name: "Drawing properties" })).toBeVisible();
  const undo = toolbar.getByRole("button", { name: "Undo" });
  await expect(undo).toBeEnabled();
  await undo.click();

  const magnet = toolbar.getByLabel("Magnet snapping");
  await magnet.selectOption("strong");
  await expect(magnet).toHaveValue("strong");
  await magnet.selectOption("weak");
  await expect(magnet).toHaveValue("weak");

  await page.setViewportSize({ width: 390, height: 844 });
  const compact = page.getByRole("navigation", { name: "Compact terminal controls" });
  await expect(compact).toBeVisible();

  const tools = compact.getByRole("button", { name: "Tools" });
  if ((await tools.getAttribute("aria-expanded")) !== "true") await tools.click();
  await expect(tools).toHaveAttribute("aria-expanded", "true");
  await expect(toolbar).toBeVisible();

  const mobileGeometry = await page.evaluate(() => {
    const box = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`Missing ${selector}`);
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    };
    const quick = document.querySelector<HTMLElement>(".global-quick-actions");
    const strip = document.querySelector<HTMLElement>(".system-strip");
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      toolbar: box(".drawing-toolbar"),
      quick: quick ? box(".global-quick-actions") : null,
      quickParentIsStrip: quick?.parentElement === strip,
      stripOverflowX: strip ? getComputedStyle(strip).overflowX : "",
    };
  });

  expect(mobileGeometry.toolbar.left).toBeGreaterThanOrEqual(0);
  expect(mobileGeometry.toolbar.right).toBeLessThanOrEqual(mobileGeometry.viewportWidth + 1);
  expect(mobileGeometry.toolbar.top).toBeGreaterThanOrEqual(0);
  expect(mobileGeometry.toolbar.bottom).toBeLessThanOrEqual(mobileGeometry.viewportHeight + 1);
  expect(mobileGeometry.quickParentIsStrip).toBe(true);
  expect(["auto", "scroll"]).toContain(mobileGeometry.stripOverflowX);
  if (mobileGeometry.quick) {
    expect(mobileGeometry.quick.left).toBeGreaterThanOrEqual(0);
    expect(mobileGeometry.quick.right).toBeLessThanOrEqual(mobileGeometry.viewportWidth + 1);
  }

  await expectNoPageOverflow(page);
});
