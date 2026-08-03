import {readFile,writeFile} from "node:fs/promises";

const replaceOnce=(source,from,to,label)=>{const index=source.indexOf(from);if(index<0)throw new Error("Missing "+label);if(source.indexOf(from,index+from.length)>=0)throw new Error("Ambiguous "+label);return source.slice(0,index)+to+source.slice(index+from.length)};

let client=await readFile("app/backup/backup-client.tsx","utf8");
client=replaceOnce(client,
 'type LoadedBackup = Readonly<{\n  name: string;\n  bytes: number;\n  backup: DizyTradesBackup;\n}>;',
 'type BackupUpload=Omit<DizyTradesBackup,"version"|"migration">&Readonly<{version:1|2;migration?:DizyTradesBackup["migration"]}>;\ntype LoadedBackup = Readonly<{\n  name: string;\n  bytes: number;\n  backup: BackupUpload;\n}>;',
 "backup upload type");
client=replaceOnce(client,
 '      const parsed = JSON.parse(await file.text()) as DizyTradesBackup;\n      if (!parsed || parsed.version !== 1 || parsed.application?.name !== "DizyTrades") {',
 '      const parsed = JSON.parse(await file.text()) as BackupUpload;\n      if (!parsed || (parsed.version !== 1 && parsed.version !== 2) || parsed.application?.name !== "DizyTrades") {',
 "versioned upload parsing");
client=replaceOnce(client,
 '              <span>Created {new Date(loaded.backup.generatedAt).toLocaleString()}</span>\n              <span>Hash',
 '              <span>Backup schema v{loaded.backup.version} · Created {new Date(loaded.backup.generatedAt).toLocaleString()}</span>\n              <span>Hash',
 "loaded schema display");
client=replaceOnce(client,
 '                <div><dt>Manual Paper</dt><dd>{plan.manualPaper.replaceAll("-", " ")}</dd></div>\n              </dl>',
 '                <div><dt>Manual Paper</dt><dd>{plan.manualPaper.replaceAll("-", " ")}</dd></div>\n                <div><dt>Backup schema</dt><dd>v{plan.migration.sourceBackupVersion} → v{plan.migration.targetBackupVersion}</dd></div>\n                <div><dt>Paper history</dt><dd>{plan.migration.manualPaper.migrated ? "migrated from v"+plan.migration.manualPaper.sourceAccountVersion : "native v"+plan.migration.manualPaper.targetAccountVersion}</dd></div>\n                <div><dt>Preserved Paper fills</dt><dd>{count(plan.migration.manualPaper.fillCount)}</dd></div>\n              </dl>',
 "migration plan display");
client=replaceOnce(client,
 '        <article><b>Paper safety</b><span>Open or existing Manual Paper state is never overwritten.</span></article>',
 '        <article><b>Paper safety</b><span>Open or existing Manual Paper state is never overwritten.</span></article>\n        <article><b>Versioned migration</b><span>Older valid backups are hash-checked before recorded trade values are preserved into the current schema.</span></article>',
 "migration safety rule");
await writeFile("app/backup/backup-client.tsx",client,"utf8");

let roadmap=await readFile("ROADMAP.md","utf8");
roadmap=replaceOnce(roadmap,'- [ ] migration-safe history and backup support','- [x] migration-safe history and backup support',"roadmap completion");
roadmap=replaceOnce(roadmap,
 'Next slice: migration-safe history and backup support.',
 'Migration-safe history and backup support is complete: Manual Paper account v2/v3 records migrate deterministically to v4, fill economics are hash-preserved with unavailable evidence declared rather than invented, full backup v1 files are integrity-verified before migration to v2, and dry-run/apply fingerprints remain stable. DizyPaper Fidelity V2 is complete.',
 "roadmap summary");
await writeFile("ROADMAP.md",roadmap,"utf8");

let userTest=await readFile("tests/user-backup.test.mjs","utf8");
userTest=userTest.replace('assert.equal(backup.version, 1);','assert.equal(backup.version, 2);').replace('assert.equal(backup.data.manualPaper.version, 3);','assert.equal(backup.data.manualPaper.version, 4);').replace('assert.equal(validated.version, 3);','assert.equal(validated.version, 4);');
await writeFile("tests/user-backup.test.mjs",userTest,"utf8");

