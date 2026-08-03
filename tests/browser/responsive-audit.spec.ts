import { expect, test, type Page } from "@playwright/test";

const owner = {
  email: "e2e-owner@dizytrades.local",
  password: "DizyTrades-E2E-Owner-2026!",
};

async function loginViewer(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Open View-Only Terminal" }).click();
  await expect(page).toHaveURL(/\/terminal$/);
  const skip = page.getByRole("button", { name: "Skip onboarding" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function loginOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Open DizyTrades" }).click();
  await expect(page).toHaveURL(/\/terminal$/);
  const skip = page.getByRole("button", { name: "Skip onboarding" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function expectViewportContained(page: Page, route: string) {
  await page.goto(route);
  await expect(page).toHaveURL(new RegExp(`${route.replaceAll("/", "\\/")}$`));
  await expect(page.getByRole("button", { name: /Commands/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recent" })).toBeVisible();

  const geometry = await page.evaluate(() => {
    const controls = [
      document.querySelector<HTMLElement>(".command-palette-floating"),
      document.querySelector<HTMLElement>(".recent-shortcuts-trigger"),
    ]
      .filter((item): item is HTMLElement => Boolean(item))
      .map((item) => {
        const box = item.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
        };
      });
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      controls,
    };
  });

  expect(geometry.documentWidth, `${route} document overflow`).toBeLessThanOrEqual(
    geometry.viewportWidth + 1,
  );
  expect(geometry.bodyWidth, `${route} body overflow`).toBeLessThanOrEqual(
    geometry.viewportWidth + 1,
  );
  expect(geometry.controls).toHaveLength(2);
  for (const control of geometry.controls) {
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(control.top).toBeGreaterThanOrEqual(0);
    expect(control.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(control.height).toBeGreaterThanOrEqual(40);
  }
  expect(geometry.controls[0].bottom <= geometry.controls[1].top || geometry.controls[1].bottom <= geometry.controls[0].top).toBe(true);
}

async function expectDialogContained(page: Page, name: string) {
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  const geometry = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      overflowY: style.overflowY,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  if (geometry.scrollHeight > geometry.clientHeight) {
    expect(["auto", "scroll"]).toContain(geometry.overflowY);
  }
}

test("viewer workspaces remain contained and reachable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await loginViewer(page);

  for (const route of [
    "/terminal",
    "/scanner",
    "/structure",
    "/performance",
    "/journal",
    "/school",
  ]) {
    await expectViewportContained(page, route);
  }

  await page.goto("/scanner");
  await expect(page.getByRole("button", { name: /Commands/ })).toBeVisible();
  // Ctrl+K is the product shortcut and avoids Next's development overlay
  // occasionally intercepting a physical click in the test environment.
  await page.keyboard.press("Control+K");
  await expectDialogContained(page, "DizyTrades command palette");
  await page.keyboard.press("Escape");

  await expect(page.getByRole("button", { name: "Recent" })).toBeVisible();
  await page.locator(".recent-shortcuts-trigger").evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expectDialogContained(page, "DizyTrades recent shortcuts");
  const columns = await page
    .locator(".recent-shortcuts-grid")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(columns.trim().split(/\s+/)).toHaveLength(1);
});

test("owner operations remain usable on phone and small-tablet widths", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginOwner(page);
  await expectViewportContained(page, "/backup");
  await expectViewportContained(page, "/diagnostics");

  await page.setViewportSize({ width: 760, height: 900 });
  for (const route of ["/terminal", "/scanner", "/structure", "/performance"]) {
    await expectViewportContained(page, route);
  }
});

test("global workflow triggers clear of DizyBrain controls on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOwner(page);
  await page.locator(".dizybrain-launch").click();

  const workspace = page.locator("#dizybrain-workspace");
  const close = page.locator(".brain-close");
  await expect(workspace).toBeVisible();
  await expect(close).toBeVisible();
  await expect(page.locator(".command-palette-floating")).toBeVisible();
  await expect(page.locator(".recent-shortcuts-trigger")).toBeVisible();

  await expect
    .poll(async () => page.evaluate(() => document.body.getAttribute("data-dizybrain-tool-offset")))
    .toBe("true");

  const geometry = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
    };
    return {
      workspace: box("#dizybrain-workspace"),
      close: box(".brain-close"),
      commands: box(".command-palette-floating"),
      recent: box(".recent-shortcuts-trigger"),
    };
  });

  expect(geometry.commands.right).toBeLessThanOrEqual(geometry.workspace.left - 8);
  expect(geometry.recent.right).toBeLessThanOrEqual(geometry.workspace.left - 8);
  expect(geometry.commands.right <= geometry.close.left || geometry.commands.left >= geometry.close.right).toBe(true);
  expect(geometry.recent.right <= geometry.close.left || geometry.recent.left >= geometry.close.right).toBe(true);

  await close.click();
  await expect(workspace).toBeHidden();
});
