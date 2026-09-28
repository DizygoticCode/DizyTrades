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

  const icons = [
    { src: "/icon-192.png", size: 192, purpose: "any" },
    { src: "/icon-512.png", size: 512, purpose: "any" },
    { src: "/icon-maskable-512.png", size: 512, purpose: "maskable" },
  ] as const;
  for (const { src, size, purpose } of icons) {
    expect(manifest.icons).toContainEqual({
      src, type: "image/png", sizes: size + "x" + size, purpose,
    });
    const image = await page.request.get(src);
    expect(image.ok(), src + " is accessible").toBe(true);
    expect(image.headers()["content-type"], src + " has PNG content type").toContain("image/png");
    const png = await image.body();
    expect(png.subarray(0, 8).toString("hex"), src + " PNG signature").toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16), src + " width").toBe(size);
    expect(png.readUInt32BE(20), src + " height").toBe(size);
  }
  const appleIcon = await page.request.get("/apple-icon-180.png");
  expect(appleIcon.ok()).toBe(true);
  const appleBytes = await appleIcon.body();
  expect(appleBytes.readUInt32BE(16)).toBe(180);
  expect(appleBytes.readUInt32BE(20)).toBe(180);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-icon-180.png");
});

test("the installable PWA does not cache an authenticated offline shell", async ({ page }) => {
  // This Next.js app intentionally has no service worker: an install icon
  // must never imply offline availability of credentials or account data.
  // Use an isolated Playwright browser context and never log in as an owner.
  await page.goto("/login");
  const registrations = await page.evaluate(async () =>
    "serviceWorker" in navigator
      ? (await navigator.serviceWorker.getRegistrations()).filter(
          (registration) => new URL(registration.scope).origin === location.origin,
        ).length
      : 0,
  );
  expect(registrations).toBe(0);

  // A fresh protected page must require the network. Testing a route never
  // visited in this context avoids confusing the browser back/forward cache
  // with genuine offline application functionality.
  await page.context().setOffline(true);
  try {
    await expect(
      page.goto("/account/egress", { waitUntil: "domcontentloaded" }),
    ).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);
  } finally {
    await page.context().setOffline(false);
  }
});
