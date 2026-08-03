import {readdir,readFile,writeFile} from "node:fs/promises";

const replaceOnce=(source,from,to,label)=>{const index=source.indexOf(from);if(index<0)throw new Error("Missing "+label);if(source.indexOf(from,index+from.length)>=0)throw new Error("Ambiguous "+label);return source.slice(0,index)+to+source.slice(index+from.length)};

let source=await readFile("app/lib/manual-paper.ts","utf8");
source=replaceOnce(source,
 'import {MANUAL_PAPER_ACCOUNT_VERSION,normaliseManualPaperHistory,type ManualPaperFillHistory,type ManualPaperMigrationLedger} from "./manual-paper-history";',
 'import {MANUAL_PAPER_ACCOUNT_VERSION,createManualPaperFillHistory,normaliseManualPaperHistory,type ManualPaperFillHistory,type ManualPaperMigrationLedger} from "./manual-paper-history";',
 "fill history creator import");
const helper=String.raw`function appendManualFills(account:ManualAccount,...fills:Omit<ManualFill,"history">[]){
 const recorded=fills.map(fill=>Object.freeze({...fill,history:createManualPaperFillHistory(fill,MANUAL_PAPER_ACCOUNT_VERSION,false)}) as ManualFill);
 account.fills=[...account.fills,...recorded];
 const normalised=normaliseManualPaperHistory(account,MANUAL_PAPER_ACCOUNT_VERSION) as ManualAccount;
 account.fills=normalised.fills;
 account.migration=normalised.migration
}
`;
source=replaceOnce(source,"function closeWithDepthAt(",helper+"function closeWithDepthAt(","fill append helper");
const pushCount=source.split("account.fills.push(").length-1;
if(pushCount<5)throw new Error("Expected at least five Manual Paper fill append sites, found "+pushCount);
source=source.replaceAll("account.fills.push(","appendManualFills(account,");
await writeFile("app/lib/manual-paper.ts",source,"utf8");

async function filesBelow(directory){const entries=await readdir(directory,{withFileTypes:true}),paths=[];for(const entry of entries){const path=directory+"/"+entry.name;if(entry.isDirectory())paths.push(...await filesBelow(path));else if(entry.isFile())paths.push(path)}return paths}
const files=(await filesBelow("tests")).filter(path=>path.endsWith(".mjs")||path.endsWith(".ts")||path.endsWith(".tsx"));
let versionAssertions=0,sourceAssertions=0;
for(const path of files){
 const test=await readFile(path,"utf8");let next=test;
 const versionPatterns=[
  ['assert.equal(account.version,3)','assert.equal(account.version,4);assert.ok(account.migration);'],
  ['assert.equal(account.version, 3)','assert.equal(account.version, 4);assert.ok(account.migration);']
 ];
 for(const [from,to] of versionPatterns)if(next.includes(from)){next=next.replaceAll(from,to);versionAssertions++}
 for(const token of ['input\\.version !== USER_BACKUP_VERSION','input\\.version!==USER_BACKUP_VERSION','input.version !== USER_BACKUP_VERSION','input.version!==USER_BACKUP_VERSION'])if(next.includes(token)){next=next.replaceAll(token,'sourceBackupVersion');sourceAssertions++}
 if(next!==test)await writeFile(path,next,"utf8")
}
if(versionAssertions<1)throw new Error("No stale Manual Paper v3 assertion was found.");
console.log("Updated "+versionAssertions+" schema assertion(s) and "+sourceAssertions+" backup source assertion(s).");

let historyTest=await readFile("tests/manual-paper-history.test.mjs","utf8");
historyTest+=String.raw`
test("new v4 fills carry provenance before persistence or backup validation",async()=>{
 const previous=process.env.DATA_DIR,root=await mkdtemp(join(tmpdir(),"dizy-history-born-valid-")),user="history_born_valid_owner";process.env.DATA_DIR=root;
 try{
  const {submitManualOrder}=await import("../app/lib/manual-paper.ts"),contract={symbol:"BTC_USDT",displayName:"BTCUSDT SWAP",contractSize:1,minLeverage:1,maxLeverage:50,priceUnit:.01,volUnit:1,minVol:1,maxVol:2000,makerFeeRate:.0002,takerFeeRate:.0006,maintenanceMarginRate:.01,initialMarginRate:.02,positionOpenType:3,riskLimitType:"BY_VOLUME"};
  const account=await submitManualOrder(user,{idempotencyKey:"history-born-valid-0001",symbol:"BTC_USDT",side:"long",sizeMode:"fixed-notional",amount:1000,leverage:10,marginMode:"isolated"},100,"fair",contract);
  const newest=account.fills.at(-1);assert.equal(newest.history.sourceAccountVersion,4);assert.equal(newest.history.migrated,false);assert.match(newest.history.economicRecordHash,/^[a-f0-9]{64}$/);assert.doesNotThrow(()=>validateManualPaperBackup(account,user))
 }finally{if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;await rm(root,{recursive:true,force:true})}
});
`;
await writeFile("tests/manual-paper-history.test.mjs",historyTest,"utf8");
