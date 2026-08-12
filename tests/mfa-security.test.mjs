import assert from "node:assert/strict";
import { createDecipheriv, createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertMfaConfiguration, authenticateDatabaseUserDetailed, beginMfaEnrollment, closeAuthDatabaseForTests, completeMfaChallenge, completeMfaEmailRecovery, confirmMfaEnrollment, consumeRateLimit, createAccount, createDatabaseSession, createEmailVerificationTokenForUser, createMfaChallenge, createMfaEmailRecoveryToken, databaseSession, disableMfa, getAuthDatabase, getMfaStatus, migratePrivilegedAccounts, regenerateRecoveryCodes, resetPasswordWithToken, createPasswordResetTokenForEmail, verifyCurrentMfa, verifyEmailToken } from "../app/lib/auth-db.ts";
import { POST as requestRecovery } from "../app/api/auth/mfa/email-recovery/request/route.ts";
import { POST as completeRecovery } from "../app/api/auth/mfa/email-recovery/complete/route.ts";
import { createSessionToken, parseSessionToken, VIEWER_USER } from "../app/lib/auth-session.ts";
const key=Buffer.alloc(32,7),now=1_800_000_000_000;
function code(secret,time=now){const c=Buffer.alloc(8);c.writeBigUInt64BE(BigInt(Math.floor(time/30000)));const h=createHmac("sha1",secret).update(c).digest(),o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1e6).padStart(6,"0")}
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),"dizy-mfa-")),prior={data:process.env.DATA_DIR,key:process.env.MFA_ENCRYPTION_KEY,node:process.env.NODE_ENV};process.env.DATA_DIR=root;process.env.MFA_ENCRYPTION_KEY=key.toString("base64url");process.env.NODE_ENV="test";closeAuthDatabaseForTests();try{const user=await createAccount({email:"mfa@example.test",password:"correct-horse-battery"});verifyEmailToken(createEmailVerificationTokenForUser(user.id).token);await fn(user)}finally{closeAuthDatabaseForTests();if(prior.data===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=prior.data;if(prior.key===undefined)delete process.env.MFA_ENCRYPTION_KEY;else process.env.MFA_ENCRYPTION_KEY=prior.key;if(prior.node===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=prior.node;await rm(root,{recursive:true,force:true})}}
function secret(){const row=getAuthDatabase().prepare("SELECT secret_ciphertext,nonce,auth_tag FROM mfa_credentials").get(),d=createDecipheriv("aes-256-gcm",key,row.nonce);d.setAAD(Buffer.from("dizytrades:mfa:v1"));d.setAuthTag(row.auth_tag);return Buffer.concat([d.update(row.secret_ciphertext),d.final()])}
function routeRequest(path, body, ip="203.0.113.10") { return new Request(`http://localhost${path}`, { method:"POST", headers:{"content-type":"application/json","x-forwarded-for":ip}, body:typeof body === "string" ? body : JSON.stringify(body) }); }
async function responseShape(response) { return { status:response.status, body:await response.json() }; }
function activateMfa(userId, time=Date.now()) { beginMfaEnrollment(userId); return confirmMfaEnrollment(userId,code(secret(),time),time); }
function securityState(userId) { return getAuthDatabase().prepare(`SELECT u.id,u.role,u.password_hash,u.email,u.email_verified_at,
  (SELECT count(*) FROM mfa_credentials WHERE user_id=u.id) credential_count,
  (SELECT count(*) FROM mfa_recovery_codes WHERE user_id=u.id) recovery_count,
  (SELECT count(*) FROM mfa_challenges WHERE user_id=u.id) challenge_count,
  (SELECT count(*) FROM sessions WHERE user_id=u.id) session_count
  FROM users u WHERE u.id=?`).get(userId); }
test("pending enrollment encrypts its secret and valid TOTP activates MFA",()=>fixture(async user=>{const plaintext=beginMfaEnrollment(user.id),row=getAuthDatabase().prepare("SELECT state,secret_ciphertext FROM mfa_credentials").get();assert.equal(row.state,"pending");assert.equal(Buffer.from(row.secret_ciphertext).includes(Buffer.from(plaintext)),false);assert.equal(confirmMfaEnrollment(user.id,"000000",now),null);const recovery=confirmMfaEnrollment(user.id,code(secret()),now);assert.equal(recovery.length,10);assert.deepEqual(getMfaStatus(user.id),{enabled:true,pending:false})}));
test("challenge is fresh, expiring and single use; recovery is single use",()=>fixture(async user=>{beginMfaEnrollment(user.id);const recovery=confirmMfaEnrollment(user.id,code(secret()),now),challenge=createMfaChallenge(user.id,now);assert.equal(completeMfaChallenge(challenge+"x",code(secret()),now),null);assert.equal(completeMfaChallenge(challenge,code(secret()),now+300001),null);const good=createMfaChallenge(user.id,now);assert.equal(completeMfaChallenge(good,code(secret()),now).user.id,user.id);assert.equal(completeMfaChallenge(good,code(secret()),now),null);const rc=createMfaChallenge(user.id,now);assert.equal(completeMfaChallenge(rc,recovery[0],now).recoveryUsed,true);assert.equal(completeMfaChallenge(createMfaChallenge(user.id,now),recovery[0],now),null)}));
test("recovery regeneration invalidates old codes and disable revokes sessions",()=>fixture(async user=>{beginMfaEnrollment(user.id);const old=confirmMfaEnrollment(user.id,code(secret()),now),token=createDatabaseSession(user,3600);assert.equal(verifyCurrentMfa(user.id,old[0],now),true);const next=regenerateRecoveryCodes(user.id);assert.equal(next.length,10);assert.equal(verifyCurrentMfa(user.id,old[1],now),false);assert.equal(databaseSession(token),null);const token2=createDatabaseSession(user,3600);assert.equal(disableMfa(user.id),true);assert.equal(databaseSession(token2),null)}));
test("production MFA encryption key fails closed",()=>fixture(async user=>{process.env.NODE_ENV="production";delete process.env.MFA_ENCRYPTION_KEY;assert.throws(()=>beginMfaEnrollment(user.id),/MFA_ENCRYPTION_KEY/);process.env.MFA_ENCRYPTION_KEY="short";assert.throws(()=>beginMfaEnrollment(user.id),/MFA_ENCRYPTION_KEY/)}));
test("active MFA cannot be downgraded by beginning password-only enrollment again",()=>fixture(async user=>{beginMfaEnrollment(user.id);const recovery=confirmMfaEnrollment(user.id,code(secret()),now),before=getAuthDatabase().prepare("SELECT state,hex(secret_ciphertext) secret,(SELECT count(*) FROM mfa_recovery_codes WHERE user_id=?) recovery_count FROM mfa_credentials WHERE user_id=?").get(user.id,user.id);assert.throws(()=>beginMfaEnrollment(user.id),/MFA_ALREADY_ACTIVE/);const after=getAuthDatabase().prepare("SELECT state,hex(secret_ciphertext) secret,(SELECT count(*) FROM mfa_recovery_codes WHERE user_id=?) recovery_count FROM mfa_credentials WHERE user_id=?").get(user.id,user.id);assert.deepEqual(after,before);assert.equal(verifyCurrentMfa(user.id,recovery[0],now),true)}));
test("exact configured SESSION_SECRET reuse as the MFA key fails closed",()=>fixture(async()=>{process.env.NODE_ENV="production";process.env.SESSION_SECRET=process.env.MFA_ENCRYPTION_KEY;assert.throws(()=>assertMfaConfiguration(),/must not reuse/);delete process.env.SESSION_SECRET}));
test("persisted MFA proof buckets are bounded without proof material in keys",()=>fixture(async user=>{const keys=[`mfa:disable:user:${user.id}`,"mfa:disable:ip:203.0.113.20"];for(let i=0;i<5;i++)assert.equal(consumeRateLimit(keys,5,60_000),false);assert.equal(consumeRateLimit(keys,5,60_000),true);const rows=getAuthDatabase().prepare("SELECT bucket FROM auth_attempts").all();assert.equal(rows.length,2);assert.equal(JSON.stringify(rows).includes("123456"),false)}));
test("verified-email break-glass recovery is hashed, expiring, single-use, and atomically revokes MFA state",()=>fixture(async user=>{
  beginMfaEnrollment(user.id); const codes=confirmMfaEnrollment(user.id,code(secret()),now);
  const session=createDatabaseSession(user,3600), challenge=createMfaChallenge(user.id,now), recovery=createMfaEmailRecoveryToken(challenge,now);
  assert.ok(recovery); const stored=getAuthDatabase().prepare("SELECT token_hash FROM mfa_email_recovery_tokens").get();
  assert.notEqual(stored.token_hash,recovery.token); assert.equal(stored.token_hash.includes(recovery.token),false);
  assert.equal(completeMfaEmailRecovery(recovery.token,now+900001),false);
  assert.deepEqual(getMfaStatus(user.id),{enabled:true,pending:false}); assert.equal(verifyCurrentMfa(user.id,codes[0],now),true);
  const next=createMfaEmailRecoveryToken(createMfaChallenge(user.id,now),now); assert.ok(next);
  assert.equal(completeMfaEmailRecovery(recovery.token,now),false,"new request invalidates old token");
  assert.equal(completeMfaEmailRecovery(next.token,now),true); assert.equal(completeMfaEmailRecovery(next.token,now),false);
  assert.deepEqual(getMfaStatus(user.id),{enabled:false,pending:false}); assert.equal(databaseSession(session),null);
  assert.equal(getAuthDatabase().prepare("SELECT count(*) n FROM mfa_recovery_codes WHERE user_id=?").get(user.id).n,0);
  assert.equal(getAuthDatabase().prepare("SELECT count(*) n FROM mfa_challenges WHERE user_id=?").get(user.id).n,0);
  assert.equal(getAuthDatabase().prepare("SELECT role FROM users WHERE id=?").get(user.id).role,"user");
  assert.ok(beginMfaEnrollment(user.id),"fresh enrollment can begin");
}));
test("password reset leaves active MFA and identity unchanged",()=>fixture(async user=>{
  beginMfaEnrollment(user.id); confirmMfaEnrollment(user.id,code(secret()),now);
  const before=getAuthDatabase().prepare("SELECT id,role,password_hash,email_verified_at FROM users WHERE id=?").get(user.id);
  const reset=createPasswordResetTokenForEmail(user.email); assert.ok(reset); assert.equal(await resetPasswordWithToken(reset.token,"a-brand-new-password"),true);
  const after=getAuthDatabase().prepare("SELECT id,role,password_hash,email_verified_at FROM users WHERE id=?").get(user.id);
  assert.equal(after.id,before.id); assert.equal(after.role,before.role); assert.equal(after.email_verified_at,before.email_verified_at); assert.notEqual(after.password_hash,before.password_hash);
  assert.deepEqual(getMfaStatus(user.id),{enabled:true,pending:false});
}));

test("recovery request route is enumeration-safe and persists IP and account throttles",()=>fixture(async user=>{
  activateMfa(user.id);
  const expected={status:202,body:{message:"If this MFA challenge is eligible, a recovery email has been sent."}};
  assert.deepEqual(await responseShape(await requestRecovery(routeRequest("/api/auth/mfa/email-recovery/request","{"))),expected,"malformed JSON is generic");
  assert.deepEqual(await responseShape(await requestRecovery(routeRequest("/api/auth/mfa/email-recovery/request",{challenge:"invalid"},"203.0.113.11"))),expected,"invalid challenge is generic");
  const ineligible=createMfaChallenge(user.id); getAuthDatabase().prepare("UPDATE users SET email_verified_at=NULL WHERE id=?").run(user.id);
  assert.deepEqual(await responseShape(await requestRecovery(routeRequest("/api/auth/mfa/email-recovery/request",{challenge:ineligible},"203.0.113.12"))),expected,"ineligible challenge is generic");
  getAuthDatabase().prepare("UPDATE users SET email_verified_at=datetime('now') WHERE id=?").run(user.id);

  for(let i=0;i<3;i++) {
    const challenge=createMfaChallenge(user.id);
    assert.deepEqual(await responseShape(await requestRecovery(routeRequest("/api/auth/mfa/email-recovery/request",{challenge},`203.0.113.${20+i}`))),expected);
  }
  const issued=getAuthDatabase().prepare("SELECT count(*) n FROM mfa_email_recovery_tokens WHERE user_id=?").get(user.id).n;
  assert.equal(issued,1,"eligible requests issue a token while replacing the prior token");
  const accountLimited=createMfaChallenge(user.id);
  assert.deepEqual(await responseShape(await requestRecovery(routeRequest("/api/auth/mfa/email-recovery/request",{challenge:accountLimited},"203.0.113.30"))),expected,"account-limited response is generic");
  assert.ok(getAuthDatabase().prepare("SELECT 1 FROM mfa_challenges WHERE token_hash IS NOT NULL AND consumed_at IS NULL AND user_id=?").get(user.id),"account throttle prevents issuance/consumption");

  const ip="203.0.113.40";
  for(let i=0;i<3;i++) await requestRecovery(routeRequest("/api/auth/mfa/email-recovery/request",{challenge:"invalid"},ip));
  assert.deepEqual(await responseShape(await requestRecovery(routeRequest("/api/auth/mfa/email-recovery/request",{challenge:createMfaChallenge(user.id)},ip))),expected,"IP-limited response is generic");
  const buckets=getAuthDatabase().prepare("SELECT bucket,count FROM auth_attempts ORDER BY bucket").all();
  assert.ok(buckets.filter(row=>row.count===3).length>=2,"both account and IP buckets reach their persisted issuance bound");
  assert.equal(JSON.stringify(buckets).includes(accountLimited),false,"rate-limit persistence contains no challenge material");
}));

test("completion route enforces IP and resolved-user throttles without token leakage",()=>fixture(async user=>{
  activateMfa(user.id); const token=createMfaEmailRecoveryToken(createMfaChallenge(user.id)).token;
  const before=securityState(user.id), ip="203.0.113.50";
  for(let i=0;i<8;i++) assert.equal(consumeRateLimit([`mfa-email-recovery:complete:ip:${ip}`],8,15*60_000),false);
  const ipLimited=await completeRecovery(routeRequest("/api/auth/mfa/email-recovery/complete",{token},ip));
  assert.deepEqual(await responseShape(ipLimited),{status:429,body:{error:"Recovery link is invalid or expired."}});
  assert.deepEqual(securityState(user.id),before);
  const userIp="203.0.113.51";
  for(let i=0;i<5;i++) assert.equal(consumeRateLimit([`mfa-email-recovery:complete:user:${user.id}`],5,15*60_000),false);
  const userLimited=await completeRecovery(routeRequest("/api/auth/mfa/email-recovery/complete",{token},userIp));
  assert.deepEqual(await responseShape(userLimited),{status:400,body:{error:"Recovery link is invalid or expired."}});
  assert.deepEqual(securityState(user.id),before);
  assert.equal(JSON.stringify(getAuthDatabase().prepare("SELECT bucket FROM auth_attempts").all()).includes(token),false);
}));

test("invalid, expired, and replayed completion fail closed without mutating account security state",()=>fixture(async user=>{
  activateMfa(user.id); createDatabaseSession(user,3600); createMfaChallenge(user.id);
  const before=securityState(user.id);
  assert.equal(completeMfaEmailRecovery("A".repeat(43)),false); assert.deepEqual(securityState(user.id),before);
  const expired=createMfaEmailRecoveryToken(createMfaChallenge(user.id),Date.now()-900_001);
  const withExpired=securityState(user.id); assert.equal(completeMfaEmailRecovery(expired.token),false); assert.deepEqual(securityState(user.id),withExpired);
  const valid=createMfaEmailRecoveryToken(createMfaChallenge(user.id)); assert.equal(completeMfaEmailRecovery(valid.token),true);
  const recovered=securityState(user.id); assert.equal(completeMfaEmailRecovery(valid.token),false); assert.deepEqual(securityState(user.id),recovered);
}));

test("break-glass keeps the password and permits fresh database authentication and MFA enrollment",()=>fixture(async user=>{
  activateMfa(user.id); const token=createMfaEmailRecoveryToken(createMfaChallenge(user.id)).token;
  assert.equal(completeMfaEmailRecovery(token),true);
  const login=await authenticateDatabaseUserDetailed(user.email,"correct-horse-battery");
  assert.equal(login.status,"authenticated"); assert.equal(login.mfaEnabled,false); assert.equal(login.user.id,user.id);
  assert.ok(beginMfaEnrollment(user.id)); assert.deepEqual(getMfaStatus(user.id),{enabled:false,pending:true});
}));

test("links for a disabled credential cannot disable a newly enrolled credential",()=>fixture(async user=>{
  activateMfa(user.id); const stale=createMfaEmailRecoveryToken(createMfaChallenge(user.id)).token;
  assert.equal(disableMfa(user.id),true); activateMfa(user.id);
  assert.equal(completeMfaEmailRecovery(stale),false); assert.deepEqual(getMfaStatus(user.id),{enabled:true,pending:false});
}));

test("privileged owner and admin identities remain stable across break-glass recovery",async()=>{
  const root=await mkdtemp(join(tmpdir(),"dizy-mfa-privileged-"));
  const prior=Object.fromEntries(["DATA_DIR","MFA_ENCRYPTION_KEY","NODE_ENV","ROB_EMAIL","FRIEND_EMAIL","ROB_PASSWORD","FRIEND_PASSWORD","LEGACY_AUTH_FALLBACK_ENABLED","ALLOW_TEST_PLAINTEXT_PASSWORDS","LIVE_TRADING_ENABLED"].map(name=>[name,process.env[name]]));
  Object.assign(process.env,{DATA_DIR:root,MFA_ENCRYPTION_KEY:key.toString("base64url"),NODE_ENV:"test",ROB_EMAIL:"fixture-owner@example.test",FRIEND_EMAIL:"fixture-admin@example.test",ROB_PASSWORD:"fixture owner password",FRIEND_PASSWORD:"fixture admin password",LEGACY_AUTH_FALLBACK_ENABLED:"true",ALLOW_TEST_PLAINTEXT_PASSWORDS:"true",LIVE_TRADING_ENABLED:"false"});
  closeAuthDatabaseForTests();
  try {
    const owner={id:"rob",name:"Rob",email:process.env.ROB_EMAIL,role:"owner"},legacyOwner=createSessionToken(owner,3600),viewer=createSessionToken(VIEWER_USER,3600);
    assert.deepEqual(parseSessionToken(legacyOwner),owner); assert.equal((await migratePrivilegedAccounts()).status,"migrated"); assert.equal(parseSessionToken(legacyOwner),null); assert.deepEqual(parseSessionToken(viewer),VIEWER_USER); activateMfa("rob");
    const databaseToken=createDatabaseSession(owner,3600),token=createMfaEmailRecoveryToken(createMfaChallenge("rob")).token; assert.equal(completeMfaEmailRecovery(token),true);
    assert.equal(databaseSession(databaseToken),null); assert.equal(parseSessionToken(legacyOwner),null); assert.deepEqual(parseSessionToken(viewer),VIEWER_USER);
    assert.deepEqual(getAuthDatabase().prepare("SELECT id,role FROM users WHERE id IN ('rob','friend') ORDER BY id").all().map(row=>({...row})),[{id:"friend",role:"admin"},{id:"rob",role:"owner"}]);
  } finally {
    closeAuthDatabaseForTests(); for(const [name,value] of Object.entries(prior)) { if(value===undefined) delete process.env[name]; else process.env[name]=value; } await rm(root,{recursive:true,force:true});
  }
});