await writeFile("tests/manual-paper-history.test.mjs",String.raw`import assert from "node:assert/strict";
import {mkdir,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {readManualAccount} from "../app/lib/manual-paper.ts";
import {validateManualPaperBackup} from "../app/lib/manual-paper-backup.ts";

const settings={enabled:true,showQuickButtons:true,commissionPct:.06,slippagePct:.02,allowAdding:false,confirmationRequired:true,defaultSizeMode:"fixed-margin",defaultAmount:100,defaultEquityPct:1,defaultLeverage:1,panelHeight:260,panelCollapsed:false,panelHidden:false};
const fill=(userId,side,price,realisedPnl,resultingBalance,id)=>({orderId:"legacy-order-"+id,fillId:"legacy-fill-"+id,idempotencyKey:"legacy-history-key-"+id,userId,symbol:"BTC_USDT",side,price,quantity:1,notional:price,fee:.06,timestamp:"2026-07-01T10:0"+id+":00.000Z",realisedPnl,resultingBalance});
const legacyV2=(userId)=>({version:2,cashBalance:9989.88,startingBalance:10000,realisedPnl:-10,fees:.12,positions:{},fills:[fill(userId,"long",100,0,9999.94,"1"),fill(userId,"close",90,-10,9989.88,"2")],idempotencyKeys:["legacy-history-key-1","legacy-history-key-2"],settings,updatedAt:"2026-07-01T10:02:00.000Z"});
const economics=(item)=>({price:item.price,quantity:item.quantity,notional:item.notional,fee:item.fee,realisedPnl:item.realisedPnl,resultingBalance:item.resultingBalance,timestamp:item.timestamp});

test("v2 Paper history migrates to v4 without rewriting economic values",()=>{
 const user="legacy_history_owner",legacy=legacyV2(user),before=legacy.fills.map(economics),migrated=validateManualPaperBackup(legacy,user);
 assert.equal(migrated.version,4);assert.equal(migrated.migration.sourceAccountVersion,2);assert.equal(migrated.migration.targetAccountVersion,4);assert.equal(migrated.migration.migrated,true);assert.equal(migrated.migration.fillCount,2);assert.deepEqual(migrated.fills.map(economics),before);
 for(const item of migrated.fills){assert.equal(item.history.sourceAccountVersion,2);assert.equal(item.history.migrated,true);assert.equal(item.history.generation,"legacy-static-v2");assert.equal(item.history.preservationPolicy,"recorded-economic-values-v1");assert.match(item.history.economicRecordHash,/^[a-f0-9]{64}$/);assert.ok(item.history.unavailableEvidence.includes("fee-provenance"));assert.ok(item.history.unavailableEvidence.includes(item.side==="close"?"margin-settlement":"visible-depth-entry"))}
 assert.doesNotThrow(()=>validateManualPaperBackup(migrated,user));
});

test("historical economic tampering is rejected after migration",()=>{
 const user="history_tamper_owner",migrated=validateManualPaperBackup(legacyV2(user),user),tampered=structuredClone(migrated);tampered.fills[1].price=91;
 assert.throws(()=>validateManualPaperBackup(tampered,user),/economic values changed/i)
});

test("v3 transition records receive explicit evidence gaps and future versions are rejected",()=>{
 const user="transition_history_owner",legacy=legacyV2(user);legacy.version=3;legacy.fundingPnl=0;legacy.fundingPayments=[];legacy.settings={...legacy.settings,makerCommissionPct:.02,liquidationPenaltyPct:.1,maintenanceMarginPct:.5,defaultMarginMode:"isolated"};
 const migrated=validateManualPaperBackup(legacy,user);assert.equal(migrated.migration.sourceAccountVersion,3);assert.equal(migrated.fills[0].history.generation,"v3-evidence-transition");
 const future=structuredClone(migrated);future.version=5;assert.throws(()=>validateManualPaperBackup(future,user),/unsupported manual paper backup version/i)
});

test("runtime migration failures do not silently replace the account with a blank balance",async()=>{
 const previous=process.env.DATA_DIR,root=await mkdtemp(join(tmpdir(),"dizy-history-failure-")),user="history_failure_owner",directory=join(root,"manual-paper"),path=join(directory,user+".json");process.env.DATA_DIR=root;
 try{await mkdir(directory,{recursive:true});await writeFile(path,JSON.stringify({version:99,cashBalance:1234}),"utf8");await assert.rejects(()=>readManualAccount(user),error=>error?.code==="ACCOUNT_MIGRATION_FAILED");assert.equal(JSON.parse(await readFile(path,"utf8")).cashBalance,1234)}finally{if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;await rm(root,{recursive:true,force:true})}
});
`,"utf8");

await writeFile("tests/user-backup-migration.test.mjs",String.raw`import assert from "node:assert/strict";
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
`,"utf8");
