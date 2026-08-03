import {readFile,writeFile} from "node:fs/promises";

const replaceOnce=(source,from,to,label)=>{const index=source.indexOf(from);if(index<0)throw new Error("Missing "+label);if(source.indexOf(from,index+from.length)>=0)throw new Error("Ambiguous "+label);return source.slice(0,index)+to+source.slice(index+from.length)};
let source=await readFile("app/lib/user-backup-model.ts","utf8");

source=replaceOnce(source,
 'export const USER_BACKUP_VERSION = 1 as const;\nexport const MAX_USER_BACKUP_BYTES',
 'export const USER_BACKUP_VERSION = 2 as const;\nexport const USER_BACKUP_MIGRATION_SCHEMA_VERSION = 1 as const;\nexport const MAX_USER_BACKUP_BYTES',
 "backup version");
const migrationTypes=String.raw`
export type DizyTradesBackupMigration=Readonly<{
  schemaVersion:typeof USER_BACKUP_MIGRATION_SCHEMA_VERSION;
  sourceBackupVersion:1|2;
  targetBackupVersion:typeof USER_BACKUP_VERSION;
  migrated:boolean;
  sourceContentHash:string|null;
  steps:readonly string[];
  manualPaper:Readonly<{
    sourceAccountVersion:2|3|4;
    targetAccountVersion:4;
    migrated:boolean;
    fillCount:number;
    fundingPaymentCount:number;
    historyContentHash:string;
  }>;
}>;
`;
source=replaceOnce(source,
 'export type BackupPaperRun = Readonly<{',
 migrationTypes+'\nexport type BackupPaperRun = Readonly<{',
 "migration types");
source=replaceOnce(source,
 '  application: Readonly<{\n    name: "DizyTrades";\n    version: string;\n  }>;\n  data:',
 '  application: Readonly<{\n    name: "DizyTrades";\n    version: string;\n  }>;\n  migration:DizyTradesBackupMigration;\n  data:',
 "content migration field");
source=replaceOnce(source,
 'export function backupContentHash(content: DizyTradesBackupContent) {',
 'export function backupContentHash(content: unknown) {',
 "generic content hash");

const helpers=String.raw`
function migrationSteps(value:unknown){
  if(!Array.isArray(value)||value.length>50)throw new Error("Backup migration steps are invalid.");
  const steps=value.map((item,index)=>text(item,"migration.steps."+index,100));
  if(new Set(steps).size!==steps.length)throw new Error("Backup migration steps contain duplicates.");
  return Object.freeze(steps)
}
function manualPaperMigrationSummary(manualPaper:ManualAccount):DizyTradesBackupMigration["manualPaper"]{
  const ledger=manualPaper.migration;
  return Object.freeze({sourceAccountVersion:ledger.sourceAccountVersion,targetAccountVersion:ledger.targetAccountVersion,migrated:ledger.migrated,fillCount:ledger.fillCount,fundingPaymentCount:ledger.fundingPaymentCount,historyContentHash:ledger.historyContentHash})
}
export function nativeDizyTradesBackupMigration(manualPaper:ManualAccount):DizyTradesBackupMigration{
  return Object.freeze({schemaVersion:USER_BACKUP_MIGRATION_SCHEMA_VERSION,sourceBackupVersion:USER_BACKUP_VERSION,targetBackupVersion:USER_BACKUP_VERSION,migrated:false,sourceContentHash:null,steps:Object.freeze([]),manualPaper:manualPaperMigrationSummary(manualPaper)})
}
function migratedV1BackupReport(sourceContentHash:string,manualPaper:ManualAccount):DizyTradesBackupMigration{
  return Object.freeze({schemaVersion:USER_BACKUP_MIGRATION_SCHEMA_VERSION,sourceBackupVersion:1,targetBackupVersion:USER_BACKUP_VERSION,migrated:true,sourceContentHash,steps:Object.freeze(["verify-v1-integrity-before-migration","upgrade-user-backup-v1-to-v2","migrate-manual-paper-history"]),manualPaper:manualPaperMigrationSummary(manualPaper)})
}
function validateBackupMigration(value:unknown,manualPaper:ManualAccount):DizyTradesBackupMigration{
  const input=record(value,"migration");
  if(input.schemaVersion!==USER_BACKUP_MIGRATION_SCHEMA_VERSION)throw new Error("Unsupported backup migration schema.");
  if(input.sourceBackupVersion!==1&&input.sourceBackupVersion!==2)throw new Error("Backup migration source version is invalid.");
  if(input.targetBackupVersion!==USER_BACKUP_VERSION)throw new Error("Backup migration target version is invalid.");
  if(typeof input.migrated!=="boolean"||input.migrated!==(input.sourceBackupVersion!==USER_BACKUP_VERSION))throw new Error("Backup migration state does not reconcile.");
  const sourceContentHash=input.sourceContentHash==null?null:text(input.sourceContentHash,"migration.sourceContentHash",64);
  if(sourceContentHash!==null&&!/^[a-f0-9]{64}$/.test(sourceContentHash))throw new Error("Backup migration source hash is invalid.");
  if((input.sourceBackupVersion===1)!==(sourceContentHash!==null))throw new Error("Backup migration source hash does not reconcile.");
  const steps=migrationSteps(input.steps),paper=record(input.manualPaper,"migration.manualPaper"),expected=manualPaperMigrationSummary(manualPaper),historyContentHash=text(paper.historyContentHash,"migration.manualPaper.historyContentHash",64);
  if(!/^[a-f0-9]{64}$/.test(historyContentHash))throw new Error("Backup Manual Paper history hash is invalid.");
  const parsed=Object.freeze({sourceAccountVersion:finite(paper.sourceAccountVersion,"migration.manualPaper.sourceAccountVersion",2) as 2|3|4,targetAccountVersion:finite(paper.targetAccountVersion,"migration.manualPaper.targetAccountVersion",4) as 4,migrated:paper.migrated===true,fillCount:integer(paper.fillCount,"migration.manualPaper.fillCount"),fundingPaymentCount:integer(paper.fundingPaymentCount,"migration.manualPaper.fundingPaymentCount"),historyContentHash});
  if(parsed.sourceAccountVersion!==expected.sourceAccountVersion||parsed.targetAccountVersion!==expected.targetAccountVersion||parsed.migrated!==expected.migrated||parsed.fillCount!==expected.fillCount||parsed.fundingPaymentCount!==expected.fundingPaymentCount||parsed.historyContentHash!==expected.historyContentHash)throw new Error("Backup Manual Paper migration summary does not reconcile.");
  return Object.freeze({schemaVersion:USER_BACKUP_MIGRATION_SCHEMA_VERSION,sourceBackupVersion:input.sourceBackupVersion,targetBackupVersion:USER_BACKUP_VERSION,migrated:input.migrated,sourceContentHash,steps,manualPaper:parsed})
}
function verifyLegacyV1Integrity(input:Record<string,unknown>){
  const integrity=record(input.integrity,"integrity");
  if(integrity.algorithm!=="sha256")throw new Error("Unsupported backup integrity algorithm.");
  const supplied=text(integrity.contentHash,"integrity.contentHash",64);
  if(!/^[a-f0-9]{64}$/.test(supplied))throw new Error("Backup integrity hash is invalid.");
  const legacyContent={version:1,ownerId:input.ownerId,generatedAt:input.generatedAt,application:input.application,data:input.data,warnings:input.warnings};
  if(backupContentHash(legacyContent)!==supplied)throw new Error("Backup integrity check failed before migration.");
  return supplied
}
`;
source=replaceOnce(source,
 'export function validateDizyTradesBackup(\n',
 helpers+'\nexport function validateDizyTradesBackup(\n',
 "migration helpers");
