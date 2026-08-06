import { expect, test } from "@playwright/test";

const dismissOnboarding = async (page: import("@playwright/test").Page) => {
  const onboarding = page.locator(".first-run-onboarding-backdrop");
  const opened = await onboarding
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!opened) return;
  await onboarding.getByRole("button", { name: "Skip onboarding" }).click();
  await expect(onboarding).toBeHidden();
};

const openTerminal = async (page: import("@playwright/test").Page) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Open View-Only Terminal" }).click();
  await expect(page).toHaveURL(/\/terminal$/);
  await dismissOnboarding(page);
};

test("the terminal repaints DizyFlow after delayed persisted settings hydrate", async ({ page }) => {
  await openTerminal(page);

  const toolbar = page.locator(".dizyflow-controls");
  const master = toolbar.locator(".dizyflow-master");
  await expect(toolbar).toHaveAttribute("data-flow-primitive-attached", "true");

  if ((await master.getAttribute("aria-pressed")) === "true") await master.click();
  await expect(master).toHaveAttribute("aria-pressed", "false");
  await expect(toolbar).toHaveAttribute("data-flow-snapshot-enabled", "false");
  await expect(toolbar).toHaveAttribute("data-flow-render-enabled", "false");

  await master.click();
  await expect(master).toHaveAttribute("aria-pressed", "true");
  await expect(toolbar).toHaveAttribute("data-flow-snapshot-enabled", "true");
  await expect(toolbar).toHaveAttribute("data-flow-render-enabled", "true");
  await expect
    .poll(async () => Number(await toolbar.getAttribute("data-flow-paint-call-count")))
    .toBeGreaterThan(0);

  await page.route("**/api/profile", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const payload = await response.json();
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.fulfill({
      response,
      json: {
        ...payload,
        settings: {
          ...payload.settings,
          orderFlow: {
            ...payload.settings.orderFlow,
            enabled: true,
          },
        },
      },
    });
  });

  await page.reload();
  await expect(page).toHaveURL(/\/terminal$/);
  await expect(toolbar).toHaveAttribute("data-flow-primitive-attached", "true");
  await expect(master).toHaveAttribute("aria-pressed", "true");
  await expect(toolbar).toHaveAttribute("data-flow-snapshot-enabled", "true");
  await expect(toolbar).toHaveAttribute("data-flow-render-enabled", "true");
  await expect
    .poll(async () => Number(await toolbar.getAttribute("data-flow-paint-call-count")))
    .toBeGreaterThan(0);

  await master.click();
  await expect(master).toHaveAttribute("aria-pressed", "false");
  await expect(toolbar).toHaveAttribute("data-flow-render-enabled", "false");
});
