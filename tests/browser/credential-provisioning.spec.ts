import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";

// This security-sensitive suite never records page media or traces: even the
// deliberately synthetic values submitted by the browser must not enter CI diagnostics.
test.use({ trace: "off", screenshot: "off", video: "off" });

const enabled = process.env.CREDENTIAL_PROVISIONING_ENABLED === "true" && process.env.CREDENTIAL_CUSTODY_ENABLED === "true";
function decodeBase32(value: string) { const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits="",output=[];for(const char of value.replace(/=+$/,"")){bits+=alphabet.indexOf(char).toString(2).padStart(5,"0");while(bits.length>=8){output.push(Number.parseInt(bits.slice(0,8),2));bits=bits.slice(8);}}return Buffer.from(output); }
function totp(secret: Buffer, now=Date.now()) { const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30_000)));const mac=createHmac("sha1",secret).update(counter).digest(),offset=mac[19]&15;return String((mac.readUInt32BE(offset)&0x7fffffff)%1e6).padStart(6,"0"); }
const ownerEmail=process.env.ROB_EMAIL ?? "e2e-owner@dizytrades.local",ownerPassword=process.env.ROB_PASSWORD ?? "DizyTrades-E2E-Owner-2026!";
async function loginOwner(page: import("@playwright/test").Page) { await page.goto("/login"); await page.getByLabel("Username or email").fill(ownerEmail); await page.getByLabel("Password").fill(ownerPassword); await page.getByRole("button",{name:"Open DizyTrades"}).click(); await expect(page).toHaveURL(/\/terminal$/); }

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
