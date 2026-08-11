import { expect, test, type Page } from "@playwright/test";

const testUser = {
  username: `topbar-polish-${Date.now()}`,
  password: "DizyTrades-Topbar-Polish-2026!",
};

type GeometryBox = {
  x: number;
  y: number;
  width: number;
  height: number;
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
  await page.goto("/signup");
  await page.getByLabel("Username (optional)").fill(testUser.username);
  await page.getByLabel("Password", { exact: true }).fill(testUser.password);
  await page.getByLabel("Confirm password").fill(testUser.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/terminal$/);
  await dismissOnboarding(page);
}

function right(box: GeometryBox) {
  return box.x + box.width;
}

function bottom(box: GeometryBox) {
  return box.y + box.height;
}

function overlaps(first: GeometryBox, second: GeometryBox) {
  return !(
    right(first) <= second.x ||
    right(second) <= first.x ||
    bottom(first) <= second.y ||
    bottom(second) <= first.y
  );
}

test("readable topbar retains local actions beneath the shared Dizy navigation and clears collapsed paper controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createStandardUser(page);

  const sharedNavigation = page.getByRole("navigation", {
    name: "Dizy product navigation",
  });
  const sharedLinks = sharedNavigation.getByRole("link");
  await expect(sharedNavigation).toBeVisible();
  expect(await sharedLinks.count()).toBeGreaterThanOrEqual(10);

  const topbar = page.locator(".topbar");
  const systemStrip = page.locator(".system-strip");
  const navItems = page.locator(".system-strip > .nav-tab:visible");
  await expect(topbar).toBeVisible();
  await expect(navItems.first()).toBeVisible();
  expect(await navItems.count()).toBeGreaterThanOrEqual(4);

  const topbarBox = await topbar.boundingBox();
  expect(topbarBox).not.toBeNull();
  for (const item of await navItems.all()) {
    const box = await item.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(right(box!)).toBeLessThanOrEqual(1440);
    expect(box!.y).toBeGreaterThanOrEqual(topbarBox!.y - 1);
    expect(bottom(box!)).toBeLessThanOrEqual(bottom(topbarBox!) + 1);
  }
  expect(
    await navItems.first().evaluate((node) => getComputedStyle(node).fontSize),
  ).toBe("9.5px");

  const statusBadges = page.locator(
    ".system-strip > .connection, .system-strip > .confirmed, .system-strip > .test-mode, .system-strip > .lock-status",
  );
  await expect(statusBadges).toHaveCount(4);
  const connectionBox = await statusBadges.first().boundingBox();
  expect(connectionBox).not.toBeNull();
  expect(connectionBox!.y).toBeGreaterThanOrEqual(topbarBox!.y - 1);
  expect(bottom(connectionBox!)).toBeLessThanOrEqual(bottom(topbarBox!) + 1);
  expect(
    await statusBadges.first().evaluate((node) => getComputedStyle(node).fontSize),
  ).toBe("9.25px");

  const quickActions = page.locator(".global-quick-actions");
  await expect(quickActions).toBeVisible();
  expect(
    await quickActions.evaluate((node) =>
      node.parentElement?.classList.contains("system-strip"),
    ),
  ).toBe(true);
  const [stripBox, quickBox] = await Promise.all([
    systemStrip.boundingBox(),
    quickActions.boundingBox(),
  ]);
  expect(stripBox).not.toBeNull();
  expect(quickBox).not.toBeNull();
  expect(quickBox!.x).toBeGreaterThanOrEqual(stripBox!.x - 1);
  expect(right(quickBox!)).toBeLessThanOrEqual(right(stripBox!) + 1);
  for (const badge of await statusBadges.all()) {
    const box = await badge.boundingBox();
    expect(box).not.toBeNull();
    expect(overlaps(box!, quickBox!)).toBe(false);
  }

  /* Wide or zoomed-out desktop: preserve the complete brand before local DizyCharts actions. */
  await page.setViewportSize({ width: 1800, height: 900 });
  const brand = page.locator(".brand-lockup");
  const brandSubtitle = page.locator(".brand-lockup small");
  await expect(brandSubtitle).toBeVisible();
  const [brandBox, firstNavBox] = await Promise.all([
    brand.boundingBox(),
    navItems.first().boundingBox(),
  ]);
  expect(brandBox).not.toBeNull();
  expect(firstNavBox).not.toBeNull();
  expect(right(brandBox!)).toBeLessThanOrEqual(firstNavBox!.x - 4);
  expect(
    await navItems.first().evaluate((node) => getComputedStyle(node).fontSize),
  ).toBe("10.25px");

  const minimise = page.getByRole("button", {
    name: "Minimise Manual Paper",
  });
  await expect(minimise).toBeVisible();
  await minimise.click();

  const panel = page.locator("#manual-paper-panel");
  const launcher = page.locator(".dizybrain-launch");
  await expect(panel).toBeVisible();
  await expect(launcher).toBeVisible();
  await expect(panel).not.toHaveAttribute("style", /height/);

  await expect
    .poll(async () => {
      const [panelBox, launcherBox] = await Promise.all([
        panel.boundingBox(),
        launcher.boundingBox(),
      ]);
      if (!panelBox || !launcherBox) return Number.NEGATIVE_INFINITY;
      return panelBox.y - bottom(launcherBox);
    })
    .toBeGreaterThanOrEqual(7);
});
