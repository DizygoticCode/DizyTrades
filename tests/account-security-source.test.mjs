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

test("Render declares the complete production account-mail boundary without committing the App Password", () => {
  const render = source("render.yaml");
  assert.match(render, /- key: PUBLIC_SIGNUP_ENABLED\s+value: ["']true["']/);
  assert.match(render, /- key: APP_BASE_URL\s+value: https:\/\/dizytrades\.onrender\.com/);
  assert.match(render, /- key: SMTP_HOST\s+value: smtp\.gmail\.com/);
  assert.match(render, /- key: SMTP_PORT\s+value: ["']465["']/);
  assert.match(render, /- key: SMTP_USER\s+value: dizytrades@gmail\.com/);
  assert.match(render, /- key: SMTP_APP_PASSWORD\s+sync: false/);
  assert.match(render, /- key: MAIL_FROM\s+value: ["']DizyTrades <dizytrades@gmail\.com>["']/);
  assert.doesNotMatch(render, /SMTP_APP_PASSWORD\s+value:/);
});

test("personal profile mutation has no role or email write path", () => {
  const profile = source("app/api/account/profile/route.ts");
  assert.match(profile, /displayName/);
  assert.match(profile, /bio/);
  assert.doesNotMatch(profile, /body\.role|body\.email/);
  assert.match(source("app/api/account/avatar/route.ts"), /image\/png|image\/jpeg|image\/webp/);
});
