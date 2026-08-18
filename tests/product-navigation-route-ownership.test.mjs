import assert from "node:assert/strict";
import test from "node:test";
import { showSharedProductNavigation } from "../app/lib/product-navigation.ts";

test("public marketing and auth routes own their chrome without the shared product bar", () => {
  for (const pathname of [
    "/",
    "/about",
    "/contact",
    "/dizy",
    "/dex",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password/token",
    "/recover-mfa",
    "/resend-verification",
    "/verify-email/token",
  ]) {
    assert.equal(showSharedProductNavigation(pathname), false, pathname);
  }
});

test("workspace and product routes retain the shared product navigation", () => {
  for (const pathname of [
    "/terminal",
    "/explore",
    "/research",
    "/school",
    "/account",
    "/account/write-credential/activate",
    "/scanner",
    "/structure",
    "/performance",
    "/journal",
    "/backup",
    "/diagnostics",
  ]) {
    assert.equal(showSharedProductNavigation(pathname), true, pathname);
  }
});
