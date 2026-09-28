import { expect, test } from "@playwright/test";

// These routes are public. Keep this audit independent of test-account data,
// exchange credentials, simulated balances and protected trade history.
const routes = ["/", "/about", "/contact", "/login", "/signup", "/forgot-password", "/dizy"] as const;

for (const width of [360, 768, 1280]) {
  test(`public pages fit the ${width}px viewport without hiding the main content`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main").first(), `${route}: main landmark`).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 }).first(), `${route}: page heading`).toBeVisible();
      const geometry = await page.evaluate(() => {
        const main = document.querySelector("main");
        const heading = main?.querySelector("h1");
        if (!main || !heading) throw new Error("Missing public page content");
        const bounds = heading.getBoundingClientRect();
        return {
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
          headingLeft: bounds.left,
          headingRight: bounds.right,
          headingWidth: bounds.width,
        };
      });
      expect(geometry.document, `${route}: document horizontal overflow`).toBeLessThanOrEqual(geometry.viewport + 1);
      expect(geometry.body, `${route}: body horizontal overflow`).toBeLessThanOrEqual(geometry.viewport + 1);
      expect(geometry.headingWidth, `${route}: collapsed heading`).toBeGreaterThan(0);
      expect(geometry.headingLeft, `${route}: clipped heading left edge`).toBeGreaterThanOrEqual(-1);
      expect(geometry.headingRight, `${route}: clipped heading right edge`).toBeLessThanOrEqual(geometry.viewport + 1);
    }
  });
}
