import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildTotpEnrollmentUri,
  totpEnrollmentQrMatrix,
} from "../app/lib/totp-qr.ts";

const secret = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const panel = readFileSync(new URL("../app/account/profile/mfa-panel.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/account/profile/profile.css", import.meta.url), "utf8");
const qrSource = readFileSync(new URL("../app/lib/totp-qr.ts", import.meta.url), "utf8");

test("TOTP enrollment QR uses the exact local DizyTrades authenticator contract", () => {
  assert.equal(
    buildTotpEnrollmentUri(secret),
    "otpauth://totp/DizyTrades%3AAccount?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=DizyTrades&algorithm=SHA1&digits=6&period=30",
  );
  assert.throws(() => buildTotpEnrollmentUri("ABC"), /INVALID_TOTP_SECRET/);
  assert.doesNotMatch(qrSource, /https?:\/\/|fetch\s*\(|XMLHttpRequest|quickchart|qrserver|googleapis/i);
});

test("local fixed Version 6-L QR encoder is deterministic for the enrollment payload", () => {
  const matrix = totpEnrollmentQrMatrix(secret);
  assert.equal(matrix.length, 41);
  assert.ok(matrix.every((row) => row.length === 41));
  const bits = matrix.flat().map((dark) => dark ? "1" : "0").join("");
  assert.equal(matrix.flat().filter(Boolean).length, 854);
  assert.equal(
    createHash("sha256").update(bits).digest("hex"),
    "33e4206c4fa18447242f74a19cd76caa95b4cae556013fde404d658f8a998408",
  );
});

test("MFA panel presents a styled QR-first enrollment with grouped manual fallback", () => {
  assert.match(panel, /Scan this QR code/);
  assert.match(panel, /Google Authenticator/);
  assert.match(panel, /groupedSetupKey/);
  assert.match(panel, /\.match\(\/\.\{1,4\}\/g\)\?\.join\(" "\)/);
  assert.match(panel, /Copy setup key/);
  assert.match(panel, /time-based/);
  assert.match(panel, /Start over with a new key/);
  assert.match(panel, /pattern="\[0-9\]\{6\}"/);
  assert.match(panel, /maxLength=\{6\}/);
  assert.doesNotMatch(panel, /<img[^>]+https?:\/\//i);
  for (const className of ["mfa-security-card", "mfa-enrollment", "mfa-qr-frame", "mfa-manual-key", "mfa-recovery-codes"]) {
    assert.match(css, new RegExp(`\\.${className}\\b`));
  }
});
