import { expect, test } from "@playwright/test";

test("official DIZY token page links to the persistent DizyChat community room", async ({ page }) => {
  await page.goto("/dizy");
  const community = page.getByRole("link", { name: /DIZY on DizyChat/i });
  await expect(community).toBeVisible();
  await expect(community).toHaveAttribute("href", "https://dizychat.com/login?room=DIZY");
  await expect(community).toHaveAttribute("rel", /noopener/);
  await expect(community).toHaveAttribute("target", "_blank");
});
