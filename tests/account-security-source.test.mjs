import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("signup requires email verification and does not issue a session", () => {
  const route = source("app/api/auth/signup/route.ts");
  assert.match(route, /Boolean\(email\)/);
  assert.match(route, /createEmailVerificationTokenForUser/);
  assert.match(route, /sendVerificationEmail/);
  assert.doesNotMatch(route, /createDatabaseSession|SESSION_COOKIE|issueSession/);
});

test("login blocks a correct unverified database account", () => {
  const route = source("app/api/auth/login/route.ts");
  assert.match(route, /EMAIL_UNVERIFIED/);
  assert.match(route, /authenticateUserDetailed/);
});

test("account email links keep bearer tokens in URL fragments", () => {
  const mail = source("app/lib/account-mail.ts");
  assert.match(mail, /url\.hash = new URLSearchParams\(\{ token \}\)\.toString\(\)/);
  assert.doesNotMatch(mail, /searchParams\.set\(["']token/);
  assert.match(source("app/verify-email/verify-email-client.tsx"), /window\.location\.hash/);
  assert.match(source("app/reset-password/reset-password-client.tsx"), /window\.location\.hash/);
});

test("recovery requests use generic enumeration-safe responses", () => {
  const forgot = source("app/api/auth/forgot-password/route.ts");
  const resend = source("app/api/auth/resend-verification/route.ts");
  assert.match(forgot, /If that address belongs to a verified DizyTrades account/);
  assert.match(resend, /If that address belongs to an unverified account/);
  assert.match(forgot, /createPasswordResetTokenForEmail/);
  assert.match(resend, /createEmailVerificationTokenForEmail/);
});

test("Render keeps the Gmail App Password outside source control", () => {
  const render = source("render.yaml");
  assert.match(render, /- key: SMTP_APP_PASSWORD\s+sync: false/);
  assert.match(render, /- key: SMTP_HOST\s+value: smtp\.gmail\.com/);
  assert.match(render, /- key: SMTP_PORT\s+value: ["']465["']/);
  assert.doesNotMatch(render, /SMTP_APP_PASSWORD\s+value:/);
});

test("personal profile mutation has no role or email write path", () => {
  const profile = source("app/api/account/profile/route.ts");
  assert.match(profile, /displayName/);
  assert.match(profile, /bio/);
  assert.doesNotMatch(profile, /body\.role|body\.email/);
  assert.match(source("app/api/account/avatar/route.ts"), /image\/png|image\/jpeg|image\/webp/);
});