source=replaceOnce(source,
 '  const input = record(value, "backup");\n  if (input.version !== USER_BACKUP_VERSION) {\n    throw new Error("Unsupported DizyTrades backup version.");\n  }',
 '  const input = record(value, "backup"),sourceBackupVersion=input.version;\n  if(sourceBackupVersion!==1&&sourceBackupVersion!==USER_BACKUP_VERSION)throw new Error("Unsupported DizyTrades backup version.");\n  const legacySourceContentHash=sourceBackupVersion===1?verifyLegacyV1Integrity(input):null;',
 "validation version start");
source=replaceOnce(source,
 '  const content: DizyTradesBackupContent = Object.freeze({\n    version: USER_BACKUP_VERSION,',
 '  const manualPaper=validateManualPaperBackup(dataInput.manualPaper, ownerId);\n  const migration=sourceBackupVersion===1?migratedV1BackupReport(legacySourceContentHash!,manualPaper):validateBackupMigration(input.migration,manualPaper);\n\n  const content: DizyTradesBackupContent = Object.freeze({\n    version: USER_BACKUP_VERSION,',
 "manual migration construction");
source=replaceOnce(source,
 '    application: Object.freeze({\n      name: "DizyTrades" as const,\n      version: text(applicationInput.version, "application.version", 40),\n    }),\n    data:',
 '    application: Object.freeze({\n      name: "DizyTrades" as const,\n      version: text(applicationInput.version, "application.version", 40),\n    }),\n    migration,\n    data:',
 "content migration value");
source=replaceOnce(source,
 '      manualPaper: validateManualPaperBackup(dataInput.manualPaper, ownerId),',
 '      manualPaper,',
 "manual account reuse");
source=replaceOnce(source,
 '  const integrityInput = record(input.integrity, "integrity");\n  if (integrityInput.algorithm !== "sha256") {\n    throw new Error("Unsupported backup integrity algorithm.");\n  }\n  const suppliedHash = text(integrityInput.contentHash, "integrity.contentHash", 64);\n  const expectedHash = backupContentHash(content);\n  if (suppliedHash !== expectedHash) {\n    throw new Error("Backup integrity check failed.");\n  }',
 '  const integrityInput = record(input.integrity, "integrity");\n  if (integrityInput.algorithm !== "sha256") throw new Error("Unsupported backup integrity algorithm.");\n  const expectedHash = backupContentHash(content);\n  if(sourceBackupVersion===USER_BACKUP_VERSION){const suppliedHash=text(integrityInput.contentHash,"integrity.contentHash",64);if(suppliedHash!==expectedHash)throw new Error("Backup integrity check failed.")}',
 "versioned integrity validation");

await writeFile("app/lib/user-backup-model.ts",source,"utf8");
