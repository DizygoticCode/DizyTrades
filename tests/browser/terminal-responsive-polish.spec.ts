import { expect, test, type Locator, type Page } from "@playwright/test";
import { createVerifiedBrowserUser } from "./account-fixture";

const testUser = {
  username: `layout-polish-${Date.now()}`,
  email: `layout-polish-${Date.now()}@example.test`,
  password: "DizyTrades-Layout-Polish-2026!",
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

async function loginViewer(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Open View-Only Terminal" }).click();
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
  const hydrationErrors: string[] = [];
  page.on("pageerror", (error) => {
    if (/Hydration failed/i.test(error.message)) hydrationErrors.push(error.message);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await createStandardUser(page);

  const topbar = page.locator(".topbar");
  const systemStrip = page.locator(".system-strip");
  const quickActions = page.locator(".global-quick-actions");
  await expect(quickActions).toBeVisible();
  await expect
    .poll(() =>
      quickActions.evaluate((node) =>
        node.parentElement?.classList.contains("system-strip"),
      ),
    )
    .toBe(true);
  const [topbarBox, stripBox, quickBox] = await Promise.all([
    topbar.boundingBox(),
    systemStrip.boundingBox(),
    quickActions.boundingBox(),
  ]);
  expect(topbarBox).not.toBeNull();
  expect(stripBox).not.toBeNull();
  expect(quickBox).not.toBeNull();
  expect(quickBox!.x).toBeGreaterThanOrEqual(stripBox!.x - 1);
  expect(quickBox!.x + quickBox!.width).toBeLessThanOrEqual(
    stripBox!.x + stripBox!.width + 1,
  );
  expect(quickBox!.y).toBeGreaterThanOrEqual(topbarBox!.y - 1);
  expect(quickBox!.y + quickBox!.height).toBeLessThanOrEqual(
    topbarBox!.y + topbarBox!.height + 1,
  );
  await expect(page.getByRole("button", { name: /Commands/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recent" })).toBeVisible();

  const flowControls = page.locator(".dizyflow-controls");
  const flowGroup = page.locator(".flow-component-toggles");
  await expect(flowControls).toBeVisible();
  await expect(flowGroup).toBeVisible();
  const [flowGeometry, flowControlsBox] = await Promise.all([
    contained(flowGroup),
    flowControls.boundingBox(),
  ]);
  expect(flowGeometry.scrollWidth).toBeLessThanOrEqual(flowGeometry.clientWidth + 1);
  expect(flowControlsBox).not.toBeNull();
  expect(flowControlsBox!.width).toBeLessThan(650);

  const drawingToolbar = page.locator(".drawing-toolbar");
  await expect(drawingToolbar).toBeVisible();
  expect(
    await drawingToolbar.evaluate((node) => getComputedStyle(node).scrollbarWidth),
  ).toBe("none");

  const flowMaster = page.locator(".dizyflow-master");
  if ((await flowMaster.getAttribute("aria-pressed")) !== "true") {
    await flowMaster.click();
  }
  await expect(flowMaster).toHaveAttribute("aria-pressed", "true");

  const domToggle = flowGroup.getByRole("button", { name: "DOM", exact: true });
  if ((await domToggle.getAttribute("aria-pressed")) !== "true") {
    await domToggle.click();
  }
  await expect(domToggle).toHaveAttribute("aria-pressed", "true");

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
  expect(
    await domBook.evaluate((node) => getComputedStyle(node).scrollbarWidth),
  ).toBe("none");

  const domFooter = page.locator(".dizyflow-dom footer");
  await expect(domFooter).toBeVisible();
  expect(
    await domFooter.evaluate((node) => getComputedStyle(node).fontSize),
  ).toBe("9px");

  const toastGeometry = await page.evaluate(() => {
    const terminal = document.querySelector<HTMLElement>(".terminal-shell");
    if (!terminal) throw new Error("Terminal shell is unavailable");
    const rail = document.createElement("div");
    rail.className = "flow-toast-rail";
    rail.innerHTML =
      "<article><i></i><span><b>Large Market Buy</b><small>64,139 · $34,212</small></span><span></span></article>";
    terminal.appendChild(rail);
    const article = rail.querySelector<HTMLElement>("article")!;
    const message = article.querySelector<HTMLElement>("span:first-of-type")!;
    const title = message.querySelector<HTMLElement>("b")!;
    const detail = message.querySelector<HTMLElement>("small")!;
    const articleRect = article.getBoundingClientRect();
    const messageRect = message.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const detailRect = detail.getBoundingClientRect();
    const textGroupCenter =
      (Math.min(titleRect.top, detailRect.top) +
        Math.max(titleRect.bottom, detailRect.bottom)) /
      2;
    const result = {
      articleHeight: articleRect.height,
      messageHeight: messageRect.height,
      centreDelta: Math.abs(
        textGroupCenter - (articleRect.top + articleRect.bottom) / 2,
      ),
      justifyContent: getComputedStyle(message).justifyContent,
      alignSelf: getComputedStyle(message).alignSelf,
      textAlign: getComputedStyle(message).textAlign,
    };
    rail.remove();
    return result;
  });
  expect(toastGeometry.articleHeight).toBe(42);
  expect(toastGeometry.messageHeight).toBeGreaterThanOrEqual(28);
  expect(toastGeometry.centreDelta).toBeLessThanOrEqual(1.5);
  expect(toastGeometry.justifyContent).toBe("center");
  expect(toastGeometry.alignSelf).toBe("stretch");
  expect(toastGeometry.textAlign).toBe("center");

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

  expect(hydrationErrors).toEqual([]);
});

test("terminal workflow buttons and DizyFlow wrap without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await loginViewer(page);

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
