import { expect, test } from "@playwright/test";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

// This security-sensitive suite never records page media or traces: even the
// deliberately synthetic values submitted by the browser must not enter CI diagnostics.
test.use({ trace: "off", screenshot: "off", video: "off" });

const enabled = process.env.CREDENTIAL_PROVISIONING_ENABLED === "true" && process.env.CREDENTIAL_CUSTODY_ENABLED === "true";
function decodeBase32(value: string) { const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits="";const output=[];for(const char of value.replace(/=+$/,"")){bits+=alphabet.indexOf(char).toString(2).padStart(5,"0");while(bits.length>=8){output.push(Number.parseInt(bits.slice(0,8),2));bits=bits.slice(8);}}return Buffer.from(output); }
function totp(secret: Buffer, now=Date.now()) { const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30_000)));const mac=createHmac("sha1",secret).update(counter).digest(),offset=mac[19]&15;return String((mac.readUInt32BE(offset)&0x7fffffff)%1e6).padStart(6,"0"); }
const ownerEmail=process.env.ROB_EMAIL ?? "e2e-owner@dizytrades.local",ownerPassword=process.env.ROB_PASSWORD ?? "DizyTrades-E2E-Owner-2026!";
async function loginOwner(page: import("@playwright/test").Page) {
  // Trigger the normal one-way owner migration, then mint the same revocable,
  // database-backed session produced after a successful MFA challenge. The
  // shared browser database can legitimately retain owner MFA from an earlier
  // enabled-posture run, so password-only UI login is not a deterministic setup.
  await page.goto("/login");
  await page.request.post("/api/auth/login", { data: { identifier: ownerEmail, password: ownerPassword } });
  const database = new DatabaseSync(join(process.env.DATA_DIR || join(process.cwd(), ".data"), "auth.sqlite"));
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  try {
    database.exec("PRAGMA busy_timeout=5000");
    const owner = database.prepare("SELECT id FROM users WHERE id='rob' AND role='owner' AND email_normalized=? AND email_verified_at IS NOT NULL").get(ownerEmail.toLowerCase());
    if (!owner) throw new Error("Configured E2E owner is not database-backed");
    database.prepare("UPDATE sessions SET revoked_at=? WHERE user_id='rob' AND revoked_at IS NULL").run(now);
    database.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at,revoked_at) VALUES(?,'rob',?,?,?,NULL)")
      .run(createHash("sha256").update(token).digest("hex"), now + 12 * 60 * 60_000, now, now);
  } finally {
    database.close();
  }
  await page.context().addCookies([{ name: "dizytrades_session", value: token, url: new URL(page.url()).origin, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/terminal");
  await expect(page).toHaveURL(/\/terminal$/);
}

test.describe("disabled posture",()=>{test.skip(enabled,"Run in the default disabled posture");test("Chromium shows an honest disabled custody state", async ({ page }) => {
  await loginOwner(page); await page.goto("/account/profile");
  await expect(page.getByText("Unavailable — custody and provisioning are disabled by default.")).toBeVisible();
  await expect(page.getByLabel("Future API key")).toHaveCount(0);
});});

test.describe("synthetic enabled posture",()=>{test.skip(!enabled,"Run with explicitly synthetic test custody configuration");test("Chromium completes a synthetic native-form provisioning path", async ({ page }) => {
  await loginOwner(page);
  await page.goto("/account/profile");
  const enrollmentForm=page.getByRole("button",{name:"Begin MFA enrollment"}).locator("xpath=ancestor::form");
  await enrollmentForm.getByLabel("Current password").fill(ownerPassword);
  await enrollmentForm.getByRole("button",{name:"Begin MFA enrollment"}).click();
  const enrollment=await page.getByText(/Enter this secret in your authenticator/).locator("code").textContent();
  const secret=decodeBase32(enrollment!); await page.getByLabel("Authenticator code",{exact:true}).fill(totp(secret)); await page.getByRole("button",{name:"Confirm MFA"}).click(); await expect(page.getByText("Enabled. Authenticator secrets remain encrypted at rest.")).toBeVisible();
  const authorizationForm=page.getByRole("button",{name:"Authorize one guarded submission"}).locator("xpath=ancestor::form"); await authorizationForm.getByLabel("Current password").fill(ownerPassword); await authorizationForm.getByLabel("Current authenticator code").fill(totp(secret)); await authorizationForm.getByRole("button",{name:"Authorize one guarded submission"}).click();
  await expect(page.getByText(/submission is authorized/)).toBeVisible();
  await page.getByLabel("Future API key").fill("browser-synthetic-key"); await page.getByLabel("Future API secret").fill("browser-synthetic-secret"); await page.getByRole("button",{name:"Submit directly to encrypted custody"}).click();
  await expect(page).toHaveURL(/custody=provisioned/); await page.goto("/account/profile");
  await expect(page.getByText(/Configured for owner-primary; key version/)).toBeVisible();
});});
