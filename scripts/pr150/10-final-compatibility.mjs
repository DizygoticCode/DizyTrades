import {readFile,writeFile} from "node:fs/promises";

const replaceOnce=(source,from,to,label)=>{const index=source.indexOf(from);if(index<0)throw new Error("Missing "+label);if(source.indexOf(from,index+from.length)>=0)throw new Error("Ambiguous "+label);return source.slice(0,index)+to+source.slice(index+from.length)};

let manual=await readFile("app/lib/manual-paper.ts","utf8");
manual=replaceOnce(manual,
 ' const raw=value as Partial<ManualAccount>&{version?:number;settings?:Partial<ManualSettings>},sourceVersion=raw.version;',
 ' const raw=value as Omit<Partial<ManualAccount>,"version">&{version?:number;settings?:Partial<ManualSettings>},sourceVersion=raw.version;',
 "stored account version input type");
manual=replaceOnce(manual,
 ' if(!Array.isArray(raw.fills)||!Array.isArray(raw.idempotencyKeys))throw new ManualPaperError("ACCOUNT_MIGRATION_FAILED","account.history","Manual Paper history is invalid.");\n const base=newManualAccount(),positions=',
 ' const fills=sourceVersion===2&&raw.fills==null?[]:raw.fills,idempotencyKeys=sourceVersion===2&&raw.idempotencyKeys==null?[]:raw.idempotencyKeys;\n if(!Array.isArray(fills)||!Array.isArray(idempotencyKeys))throw new ManualPaperError("ACCOUNT_MIGRATION_FAILED","account.history","Manual Paper history is invalid.");\n const base=newManualAccount(),positions=',
 "v2 empty history defaults");
manual=replaceOnce(manual,
 ' const account={...base,...raw,positions,fundingPnl:raw.fundingPnl??0,fundingPayments:Array.isArray(raw.fundingPayments)?raw.fundingPayments:[],version:MANUAL_PAPER_ACCOUNT_VERSION,settings:{...DEFAULT_MANUAL_SETTINGS,...raw.settings}} as ManualAccount;',
 ' const account={...base,...raw,positions,fills,idempotencyKeys,fundingPnl:raw.fundingPnl??0,fundingPayments:Array.isArray(raw.fundingPayments)?raw.fundingPayments:[],version:MANUAL_PAPER_ACCOUNT_VERSION,settings:{...DEFAULT_MANUAL_SETTINGS,...raw.settings}} as ManualAccount;',
 "normalised history collections");
await writeFile("app/lib/manual-paper.ts",manual,"utf8");

for(const path of ["tests/manual-paper-depth-auto-risk-route.test.mjs","tests/manual-paper-margin-source.test.mjs","tests/manual-paper-risk-tier-source.test.mjs"]){
 const source=await readFile(path,"utf8"),next=replaceOnce(source,'assert.match(roadmap,/Next slice: migration-safe history and backup support/)','assert.match(roadmap,/DizyPaper Fidelity V2 is complete/)','completed roadmap assertion in '+path);await writeFile(path,next,"utf8")
}

let marginReview=await readFile("tests/manual-paper-margin-review.test.mjs","utf8");
marginReview=replaceOnce(marginReview,
 '/isolated margin debit|contradicts/i',
 '/isolated margin debit|contradicts|history content hash/i',
 "funding tamper rejection assertion");
await writeFile("tests/manual-paper-margin-review.test.mjs",marginReview,"utf8");

let paperTest=await readFile("tests/manual-paper.test.mjs","utf8");
paperTest=replaceOnce(paperTest,
 'test("legacy saved manual paper state migrates per user to v3"',
 'test("legacy saved manual paper state migrates per user to v4"',
 "legacy migration title");
await writeFile("tests/manual-paper.test.mjs",paperTest,"utf8");
