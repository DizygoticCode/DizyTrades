import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { afterEach, beforeEach } from "node:test";
import {
  custodyDatabasePathForTests, inspectCredential, revokeCredentials, rotateCredentials,
  storeCredentials, withCredentials,
} from "../app/lib/credential-custody/index.ts";

const synthetic = { apiKey: "synthetic-fixture-api-key-283", apiSecret: "synthetic-fixture-secret-283" };
const v1 = Buffer.alloc(32, 17).toString("base64");
const v2 = Buffer.alloc(32, 29).toString("base64");
let directory;
const binding = { userId: "fixture-user", accountRef: "fixture-account", recordId: "fixture-record" };

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "dizy-custody-"));
  Object.assign(process.env, { DATA_DIR: directory, CREDENTIAL_CUSTODY_ENABLED: "true",
    CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION: "1", CREDENTIAL_CUSTODY_KEYRING: JSON.stringify({ 1: v1 }) });
  delete process.env.MFA_ENCRYPTION_KEY; delete process.env.SESSION_SECRET;
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  for (const key of ["DATA_DIR", "CREDENTIAL_CUSTODY_ENABLED", "CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION", "CREDENTIAL_CUSTODY_KEYRING", "MFA_ENCRYPTION_KEY", "SESSION_SECRET"]) delete process.env[key];
});

test("encrypts the complete payload at rest with fresh nonces and metadata contains no secrets", () => {
  const first = storeCredentials({ ...binding, credentials: synthetic });
  const second = storeCredentials({ userId: binding.userId, accountRef: binding.accountRef, recordId: "fixture-record-2", credentials: synthetic });
  assert.deepEqual(inspectCredential(binding), first);
  assert.equal("apiKey" in first || "apiSecret" in first, false);
  const bytes = readFileSync(custodyDatabasePathForTests());
  assert.equal(bytes.includes(Buffer.from(synthetic.apiKey)), false);
  assert.equal(bytes.includes(Buffer.from(synthetic.apiSecret)), false);
  const db = new DatabaseSync(custodyDatabasePathForTests());
  const rows = db.prepare("SELECT nonce,ciphertext FROM custody_records ORDER BY record_id").all(); db.close();
  assert.notDeepEqual(rows[0].nonce, rows[1].nonce); assert.notDeepEqual(rows[0].ciphertext, rows[1].ciphertext);
  assert.equal(second.keyVersion, 1);
});

test("opens only inside the narrow callback and ownership/AAD mismatches fail closed", () => {
  storeCredentials({ ...binding, credentials: synthetic });
  let observed;
  assert.equal(withCredentials(binding, (value) => { observed = { ...value }; }), undefined);
  assert.deepEqual(observed, synthetic);
  for (const changed of [{ userId: "other" }, { accountRef: "other" }, { recordId: "other" }])
    assert.throws(() => withCredentials({ ...binding, ...changed }, () => {}), /CREDENTIAL_CUSTODY_UNAVAILABLE/);
});

test("records one secret-free open event before a credential consumer throws", () => {
  storeCredentials({ ...binding, credentials: synthetic });
  assert.throws(() => withCredentials(binding, () => { throw new Error("synthetic consumer failure"); }), /synthetic consumer failure/);
  const db = new DatabaseSync(custodyDatabasePathForTests());
  const events = db.prepare("SELECT event_type,record_id,user_id,account_ref,key_version FROM custody_audit ORDER BY id").all();
  db.close();
  assert.deepEqual(events.map((event) => event.event_type), ["create", "open"]);
  assert.deepEqual({ ...events[1] }, { event_type: "open", record_id: binding.recordId, user_id: binding.userId,
    account_ref: binding.accountRef, key_version: 1 });
  assert.equal(JSON.stringify(events).includes(synthetic.apiKey), false);
  assert.equal(JSON.stringify(events).includes(synthetic.apiSecret), false);
});

test("tampered envelope fields and wrong key fail authenticated closed", () => {
  for (const field of ["nonce", "ciphertext", "auth_tag", "key_version"]) {
    rmSync(directory, { recursive: true, force: true }); directory = mkdtempSync(join(tmpdir(), "dizy-custody-")); process.env.DATA_DIR = directory;
    storeCredentials({ ...binding, credentials: synthetic });
    const db = new DatabaseSync(custodyDatabasePathForTests());
    if (field === "key_version") db.prepare("UPDATE custody_records SET key_version=2").run();
    else db.prepare(`UPDATE custody_records SET ${field}=?`).run(field === "nonce" ? Buffer.alloc(12) : field === "auth_tag" ? Buffer.alloc(16) : Buffer.from("tampered"));
    db.close();
    assert.throws(() => withCredentials(binding, () => {}), /CREDENTIAL_CUSTODY_UNAVAILABLE/, field);
  }
  rmSync(directory, { recursive: true, force: true }); directory = mkdtempSync(join(tmpdir(), "dizy-custody-")); process.env.DATA_DIR = directory;
  storeCredentials({ ...binding, credentials: synthetic });
  process.env.CREDENTIAL_CUSTODY_KEYRING = JSON.stringify({ 1: Buffer.alloc(32, 99).toString("base64") });
  assert.throws(() => withCredentials(binding, () => {}), /CREDENTIAL_CUSTODY_UNAVAILABLE/);
});

