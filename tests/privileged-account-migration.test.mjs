import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { authenticateDatabaseUserDetailed, closeAuthDatabaseForTests, createPasswordResetTokenForEmail, getAuthDatabase, migratePrivilegedAccounts } from "../app/lib/auth-db.ts";

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "dizy-privileged-"));
  const saved = Object.fromEntries(["DATA_DIR","NODE_ENV","ROB_EMAIL","FRIEND_EMAIL","ROB_PASSWORD","FRIEND_PASSWORD"].map(key=>[key,process.env[key]]));
  Object.assign(process.env,{DATA_DIR:root,NODE_ENV:"test",ROB_EMAIL:"rob.noyce@gmail.com",FRIEND_EMAIL:"nickspencer44@gmail.com",ROB_PASSWORD:"owner-password-for-migration",FRIEND_PASSWORD:"admin-password-for-migration"});
  closeAuthDatabaseForTests();
  try { await run(); } finally { closeAuthDatabaseForTests(); for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value} await rm(root,{recursive:true,force:true}); }
}

test("trusted migration creates verified stable privileged database identities once",()=>fixture(async()=>{
  assert.equal(await migratePrivilegedAccounts(),true);
  const rows=getAuthDatabase().prepare("SELECT id,email,display_name,role,email_verified_at,password_hash FROM users ORDER BY id").all();
  assert.deepEqual(rows.map(({id,email,display_name,role})=>({id,email,display_name,role})),[
    {id:"friend",email:"nickspencer44@gmail.com",display_name:"Nick",role:"admin"},
    {id:"rob",email:"rob.noyce@gmail.com",display_name:"Rob",role:"owner"},
  ]);
  assert.ok(rows.every(row=>row.email_verified_at&&row.password_hash.startsWith("scrypt$")));
  const before=rows.map(row=>row.password_hash);process.env.ROB_PASSWORD="changed-password-must-not-apply";process.env.FRIEND_PASSWORD="changed-password-must-not-apply";
  assert.equal(await migratePrivilegedAccounts(),false);
  assert.deepEqual(getAuthDatabase().prepare("SELECT password_hash FROM users ORDER BY id").all().map(row=>row.password_hash),before);
  assert.equal((await authenticateDatabaseUserDetailed("friend","admin-password-for-migration")).status,"authenticated");
  assert.equal(createPasswordResetTokenForEmail("nickspencer44@gmail.com")?.email,"nickspencer44@gmail.com");
}));

test("trusted migration fails closed on occupied IDs or emails",()=>fixture(async()=>{
  const now=new Date().toISOString();
  getAuthDatabase().prepare("INSERT INTO users(id,username,username_normalized,email,email_normalized,password_hash,display_name,role,created_at,email_verified_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run("rob","intruder","intruder","intruder@example.test","intruder@example.test","invalid","Intruder","user",now,now);
  await assert.rejects(migratePrivilegedAccounts(),/PRIVILEGED_ACCOUNT_CONFLICT/);
  assert.equal(getAuthDatabase().prepare("SELECT COUNT(*) count FROM users").get().count,1);
}));
