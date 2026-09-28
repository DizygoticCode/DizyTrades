import { expect, test } from "@playwright/test";

// These are public-only routes: screenshots and traces must never contain
// owner balances, private account data, credentials or execution controls.
const publicRoutes = [
  "/", "/about", "/contact", "/dizy", "/dex", "/research",
  "/investors", "/business-plan", "/school", "/login", "/signup",
] as const;

const viewports = [
  { name: "phone portrait", width: 360, height: 800 },
  { name: "phone landscape", width: 667, height: 375 },
  { name: "small tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

for (const viewport of viewports) {
  test("public routes fit " + viewport.name + " without clipping navigation", async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const route of publicRoutes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("main"), route + " main landmark").toHaveCount(1);
      await expect.poll(() => page.title(), { message: route + " title" }).not.toBe("");

      const geometry = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        main: document.querySelector("main")?.getBoundingClientRect().toJSON(),
      }));
      expect(geometry.document, route + " document horizontal overflow").toBeLessThanOrEqual(
        geometry.viewport + 1,
      );
      expect(geometry.body, route + " body horizontal overflow").toBeLessThanOrEqual(
        geometry.viewport + 1,
      );
      expect(geometry.main, route + " main region").toBeTruthy();
      expect(geometry.main!.right, route + " main right edge").toBeLessThanOrEqual(
        geometry.viewport + 1,
      );
      expect(geometry.main!.left, route + " main left edge").toBeGreaterThanOrEqual(-1);

      const navToggle = page.getByRole("button", { name: "Toggle navigation" });
      if (await navToggle.isVisible().catch(() => false)) {
        const box = await navToggle.boundingBox();
        expect(box, route + " mobile navigation target").toBeTruthy();
        expect(box!.width, route + " nav target width").toBeGreaterThanOrEqual(32);
        expect(box!.height, route + " nav target height").toBeGreaterThanOrEqual(32);
        await navToggle.click();
        await expect(navToggle).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
        await navToggle.click();
        await expect(navToggle).toHaveAttribute("aria-expanded", "false");
      }
    }
  });
}
