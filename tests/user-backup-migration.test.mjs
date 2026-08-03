import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {readManualAccount} from "../app/lib/manual-paper.ts";
import {backupContentHash,validateDizyTradesBackup} from "../app/lib/user-backup-model.ts";
import {applyUserBackupRestore,buildUserBackup,planUserBackupRestore} from "../app/lib/user-backup-store.ts";

async function isolated(operation){const previous=process.env.DATA_DIR,root=await mkdtemp(join(tmpdir(),"dizy-backup-migration-"));process.env.DATA_DIR=root;try{return await operation()}finally{if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;await rm(root,{recursive:true,force:true})}}
const legacyFill=(user)=>({orderId:"legacy-order",fillId:"legacy-fill",idempotencyKey:"legacy-backup-key-01",userId:user,symbol:"BTC_USDT",side:"close",price:95,entryPrice:100,quantity:1,notional:95,fee:.06,entryFee:.06,exitFee:.06,timestamp:"2026-07-02T10:15:00.000Z",openedAt:"2026-07-02T10:00:00.000Z",closeReason:"manual",grossPnl:-5,netPnl:-5.12,realisedPnl:-5.12,resultingBalance:9994.82});
function asLegacyV1(current,user){const legacy=structuredClone(current),paper=legacy.data.manualPaper;legacy.version=1;delete legacy.migration;paper.version=3;delete paper.migration;paper.fills=[legacyFill(user)];paper.cashBalance=9994.82;paper.realisedPnl=-5.12;paper.fees=.12;paper.idempotencyKeys=["legacy-backup-key-01"];paper.updatedAt="2026-07-02T10:15:00.000Z";delete paper.marginSnapshot;const content={version:1,ownerId:legacy.ownerId,generatedAt:legacy.generatedAt,application:legacy.application,data:legacy.data,warnings:legacy.warnings};legacy.integrity={algorithm:"sha256",contentHash:backupContentHash(content)};return legacy}

test("v1 full backups verify their original hash before deterministic migration to v2",()=>isolated(async()=>{
 const user="backup_migration_owner",current=await buildUserBackup(user),legacy=asLegacyV1(current,user),sourceHash=legacy.integrity.contentHash,migrated=validateDizyTradesBackup(legacy,user);
 assert.equal(migrated.version,2);assert.equal(migrated.migration.sourceBackupVersion,1);assert.equal(migrated.migration.targetBackupVersion,2);assert.equal(migrated.migration.sourceContentHash,sourceHash);assert.equal(migrated.data.manualPaper.version,4);assert.equal(migrated.data.manualPaper.migration.sourceAccountVersion,3);assert.equal(migrated.data.manualPaper.fills[0].price,95);assert.equal(migrated.data.manualPaper.fills[0].netPnl,-5.12);
 const again=validateDizyTradesBackup(legacy,user);assert.equal(again.integrity.contentHash,migrated.integrity.contentHash);
 const plan=await planUserBackupRestore(user,legacy);assert.equal(plan.safeToApply,true);assert.equal(plan.manualPaper,"restore");assert.equal(plan.migration.sourceBackupVersion,1);const repeated=await planUserBackupRestore(user,legacy);assert.equal(repeated.backupHash,plan.backupHash);
 const result=await applyUserBackupRestore(user,legacy,plan.backupHash);assert.equal(result.manualPaperRestored,true);const restored=await readManualAccount(user);assert.equal(restored.version,4);assert.equal(restored.fills[0].history.sourceAccountVersion,3);assert.equal(restored.fills[0].price,95)
}));

test("legacy backup tampering fails before migration and future backup versions are rejected",()=>isolated(async()=>{
 const user="backup_migration_tamper",legacy=asLegacyV1(await buildUserBackup(user),user),tampered=structuredClone(legacy);tampered.data.manualPaper.fills[0].price=96;assert.throws(()=>validateDizyTradesBackup(tampered,user),/before migration/i);const future=structuredClone(await buildUserBackup(user));future.version=3;assert.throws(()=>validateDizyTradesBackup(future,user),/unsupported dizytrades backup version/i)
}));
