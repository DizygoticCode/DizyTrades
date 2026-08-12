import assert from "node:assert/strict";
import { createDecipheriv, createHmac } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { authenticateDatabaseUserDetailed, beginMfaEnrollment, closeAuthDatabaseForTests, confirmMfaEnrollment, createDatabaseSession, getAuthDatabase, migratePrivilegedAccounts, revokeDatabaseSession } from "../app/lib/auth-db.ts";
import { beginProvisioningAuthorization, credentialStatus, PROVISIONING_TTL_MS, provisionCredential, provisioningAvailability, revokeCredential } from "../app/lib/credential-provisioning/index.ts";
import { custodyDatabasePathForTests } from "../app/lib/credential-custody/index.ts";

const mfaKey = Buffer.alloc(32, 31), custodyKey = Buffer.alloc(32, 47), password = "runtime-owner-password";
function totp(secret, time) { const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(time/30_000)));const mac=createHmac("sha1",secret).update(counter).digest(),offset=mac[19]&15;return String((mac.readUInt32BE(offset)&0x7fffffff)%1e6).padStart(6,"0"); }
function mfaSecret() { const row=getAuthDatabase().prepare("SELECT secret_ciphertext,nonce,auth_tag FROM mfa_credentials WHERE user_id='rob'").get(),decipher=createDecipheriv("aes-256-gcm",mfaKey,row.nonce);decipher.setAAD(Buffer.from("dizytrades:mfa:v1"));decipher.setAuthTag(row.auth_tag);return Buffer.concat([decipher.update(row.secret_ciphertext),decipher.final()]); }
async function fixture(run) {
  const root=await mkdtemp(join(tmpdir(),"dizy-provisioning-")), prior={...process.env};
  Object.assign(process.env,{DATA_DIR:root,NODE_ENV:"test",MFA_ENCRYPTION_KEY:mfaKey.toString("base64url"),CREDENTIAL_CUSTODY_ENABLED:"true",CREDENTIAL_PROVISIONING_ENABLED:"true",CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION:"1",CREDENTIAL_CUSTODY_KEYRING:JSON.stringify({1:custodyKey.toString("base64")}),LIVE_TRADING_ENABLED:"false",ROB_EMAIL:"owner-runtime@example.test",ROB_PASSWORD:password,ROB_NAME:"Runtime Owner",FRIEND_EMAIL:"admin-runtime@example.test",FRIEND_PASSWORD:"runtime-admin-password",LEGACY_AUTH_FALLBACK_ENABLED:"true",ALLOW_TEST_PLAINTEXT_PASSWORDS:"true"});
  closeAuthDatabaseForTests();
  try { await migratePrivilegedAccounts(); const login=await authenticateDatabaseUserDetailed(process.env.ROB_EMAIL,password); assert.equal(login.status,"authenticated"); const now=Date.now(); beginMfaEnrollment("rob"); const secret=mfaSecret(); assert.ok(confirmMfaEnrollment("rob",totp(secret,now),now)); const session=createDatabaseSession(login.user,3600); await run({session,secret,now}); }
  finally { closeAuthDatabaseForTests(); for(const key of Object.keys(process.env)) if(!(key in prior)) delete process.env[key]; Object.assign(process.env,prior); await rm(root,{recursive:true,force:true}); }
}
const auth=(session,secret,now,purpose="provision")=>beginProvisioningAuthorization({userId:"rob",sessionToken:session,purpose,password,totp:totp(secret,now)},now);
const provision=(token,session,accountRef="owner-primary",now=Date.now())=>provisionCredential({token,userId:"rob",sessionToken:session,accountRef,apiKey:"synthetic-key-never-log",apiSecret:"synthetic-secret-never-log"},now);

test("runtime authorizations expire, are single-use, purpose-bound, session-bound, and superseded",()=>fixture(async({session,secret,now})=>{
  const expired=await auth(session,secret,now); assert.throws(()=>provision(expired,session,"expired",now+PROVISIONING_TTL_MS+1),/AUTHORIZATION_INVALID/);
  const wrongPurpose=await auth(session,secret,now+30_000,"revoke"); assert.throws(()=>provision(wrongPurpose,session,"purpose",now+30_000),/AUTHORIZATION_INVALID/);
  const old=await auth(session,secret,now+60_000), fresh=await auth(session,secret,now+90_000); assert.throws(()=>provision(old,session,"old",now+90_000),/AUTHORIZATION_INVALID/); provision(fresh,session,"fresh",now+90_000); assert.throws(()=>provision(fresh,session,"replay",now+90_000),/AUTHORIZATION_INVALID/);
  const bound=await auth(session,secret,now+120_000),session2=createDatabaseSession({id:"rob",username:"rob",displayName:"Runtime Owner",role:"owner"},3600); assert.throws(()=>provision(bound,session2,"bound",now+120_000),/AUTHORIZATION_INVALID|PROVISIONING_UNAVAILABLE/);
}));

test("runtime boundary requires a current database owner session and preserves non-overwrite/revoke/re-provision",()=>fixture(async({session,secret,now})=>{
  const first=await auth(session,secret,now); const metadata=provision(first,session,"owner-primary",now); assert.equal(metadata.accountRef,"owner-primary"); assert.deepEqual(Object.keys(metadata).sort(),["accountRef","createdAt","envelopeVersion","exchange","keyVersion","purpose","recordId","updatedAt","userId"].sort());
  const overwrite=await auth(session,secret,now+30_000); assert.throws(()=>provision(overwrite,session,"owner-primary",now+30_000),/ALREADY_CONFIGURED/);
  const revoke=await auth(session,secret,now+60_000,"revoke"); revokeCredential({token:revoke,userId:"rob",sessionToken:session,accountRef:"owner-primary"},now+60_000); assert.equal(credentialStatus("rob","owner-primary"),null);
  const again=await auth(session,secret,now+90_000); provision(again,session,"owner-primary",now+90_000); revokeDatabaseSession(session);
  await assert.rejects(auth(session,secret,now+120_000),/PROVISIONING_UNAVAILABLE/);
  const database=await readFile(custodyDatabasePathForTests()); assert.equal(database.includes(Buffer.from("synthetic-key-never-log")),false); assert.equal(database.includes(Buffer.from("synthetic-secret-never-log")),false);
}));

test("disabled flags fail closed without creating plaintext custody",()=>fixture(async({session,secret,now})=>{
  process.env.CREDENTIAL_PROVISIONING_ENABLED="false"; assert.deepEqual(provisioningAvailability(),{enabled:false,liveTradingEnabled:false}); await assert.rejects(auth(session,secret,now),/PROVISIONING_UNAVAILABLE/); assert.equal(credentialStatus("rob","owner-primary"),null);
  process.env.CREDENTIAL_PROVISIONING_ENABLED="true"; process.env.CREDENTIAL_CUSTODY_ENABLED="false"; await assert.rejects(auth(session,secret,now),/PROVISIONING_UNAVAILABLE/);
}));
