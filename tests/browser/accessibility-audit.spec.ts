import { expect, test, type Locator, type Page } from "@playwright/test";

async function loginViewer(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Open View-Only Terminal" }).click();
  await expect(page).toHaveURL(/\/terminal$/);
  const skip = page.getByRole("button", { name: "Skip onboarding" });
  const appeared = await skip
    .waitFor({ state: "visible", timeout: 1_500 })
    .then(() => true)
    .catch(() => false);
  if (appeared) await skip.click();
  await expect(page.locator(".first-run-onboarding-backdrop")).toHaveCount(0);
}

async function lastFocusable(dialog: Locator) {
  return dialog
    .locator(
      'a[href]:visible, button:not([disabled]):visible, input:not([disabled]):visible, select:not([disabled]):visible, textarea:not([disabled]):visible, [tabindex]:not([tabindex="-1"]):visible',
    )
    .last();
}

test("protected workspace supports skip navigation and trapped modal focus", async ({ page }) => {
  await loginViewer(page);

  await page.locator("body").focus();
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  const main = page.locator("main#main-content");
  await expect(main).toHaveAttribute("tabindex", "-1");
  await expect(main).toBeFocused();

  const commandsTrigger = page.getByRole("button", { name: /Commands/ });
  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", {
    name: "DizyTrades command palette",
  });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  const search = dialog.getByRole("combobox", { name: "Search commands" });
  await expect(search).toBeFocused();

  const close = dialog.getByRole("button", { name: "Close command palette" });
  const last = await lastFocusable(dialog);
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(commandsTrigger).toBeFocused();

  const recentTrigger = page.getByRole("button", { name: "Recent" });
  await recentTrigger.click();
  const recentDialog = page.getByRole("dialog", {
    name: "DizyTrades recent shortcuts",
  });
  await expect(recentDialog).toHaveAttribute("aria-modal", "true");
  await expect(recentDialog).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(recentDialog).toHaveCount(0);
  await expect(recentTrigger).toBeFocused();
});

test("protected workspaces expose visible focus and reduced-motion behaviour", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loginViewer(page);

  const trigger = page.getByRole("button", { name: /Commands/ });
  await trigger.focus();
  const focusStyle = await trigger.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      transitionDuration: style.transitionDuration,
      animationDuration: style.animationDuration,
    };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(3);
  expect(focusStyle.transitionDuration).toMatch(/0\.00001s|0s/);
  expect(focusStyle.animationDuration).toMatch(/0\.00001s|0s/);

  await page.goto("/scanner");
  await expect(page.locator("main#main-content")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("status").first()).not.toBeEmpty();
});
