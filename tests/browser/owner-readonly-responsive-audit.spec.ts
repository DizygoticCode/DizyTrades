import { expect, test } from "@playwright/test";

// CI-only legacy owner fixture; never visit a production account or submit
// shutdown, credential, egress, activation or order controls in a UI audit.
const owner = {
  email: "e2e-owner@dizytrades.local",
  password: "DizyTrades-E2E-Owner-2026!",
};
const pages = [
  { route: "/account", heading: "DizyAccount Companion" },
  { route: "/account/control", heading: "MEXC connection shutdown" },
  { route: "/account/audit", heading: "Shadow audit ledger" },
  { route: "/account/profile", heading: "Your DizyTrades profile" },
] as const;

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test("owner read-only screens fit " + viewport.name, async ({ page }) => {
    test.setTimeout(100_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.context().setExtraHTTPHeaders({
      "x-forwarded-for": "192.0.2." + (80 + Math.floor(viewport.width / 100)),
    });

    await page.goto("/login");
    await page.getByLabel("Username or email").fill(owner.email);
    await page.getByLabel("Password").fill(owner.password);
    await page.getByRole("button", { name: "Open DizyTrades" }).click();
    await expect(page).toHaveURL(/\/terminal$/);

    const skip = page.getByRole("button", { name: "Skip onboarding" });
    if (await skip.isVisible().catch(() => false)) await skip.click();

    for (const { route, heading } of pages) {
      // GET-only navigation; do not touch any operation or credential input.
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(route.replaceAll("/", "\\/") + "$"));
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      const geometry = await page.evaluate(() => {
        const main = document.querySelector("main");
        if (!main) throw new Error("Owner page has no main landmark");
        const b = main.getBoundingClientRect();
        return {
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
          left: b.left,
          right: b.right,
        };
      });
      expect(geometry.document, route + " document overflow").toBeLessThanOrEqual(geometry.viewport + 1);
      expect(geometry.body, route + " body overflow").toBeLessThanOrEqual(geometry.viewport + 1);
      expect(geometry.left, route + " main starts inside viewport").toBeGreaterThanOrEqual(-1);
      expect(geometry.right, route + " main fits viewport").toBeLessThanOrEqual(geometry.viewport + 1);
    }
  });
}
