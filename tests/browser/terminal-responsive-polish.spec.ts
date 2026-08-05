import { expect, test, type Locator, type Page } from "@playwright/test";

const owner = {
  email: "e2e-owner@dizytrades.local",
  password: "DizyTrades-E2E-Owner-2026!",
};

async function dismissOnboarding(page: Page) {
  const backdrop = page.locator(".first-run-onboarding-backdrop");
  await backdrop.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  if (await backdrop.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Skip onboarding" }).click();
    await expect(backdrop).toBeHidden();
  }
}

async function loginOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Open DizyTrades" }).click();
  await expect(page).toHaveURL(/\/terminal$/);
  await dismissOnboarding(page);
}

async function contained(element: Locator) {
  return element.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    left: node.getBoundingClientRect().left,
    right: node.getBoundingClientRect().right,
  }));
}

test("terminal controls remain contained with DOM and settings open", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOwner(page);

  const topbar = page.locator(".topbar");
  const quickActions = page.locator(".global-quick-actions");
  await expect(quickActions).toBeVisible();
  const [topbarBox, quickBox] = await Promise.all([
    topbar.boundingBox(),
    quickActions.boundingBox(),
  ]);
  expect(topbarBox).not.toBeNull();
  expect(quickBox).not.toBeNull();
  expect(quickBox!.top).toBeGreaterThanOrEqual(topbarBox!.bottom);
  await expect(page.getByRole("button", { name: /Commands/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recent" })).toBeVisible();

  const flowGroup = page.locator(".flow-component-toggles");
  await expect(flowGroup).toBeVisible();
  const flowGeometry = await contained(flowGroup);
  expect(flowGeometry.scrollWidth).toBeLessThanOrEqual(flowGeometry.clientWidth + 1);

  const domToggle = flowGroup.getByRole("button", { name: "DOM", exact: true });
  if ((await domToggle.getAttribute("aria-pressed")) !== "true") {
    await domToggle.click();
  }
  const dom = page.locator(".dizyflow-dom");
  await expect(dom).toBeVisible();
  const workspace = page.locator(".workspace");
  const [workspaceGeometry, domGeometry] = await Promise.all([
    contained(workspace),
    contained(dom),
  ]);
  expect(domGeometry.right).toBeLessThanOrEqual(workspaceGeometry.right + 1);
  expect(domGeometry.scrollWidth).toBeLessThanOrEqual(domGeometry.clientWidth + 1);

  const domBook = page.locator(".dom-book");
  const domBookGeometry = await contained(domBook);
  expect(domBookGeometry.scrollWidth).toBeLessThanOrEqual(
    domBookGeometry.clientWidth + 1,
  );

  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.locator(".settings-panel")).toBeVisible();
  const signalDock = page.locator(".signal-dock");
  const dockGeometry = await contained(signalDock);
  expect(dockGeometry.scrollWidth).toBeLessThanOrEqual(dockGeometry.clientWidth + 1);
  const cards = signalDock.locator("article");
  await expect(cards).toHaveCount(5);
  for (const card of await cards.all()) {
    const cardGeometry = await contained(card);
    expect(cardGeometry.left).toBeGreaterThanOrEqual(dockGeometry.left - 1);
    expect(cardGeometry.right).toBeLessThanOrEqual(dockGeometry.right + 1);
  }
});

test("terminal workflow buttons and DizyFlow wrap without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await loginOwner(page);

  await expect(page.getByRole("button", { name: /Commands/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recent" })).toBeVisible();
  const flowGroup = page.locator(".flow-component-toggles");
  await expect(flowGroup).toBeVisible();

  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    flowClientWidth: document.querySelector<HTMLElement>(".flow-component-toggles")
      ?.clientWidth ?? 0,
    flowScrollWidth: document.querySelector<HTMLElement>(".flow-component-toggles")
      ?.scrollWidth ?? 0,
  }));

  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.flowScrollWidth).toBeLessThanOrEqual(
    geometry.flowClientWidth + 1,
  );
});