test("configuration is disabled by default, strict, and separated from session/MFA keys", () => {
  for (const mutation of [
    () => { delete process.env.CREDENTIAL_CUSTODY_ENABLED; },
    () => { process.env.CREDENTIAL_CUSTODY_KEYRING = "not-json"; },
    () => { process.env.CREDENTIAL_CUSTODY_KEYRING = JSON.stringify({ 1: Buffer.alloc(16).toString("base64") }); },
    () => { process.env.CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION = "2"; },
    () => { process.env.MFA_ENCRYPTION_KEY = v1; },
    () => { process.env.SESSION_SECRET = Buffer.alloc(32, 17).toString("hex"); },
  ]) {
    mutation(); assert.throws(() => storeCredentials({ ...binding, credentials: synthetic }), /CREDENTIAL_CUSTODY_UNAVAILABLE/);
    process.env.CREDENTIAL_CUSTODY_ENABLED = "true"; process.env.CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION = "1";
    process.env.CREDENTIAL_CUSTODY_KEYRING = JSON.stringify({ 1: v1 }); delete process.env.MFA_ENCRYPTION_KEY; delete process.env.SESSION_SECRET;
  }
});

test("rejects reserved raw key bytes across supported encodings and raw session use", () => {
  const raw = Buffer.alloc(32, 17);
  const representations = [raw.toString("base64url"), raw.toString("base64"), raw.toString("hex")];
  for (const encoded of representations) {
    process.env.MFA_ENCRYPTION_KEY = encoded;
    assert.throws(() => storeCredentials({ ...binding, credentials: synthetic }), /CREDENTIAL_CUSTODY_UNAVAILABLE/, `MFA ${encoded}`);
    delete process.env.MFA_ENCRYPTION_KEY;
    process.env.SESSION_SECRET = encoded;
    assert.throws(() => storeCredentials({ ...binding, credentials: synthetic }), /CREDENTIAL_CUSTODY_UNAVAILABLE/, `session ${encoded}`);
    delete process.env.SESSION_SECRET;
  }
  process.env.SESSION_SECRET = "12345678901234567890123456789012";
  process.env.CREDENTIAL_CUSTODY_KEYRING = JSON.stringify({ 1: Buffer.from(process.env.SESSION_SECRET).toString("base64") });
  assert.throws(() => storeCredentials({ ...binding, credentials: synthetic }), /CREDENTIAL_CUSTODY_UNAVAILABLE/, "raw session secret");
});

test("rotation is atomic, versioned, and revoke prevents subsequent open without audit leakage", () => {
  storeCredentials({ ...binding, credentials: synthetic });
  process.env.CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION = "2"; process.env.CREDENTIAL_CUSTODY_KEYRING = JSON.stringify({ 1: v1, 2: v2 });
  assert.equal(rotateCredentials(binding).keyVersion, 2);
  process.env.CREDENTIAL_CUSTODY_KEYRING = JSON.stringify({ 2: v2 });
  let observed; withCredentials(binding, (value) => { observed = { ...value }; }); assert.deepEqual(observed, synthetic);
  revokeCredentials(binding); assert.throws(() => withCredentials(binding, () => {}), /CREDENTIAL_CUSTODY_UNAVAILABLE/);
  const bytes = readFileSync(custodyDatabasePathForTests());
  assert.equal(bytes.includes(Buffer.from(synthetic.apiKey)), false); assert.equal(bytes.includes(Buffer.from(synthetic.apiSecret)), false);
  const db = new DatabaseSync(custodyDatabasePathForTests());
  assert.deepEqual(db.prepare("SELECT event_type FROM custody_audit ORDER BY id").all().map((row) => row.event_type), ["create", "rotate", "open", "revoke"]); db.close();
});

test("unavailable historical key prevents rotation and leaves the authoritative row unchanged", () => {
  storeCredentials({ ...binding, credentials: synthetic });
  process.env.CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION = "2"; process.env.CREDENTIAL_CUSTODY_KEYRING = JSON.stringify({ 2: v2 });
  assert.throws(() => rotateCredentials(binding), /CREDENTIAL_CUSTODY_UNAVAILABLE/);
  const db = new DatabaseSync(custodyDatabasePathForTests());
  assert.equal(db.prepare("SELECT key_version FROM custody_records").get().key_version, 1); db.close();
});
