import { expect, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

export type BrowserTestAccount = Readonly<{
  username?: string;
  email: string;
  password: string;
}>;

function verifyBrowserAccount(email: string) {
  const databasePath = join(
    process.env.DATA_DIR || join(process.cwd(), ".data"),
    "auth.sqlite",
  );
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA busy_timeout=5000");
    const normalizedEmail = email.trim().toLowerCase();
    const user = database
      .prepare("SELECT id FROM users WHERE email_normalized=?")
      .get(normalizedEmail) as { id: string } | undefined;
    if (!user) throw new Error(`Browser fixture account ${normalizedEmail} was not persisted`);
    database
      .prepare("UPDATE users SET email_verified_at=? WHERE id=?")
      .run(new Date().toISOString(), user.id);
    database
      .prepare("DELETE FROM email_verification_tokens WHERE user_id=?")
      .run(user.id);
  } finally {
    database.close();
  }
}

export async function createVerifiedBrowserUser(
  page: Page,
  account: BrowserTestAccount,
) {
  await page.goto("/signup");
  if (account.username) {
    await page.getByLabel("Username (optional)").fill(account.username);
  }
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByLabel("Confirm password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  // Browser layout/workspace tests do not depend on external Gmail delivery. The
  // token lifecycle itself is covered deterministically; this fixture marks the
  // just-created test account verified in the same local SQLite store, then uses
  // the real login route to obtain the browser session.
  verifyBrowserAccount(account.email);

  await page.goto("/login");
  await page.getByLabel("Username or email").fill(account.username || account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Open DizyTrades" }).click();
  await expect(page).toHaveURL(/\/terminal$/);
}
