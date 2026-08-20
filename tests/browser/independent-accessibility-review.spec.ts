import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const interactiveRoles = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "menuitem",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);

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

async function accessibilityTreeViolations(page: Page) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Accessibility.enable");
    const response = (await session.send("Accessibility.getFullAXTree")) as {
      nodes: Array<{
        ignored?: boolean;
        nodeId: string;
        role?: { value?: string };
        name?: { value?: string };
      }>;
    };
    return response.nodes
      .filter((node) => {
        const role = node.role?.value ?? "";
        return (
          !node.ignored &&
          interactiveRoles.has(role) &&
          !(node.name?.value ?? "").trim()
        );
      })
      .map((node) => `${node.role?.value ?? "unknown"}#${node.nodeId}`)
      .slice(0, 20);
  } finally {
    await session.detach();
  }
}

async function structuralViolations(page: Page) {
  return page.evaluate(() => {
    const violations: string[] = [];
    const visible = (element: Element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return (
        element.getClientRects().length > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    };
    const describe = (element: Element) => {
      const tag = element.tagName.toLocaleLowerCase();
      const id = element.id ? `#${element.id}` : "";
      const role = element.getAttribute("role");
      return `${tag}${id}${role ? `[role=${role}]` : ""}`;
    };

    const byId = new Map<string, Element[]>();
    for (const element of Array.from(document.querySelectorAll("[id]"))) {
      const values = byId.get(element.id) ?? [];
      values.push(element);
      byId.set(element.id, values);
    }
    for (const [id, elements] of byId) {
      if (id && elements.length > 1) violations.push(`duplicate id #${id}`);
    }

    for (const element of Array.from(
      document.querySelectorAll("[aria-labelledby], [aria-describedby]"),
    )) {
      for (const attribute of ["aria-labelledby", "aria-describedby"] as const) {
        const value = element.getAttribute(attribute);
        if (!value) continue;
        for (const id of value.trim().split(/\s+/)) {
          if (!document.getElementById(id)) {
            violations.push(`${describe(element)} has broken ${attribute} #${id}`);
          }
        }
      }
    }

    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>("[aria-controls]"),
    )) {
      if (element.getAttribute("aria-expanded") === "false") continue;
      const value = element.getAttribute("aria-controls");
      if (!value) continue;
      for (const id of value.trim().split(/\s+/)) {
        if (!document.getElementById(id)) {
          violations.push(`${describe(element)} has broken aria-controls #${id}`);
        }
      }
    }

    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>("[tabindex]"),
    )) {
      if (visible(element) && element.tabIndex > 0) {
        violations.push(`${describe(element)} uses positive tabindex`);
      }
    }

    const interactiveSelector = [
      "a[href]",
      "button",
      "input:not([type=hidden])",
      "select",
      "textarea",
      '[role="button"]',
      '[role="link"]',
    ].join(",");
    for (const outer of Array.from(
      document.querySelectorAll<HTMLElement>(interactiveSelector),
    )) {
      if (!visible(outer)) continue;
      const nested = Array.from(
        outer.querySelectorAll<HTMLElement>(interactiveSelector),
      ).find(visible);
      if (nested) {
        violations.push(`${describe(outer)} contains ${describe(nested)}`);
      }
    }

    for (const hidden of Array.from(
      document.querySelectorAll<HTMLElement>('[aria-hidden="true"]'),
    )) {
      const focusable = Array.from(
        hidden.querySelectorAll<HTMLElement>(
          'a[href]:not([tabindex="-1"]),button:not([disabled]):not([tabindex="-1"]),input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]),select:not([disabled]):not([tabindex="-1"]),textarea:not([disabled]):not([tabindex="-1"]),[tabindex]:not([tabindex="-1"])',
        ),
      ).find(visible);
      if (focusable) {
        violations.push(
          `${describe(hidden)} hides focusable ${describe(focusable)}`,
        );
      }
    }

    for (const image of Array.from(document.querySelectorAll("img:not([alt])"))) {
      violations.push(`${describe(image)} has no alt attribute`);
    }
    for (const frame of Array.from(document.querySelectorAll("iframe:not([title])"))) {
      violations.push(`${describe(frame)} has no title`);
    }
    for (const image of Array.from(
      document.querySelectorAll<SVGElement>('svg[role="img"]'),
    )) {
      const named =
        image.hasAttribute("aria-label") ||
        image.hasAttribute("aria-labelledby") ||
        Boolean(image.querySelector("title"));
      if (!named) violations.push(`${describe(image)} has no accessible name`);
    }

    return violations.slice(0, 30);
  });
}

async function auditCurrentPage(page: Page, path: string) {
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect.poll(() => page.title()).not.toBe("");
  expect(await structuralViolations(page), `${path} DOM structure`).toEqual([]);
  expect(
    await accessibilityTreeViolations(page),
    `${path} accessibility tree`,
  ).toEqual([]);
}

test("public routes expose named controls and coherent document structure", async ({
  page,
}) => {
  for (const path of ["/", "/login", "/signup", "/school", "/explore"]) {
    await page.goto(path);
    const expectedUrl =
      path === "/school"
        ? /\/school(?:\?lesson=[a-z0-9-]+)?$/
        : new RegExp(`${path === "/" ? "/$" : `${path}$`}`);
    await expect(page).toHaveURL(expectedUrl);
    await auditCurrentPage(page, path);
  }
});

test("viewer workspaces expose named controls and coherent document structure", async ({
  page,
}) => {
  await loginViewer(page);
  for (const path of [
    "/terminal",
    "/scanner",
    "/structure",
    "/performance",
    "/journal",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await auditCurrentPage(page, path);
    if (path === "/terminal") {
      await expect(
        page.getByRole("region", { name: "Manual Paper account workspace" }),
      ).toBeVisible();
    }
  }
});

test("modal background is inert and cannot receive programmatic focus", async ({
  page,
}) => {
  await loginViewer(page);
  // The visual trigger is terminal-only; exercise modal isolation from the
  // workspace where that visible opener is part of the UI contract.
  await expect(page.getByRole("button", { name: /Commands/ })).toBeVisible();
  await page.keyboard.press("Control+K");

  const dialog = page.getByRole("dialog", {
    name: "DizyTrades command palette",
  });
  const search = dialog.getByRole("combobox", { name: "Search commands" });
  const trigger = page.getByRole("button", { name: "Commands ⌘K" });
  await expect(search).toBeFocused();
  await expect
    .poll(() => trigger.evaluate((element) => Boolean(element.closest("[inert]"))))
    .toBe(true);

  await trigger.evaluate((element) => element.focus());
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect
    .poll(() => trigger.evaluate((element) => Boolean(element.closest("[inert]"))))
    .toBe(false);
});

test("forced colours preserve keyboard focus visibility", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await loginViewer(page);
  await page.goto("/scanner");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeAttached();
  await page.keyboard.press("Tab");
  await skip.focus();
  await expect(skip).toBeFocused();
  const style = await skip.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      outlineStyle: computed.outlineStyle,
      outlineWidth: Number.parseFloat(computed.outlineWidth),
    };
  });
  expect(style.outlineStyle).not.toBe("none");
  expect(style.outlineWidth).toBeGreaterThanOrEqual(2);
});
