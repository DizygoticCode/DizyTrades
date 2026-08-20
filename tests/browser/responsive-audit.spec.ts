import { expect, test, type Page } from "@playwright/test";

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

async function loginViewer(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Open View-Only Terminal" }).click();
  await expect(page).toHaveURL(/\/terminal$/);
  await dismissOnboarding(page);
}

async function loginOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Open DizyTrades" }).click();
  await expect(page).toHaveURL(/\/terminal$/);
  await dismissOnboarding(page);
}

async function expectViewportContained(page: Page, route: string) {
  await page.goto(route);
  await expect(page).toHaveURL(new RegExp(`${route.replaceAll("/", "\\/")}$`));
  const terminal = route === "/terminal";
  const commands = page.getByRole("button", { name: /Commands/ });
  const recent = page.getByRole("button", { name: "Recent" });
  if (terminal) {
    await expect(commands).toBeVisible();
    await expect(recent).toBeVisible();
  } else {
    await expect(commands).toHaveCount(0);
    await expect(recent).toHaveCount(0);
  }

  const geometry = await page.evaluate(() => {
    const controls = [
      document.querySelector<HTMLElement>(".command-palette-floating"),
      document.querySelector<HTMLElement>(".recent-shortcuts-trigger"),
    ]
      .filter(
        (item): item is HTMLElement =>
          Boolean(item && item.getClientRects().length > 0),
      )
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
      terminal: Boolean(document.querySelector(".terminal-shell")),
      portaled: Boolean(
        document.querySelector(".system-strip > .global-quick-actions"),
      ),
      controls,
    };
  });

  expect(geometry.documentWidth, `${route} document overflow`).toBeLessThanOrEqual(
    geometry.viewportWidth + 1,
  );
  expect(geometry.bodyWidth, `${route} body overflow`).toBeLessThanOrEqual(
    geometry.viewportWidth + 1,
  );
  expect(geometry.controls).toHaveLength(terminal ? 2 : 0);
  if (!terminal) return;

  for (const control of geometry.controls) {
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(control.top).toBeGreaterThanOrEqual(0);
    expect(control.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(control.height).toBeGreaterThanOrEqual(
      geometry.portaled || geometry.terminal ? 32 : 40,
    );
  }
  const [first, second] = geometry.controls;
  expect(
    first.right <= second.left ||
      second.right <= first.left ||
      first.bottom <= second.top ||
      second.bottom <= first.top,
  ).toBe(true);
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
  await expect(page.getByRole("button", { name: /Commands/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recent" })).toHaveCount(0);
  // Ctrl+K remains global even where terminal-only visual quick actions are hidden.
  await page.keyboard.press("Control+K");
  await expectDialogContained(page, "DizyTrades command palette");
  await page.keyboard.press("Escape");

  await page.goto("/terminal");
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

test("terminal workflow triggers remain in the native strip clear of DizyBrain controls on desktop", async ({ page }) => {
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
      close: box(".brain-close"),
      strip: box(".system-strip"),
      commands: box(".command-palette-floating"),
      recent: box(".recent-shortcuts-trigger"),
    };
  });

  for (const control of [geometry.commands, geometry.recent]) {
    expect(control.left).toBeGreaterThanOrEqual(geometry.strip.left - 1);
    expect(control.right).toBeLessThanOrEqual(geometry.strip.right + 1);
    expect(control.top).toBeGreaterThanOrEqual(geometry.strip.top - 1);
    expect(control.bottom).toBeLessThanOrEqual(geometry.strip.bottom + 1);
    expect(
      control.right <= geometry.close.left ||
        control.left >= geometry.close.right ||
        control.bottom <= geometry.close.top ||
        control.top >= geometry.close.bottom,
    ).toBe(true);
  }

  await close.click();
  await expect(workspace).toBeHidden();
});
