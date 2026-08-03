import {readFile,writeFile} from "node:fs/promises";

const replaceOnce=(source,from,to,label)=>{const index=source.indexOf(from);if(index<0)throw new Error("Missing "+label);if(source.indexOf(from,index+from.length)>=0)throw new Error("Ambiguous "+label);return source.slice(0,index)+to+source.slice(index+from.length)};

let manual=await readFile("app/lib/manual-paper.ts","utf8");
manual=replaceOnce(manual,
 ' const account={...base,...raw,positions,fundingPnl:raw.fundingPnl??0,fundingPayments:Array.isArray(raw.fundingPayments)?raw.fundingPayments:[],version:MANUAL_PAPER_ACCOUNT_VERSION,settings:{...DEFAULT_MANUAL_SETTINGS,...raw.settings}} as ManualAccount;\n const capturedAt=',
 ' const account={...base,...raw,positions,fundingPnl:raw.fundingPnl??0,fundingPayments:Array.isArray(raw.fundingPayments)?raw.fundingPayments:[],version:MANUAL_PAPER_ACCOUNT_VERSION,settings:{...DEFAULT_MANUAL_SETTINGS,...raw.settings}} as ManualAccount;\n if(sourceVersion!==MANUAL_PAPER_ACCOUNT_VERSION)delete (account as Partial<ManualAccount>).migration;\n const capturedAt=',
 "legacy source ledger isolation");
await writeFile("app/lib/manual-paper.ts",manual,"utf8");

let backup=await readFile("app/lib/manual-paper-backup.ts","utf8");
backup=replaceOnce(backup,
 '  const input = object(normaliseManualAccount(sourceInput), "manualPaper");',
 '  const input = object(sourceVersion===MANUAL_PAPER_ACCOUNT_VERSION?sourceInput:normaliseManualAccount(sourceInput), "manualPaper");',
 "strict current backup preservation");
await writeFile("app/lib/manual-paper-backup.ts",backup,"utf8");

let funding=await readFile("tests/manual-paper-funding.test.mjs","utf8");
funding=replaceOnce(funding,
 'legacy=newManualAccount();delete legacy.fundingPnl;delete legacy.fundingPayments;',
 'legacy=newManualAccount();legacy.version=3;delete legacy.migration;delete legacy.fundingPnl;delete legacy.fundingPayments;',
 "pre-funding v3 fixture");
await writeFile("tests/manual-paper-funding.test.mjs",funding,"utf8");

let userBackup=await readFile("tests/user-backup.test.mjs","utf8");
userBackup=replaceOnce(userBackup,
 '    const foreign = structuredClone(account);\n    foreign.fills.push({',
 '    const foreign = structuredClone(account);\n    foreign.version = 3;\n    delete foreign.migration;\n    foreign.fills.push({',
 "foreign legacy fixture");
await writeFile("tests/user-backup.test.mjs",userBackup,"utf8");
