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

test("signup page uses the same explicit enable flag as the backend", () => {
  const page = source("app/signup/page.tsx");
  assert.match(page, /publicSignupEnabled/);
  assert.match(page, /enabled=\{publicSignupEnabled\(\)\}/);
  assert.doesNotMatch(page, /PUBLIC_SIGNUP_ENABLED\s*!==\s*["']false["']/);
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

test("self-hosted defaults declare the complete production account-mail boundary without committing the App Password", () => {
  const environment = source(".env.example");
  assert.match(environment, /^PUBLIC_SIGNUP_ENABLED=true$/m);
  assert.match(environment, /^APP_BASE_URL=https:\/\/dizytrades\.tech$/m);
  assert.match(environment, /^SMTP_HOST=smtp\.gmail\.com$/m);
  assert.match(environment, /^SMTP_PORT=465$/m);
  assert.match(environment, /^SMTP_USER=dizytrades@gmail\.com$/m);
  assert.match(environment, /^SMTP_APP_PASSWORD=$/m);
  assert.match(environment, /^MAIL_FROM=DizyTrades <dizytrades@gmail\.com>$/m);
  assert.doesNotMatch(environment, /^SMTP_APP_PASSWORD=.+$/m);
});

test("personal profile mutation has no role or email write path", () => {
  const profile = source("app/api/account/profile/route.ts");
  assert.match(profile, /displayName/);
  assert.match(profile, /bio/);
  assert.doesNotMatch(profile, /body\.role|body\.email/);
  assert.match(source("app/api/account/avatar/route.ts"), /image\/png|image\/jpeg|image\/webp/);
});
