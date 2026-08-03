import { readFile, writeFile } from "node:fs/promises";

async function patch(path, replacements) {
  let source = await readFile(path, "utf8");
  for (const [before, after] of replacements) {
    if (!source.includes(before)) {
      throw new Error(`Missing expected source in ${path}: ${before.slice(0, 120)}`);
    }
    source = source.replace(before, after);
  }
  await writeFile(path, source);
}

await patch("app/lib/manual-paper.ts", [
  [
    'import {MANUAL_PAPER_ACCOUNT_VERSION,createManualPaperFillHistory,normaliseManualPaperHistory,type ManualPaperFillHistory,type ManualPaperMigrationLedger} from "./manual-paper-history";\nimport type {DepthEnvelope} from "./order-flow/types";',
    'import {MANUAL_PAPER_ACCOUNT_VERSION,createManualPaperFillHistory,normaliseManualPaperHistory,type ManualPaperFillHistory,type ManualPaperMigrationLedger} from "./manual-paper-history";\nimport {assertManualPaperAccounting} from "./manual-paper-accounting-audit";\nimport {safeOwnerId} from "./security-boundaries";\nimport type {DepthEnvelope} from "./order-flow/types";',
  ],
  [
    'const root=()=>process.env.DATA_DIR||join(process.cwd(),".data"),safe=(id:string)=>id.replace(/[^a-z0-9_-]/gi,""),path=(id:string)=>join(root(),"manual-paper",`${safe(id)}.json`);',
    'const root=()=>process.env.DATA_DIR||join(process.cwd(),".data"),path=(id:string)=>join(root(),"manual-paper",`${safeOwnerId(id,"Manual Paper owner")}.json`);',
  ],
  [
    ' refreshAccountRisk(account,capturedAt);\n return normaliseManualPaperHistory(account,sourceVersion,steps) as ManualAccount\n}',
    ' refreshAccountRisk(account,capturedAt);\n const normalised=normaliseManualPaperHistory(account,sourceVersion,steps) as ManualAccount;\n try{assertManualPaperAccounting(normalised)}catch(error){throw new ManualPaperError("ACCOUNT_ACCOUNTING_INVALID","account",error instanceof Error?error.message:"Manual Paper accounting does not reconcile.")}\n return normalised\n}',
  ],
  [
    'export async function readManualAccount(userId:string){\n try{return normaliseManualAccount(JSON.parse(await readFile(path(userId),"utf8")))}catch(reason){',
    'export async function readManualAccount(userId:string){\n const target=path(userId);\n try{return normaliseManualAccount(JSON.parse(await readFile(target,"utf8")))}catch(reason){',
  ],
  [
    'const queues=new Map<string,Promise<unknown>>();async function serial<T>(userId:string,fn:()=>Promise<T>):Promise<T>{const previous=queues.get(userId)??Promise.resolve();let release!:()=>void;const gate=new Promise<void>(r=>release=r);queues.set(userId,previous.then(()=>gate));await previous;try{return await fn()}finally{release()}}',
    'const queues=new Map<string,Promise<unknown>>();async function serial<T>(userId:string,fn:()=>Promise<T>):Promise<T>{const ownerId=safeOwnerId(userId,"Manual Paper owner"),previous=queues.get(ownerId)??Promise.resolve();let release!:()=>void;const gate=new Promise<void>(r=>release=r),current=previous.then(()=>gate);queues.set(ownerId,current);await previous;try{return await fn()}finally{release();if(queues.get(ownerId)===current)queues.delete(ownerId)}}',
  ],
]);

await patch("app/lib/manual-paper-backup.ts", [
  [
    'import { buildPaperMarginAccountSnapshot, type PaperMarginPositionInput } from "./manual-paper-margin-model";\nimport {MANUAL_PAPER_ACCOUNT_VERSION,validateManualPaperFillHistory,validateManualPaperMigrationLedger} from "./manual-paper-history";',
    'import { buildPaperMarginAccountSnapshot, type PaperMarginPositionInput } from "./manual-paper-margin-model";\nimport {assertManualPaperAccounting} from "./manual-paper-accounting-audit";\nimport {MANUAL_PAPER_ACCOUNT_VERSION,validateManualPaperFillHistory,validateManualPaperMigrationLedger} from "./manual-paper-history";',
  ],
  [
    '  return Object.freeze({\n    version: MANUAL_PAPER_ACCOUNT_VERSION,\n    cashBalance,\n    startingBalance: number(input.startingBalance, "manualPaper.startingBalance", 0),\n    realisedPnl: number(input.realisedPnl, "manualPaper.realisedPnl"),\n    fees: number(input.fees, "manualPaper.fees", 0),\n    fundingPnl: input.fundingPnl==null?0:number(input.fundingPnl, "manualPaper.fundingPnl"),\n    fundingPayments: Object.freeze(fundingPayments) as unknown as ManualFundingPayment[],\n    positions: Object.freeze(positions),\n    fills: Object.freeze(fills) as unknown as ManualFill[],\n    idempotencyKeys: Object.freeze(idempotencyKeys) as unknown as string[],\n    settings: parsedSettings,\n    marginSnapshot: storedMarginSnapshot,\n    migration,\n    updatedAt: iso(input.updatedAt, "manualPaper.updatedAt"),\n  });',
    '  const validated=Object.freeze({\n    version: MANUAL_PAPER_ACCOUNT_VERSION,\n    cashBalance,\n    startingBalance: number(input.startingBalance, "manualPaper.startingBalance", 0),\n    realisedPnl: number(input.realisedPnl, "manualPaper.realisedPnl"),\n    fees: number(input.fees, "manualPaper.fees", 0),\n    fundingPnl: input.fundingPnl==null?0:number(input.fundingPnl, "manualPaper.fundingPnl"),\n    fundingPayments: Object.freeze(fundingPayments) as unknown as ManualFundingPayment[],\n    positions: Object.freeze(positions),\n    fills: Object.freeze(fills) as unknown as ManualFill[],\n    idempotencyKeys: Object.freeze(idempotencyKeys) as unknown as string[],\n    settings: parsedSettings,\n    marginSnapshot: storedMarginSnapshot,\n    migration,\n    updatedAt: iso(input.updatedAt, "manualPaper.updatedAt"),\n  }) as ManualAccount;\n  assertManualPaperAccounting(validated);\n  return validated;',
  ],
]);
