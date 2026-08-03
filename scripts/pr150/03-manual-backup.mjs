import {readFile,writeFile} from "node:fs/promises";

const replaceOnce=(source,from,to,label)=>{const index=source.indexOf(from);if(index<0)throw new Error("Missing "+label);if(source.indexOf(from,index+from.length)>=0)throw new Error("Ambiguous "+label);return source.slice(0,index)+to+source.slice(index+from.length)};
let source=await readFile("app/lib/manual-paper-backup.ts","utf8");

source=replaceOnce(source,
 '  newManualAccount,\n  type ManualAccount,',
 '  newManualAccount,\n  normaliseManualAccount,\n  type ManualAccount,',
 "normaliser import");
source=replaceOnce(source,
 'import { buildPaperMarginAccountSnapshot, type PaperMarginPositionInput } from "./manual-paper-margin-model";\n',
 'import { buildPaperMarginAccountSnapshot, type PaperMarginPositionInput } from "./manual-paper-margin-model";\nimport {MANUAL_PAPER_ACCOUNT_VERSION,validateManualPaperFillHistory,validateManualPaperMigrationLedger} from "./manual-paper-history";\n',
 "history validator import");
source=replaceOnce(source,
 '    historicalDizyFlow: flowReference(input.historicalDizyFlow),\n    idempotencyKey:',
 '    historicalDizyFlow: flowReference(input.historicalDizyFlow),\n    history: validateManualPaperFillHistory(input),\n    idempotencyKey:',
 "fill history validation");
source=replaceOnce(source,
 'export function validateManualPaperBackup(value: unknown, ownerId: string): ManualAccount {\n  const input = object(value, "manualPaper");\n  if (input.version !== 3) throw new Error("Unsupported Manual Paper backup version.");',
 'export function validateManualPaperBackup(value: unknown, ownerId: string): ManualAccount {\n  const sourceInput = object(value, "manualPaper"),sourceVersion=sourceInput.version;\n  if(sourceVersion!==2&&sourceVersion!==3&&sourceVersion!==MANUAL_PAPER_ACCOUNT_VERSION)throw new Error("Unsupported Manual Paper backup version.");\n  if(sourceVersion===MANUAL_PAPER_ACCOUNT_VERSION&&sourceInput.migration==null)throw new Error("Manual Paper v4 backup is missing its migration ledger.");\n  const input = object(normaliseManualAccount(sourceInput), "manualPaper");',
 "backup migration start");
source=replaceOnce(source,
 '  const cashBalance=number(input.cashBalance,"manualPaper.cashBalance",0),parsedSettings=settings(input.settings),storedMarginSnapshot=marginAccountSnapshot(input.marginSnapshot,"manualPaper.marginSnapshot"),activePositions=Object.values(positions);',
 '  const cashBalance=number(input.cashBalance,"manualPaper.cashBalance",0),parsedSettings=settings(input.settings),storedMarginSnapshot=marginAccountSnapshot(input.marginSnapshot,"manualPaper.marginSnapshot"),activePositions=Object.values(positions),migration=validateManualPaperMigrationLedger(input.migration,fills,fundingPayments);',
 "migration ledger validation");
source=replaceOnce(source,
 '    version: 3 as const,\n    cashBalance,',
 '    version: MANUAL_PAPER_ACCOUNT_VERSION,\n    cashBalance,',
 "current backup version");
source=replaceOnce(source,
 '    marginSnapshot: storedMarginSnapshot,\n    updatedAt:',
 '    marginSnapshot: storedMarginSnapshot,\n    migration,\n    updatedAt:',
 "migration return");

await writeFile("app/lib/manual-paper-backup.ts",source,"utf8");
