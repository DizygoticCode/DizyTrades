import { expect, test } from "@playwright/test";

// This is a synthetic fragment token. Block the endpoint so the test never
// executes MFA recovery, uses an actual account, or contacts an email service.
test("MFA recovery connection loss shows a retryable, non-committal error", async ({ page }) => {
  let blockedRequests = 0;
  await page.route("**/api/auth/mfa/email-recovery/complete", async (route) => {
    blockedRequests += 1;
    await route.abort("failed");
  });

  await page.goto("/recover-mfa#token=e2e-synthetic-invalid-token");
  const recover = page.getByRole("button", { name: "Disable MFA and revoke sessions" });
  await expect(recover).toBeEnabled();
  await expect(page).toHaveURL(/\/recover-mfa$/);

  await recover.click();
  await expect(page.getByRole("alert")).toContainText("MFA recovery could not be confirmed");
  await expect(page.getByRole("alert")).toContainText("Check your account status before retrying");
  await expect(recover).toBeEnabled();
  expect(blockedRequests).toBe(1);
});
