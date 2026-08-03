import {readFile,writeFile} from "node:fs/promises";

const replaceOnce=(source,from,to,label)=>{const index=source.indexOf(from);if(index<0)throw new Error("Missing "+label);if(source.indexOf(from,index+from.length)>=0)throw new Error("Ambiguous "+label);return source.slice(0,index)+to+source.slice(index+from.length)};
let source=await readFile("app/lib/user-backup-store.ts","utf8");
source=replaceOnce(source,
 '  finaliseDizyTradesBackup,\n  validateBackupJournalEntry,',
 '  finaliseDizyTradesBackup,\n  nativeDizyTradesBackupMigration,\n  validateBackupJournalEntry,',
 "native migration import");
source=replaceOnce(source,
 '  backupHash: string;\n  safeToApply:',
 '  backupHash: string;\n  migration:DizyTradesBackup["migration"];\n  safeToApply:',
 "restore plan migration type");
source=replaceOnce(source,
 '  const content: DizyTradesBackupContent = Object.freeze({',
 '  const validatedManualPaper=validateManualPaperBackup(manualPaper,ownerId);\n  const content: DizyTradesBackupContent = Object.freeze({',
 "validated manual account");
source=replaceOnce(source,
 '    application: Object.freeze({\n      name: "DizyTrades" as const,\n      version: "0.2.0",\n    }),\n    data:',
 '    application: Object.freeze({\n      name: "DizyTrades" as const,\n      version: "0.2.0",\n    }),\n    migration:nativeDizyTradesBackupMigration(validatedManualPaper),\n    data:',
 "native migration content");
source=replaceOnce(source,
 '      manualPaper: validateManualPaperBackup(manualPaper, ownerId),',
 '      manualPaper: validatedManualPaper,',
 "validated manual reuse");
source=replaceOnce(source,
 '  const restoreWarnings = [...backup.warnings];',
 '  const restoreWarnings = [...backup.warnings];\n  if(backup.migration.migrated)restoreWarnings.push("Backup schema v"+backup.migration.sourceBackupVersion+" was integrity-verified and migrated to v"+backup.migration.targetBackupVersion+" for this restore.");\n  if(backup.migration.manualPaper.migrated)restoreWarnings.push("Manual Paper history was migrated from account v"+backup.migration.manualPaper.sourceAccountVersion+" without rewriting recorded prices, quantities, fees or P/L.");',
 "migration warnings");
source=replaceOnce(source,
 '    backupHash: backup.integrity.contentHash,\n    safeToApply:',
 '    backupHash: backup.integrity.contentHash,\n    migration:backup.migration,\n    safeToApply:',
 "restore plan migration value");
await writeFile("app/lib/user-backup-store.ts",source,"utf8");
