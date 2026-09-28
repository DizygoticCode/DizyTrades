import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profile = readFileSync("app/account/profile/profile-form.tsx", "utf8");

test("profile help does not imply the obsolete Render credential host", () => {
  assert.doesNotMatch(profile, /Render credential boundary|managed in Render/i);
  assert.match(profile, /Legacy owner\/admin credential managed on this server/);
  assert.match(profile, /Email password recovery applies to verified database accounts/);
  assert.match(profile, /profile\.credentialSource === "database"/);
});
