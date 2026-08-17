import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { safeAuthReturnTarget } from "../app/lib/auth-return-target.ts";

const loginForm = readFileSync(new URL("../app/login/login-form.tsx", import.meta.url), "utf8");
const loginPage = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../app/lib/auth.ts", import.meta.url), "utf8");
const egressPage = readFileSync(new URL("../app/account/egress/page.tsx", import.meta.url), "utf8");

test("accepts only bounded local protected return targets", () => {
  assert.equal(safeAuthReturnTarget("/terminal"), "/terminal");
  assert.equal(
    safeAuthReturnTarget("/account/egress?accountId=owner-primary&generation=render-egress-test-1"),
    "/account/egress?accountId=owner-primary&generation=render-egress-test-1",
  );

  for (const value of [
    "https://evil.example/account/egress",
    "//evil.example/account/egress",
    "/\\evil.example/account/egress",
    "/account/%2f%2fevil.example",
    "/school",
    "javascript:alert(1)",
    "",
  ]) assert.equal(safeAuthReturnTarget(value), "/terminal", value);
});

test("password and MFA success both use the validated return target", () => {
  assert.match(loginForm, /const postLoginTarget = safeAuthReturnTarget\(returnTo\)/);
  assert.equal((loginForm.match(/router\.replace\(postLoginTarget\)/g) || []).length, 2);
  assert.match(loginForm, /continueAsViewer[\s\S]*router\.replace\("\/terminal"\)/);
  assert.match(loginPage, /const returnTo = safeAuthReturnTarget\(first\(query\.returnTo\)\)/);
  assert.match(loginPage, /<LoginForm returnTo=\{returnTo\} \/>/);
});

test("protected egress requests opt into a safe login return target", () => {
  assert.match(authSource, /redirect\(`\/login\?returnTo=\$\{encodeURIComponent\(target\)\}`\)/);
  assert.match(egressPage, /requireUser\("\/account\/egress"\)/);
});
