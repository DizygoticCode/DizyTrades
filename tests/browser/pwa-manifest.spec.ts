import { expect, test } from "@playwright/test";

test("public landing exposes the scoped DizyTrades home-screen manifest", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /\/manifest\.webmanifest$/);

  const response = await page.request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: "/", start_url: "/", scope: "/", display: "standalone", theme_color: "#080a10",
  });
  expect(manifest.icons).toContainEqual({
    src: "/brand/dizy-mark.svg", type: "image/svg+xml", sizes: "any", purpose: "any",
  });
  expect((await page.request.get("/brand/dizy-mark.svg")).ok()).toBe(true);
});
