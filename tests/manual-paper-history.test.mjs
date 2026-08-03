import assert from "node:assert/strict";
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

test("new v4 fills carry provenance before persistence or backup validation",async()=>{
 const previous=process.env.DATA_DIR,root=await mkdtemp(join(tmpdir(),"dizy-history-born-valid-")),user="history_born_valid_owner";process.env.DATA_DIR=root;
 try{
  const {submitManualOrder}=await import("../app/lib/manual-paper.ts"),contract={symbol:"BTC_USDT",displayName:"BTCUSDT SWAP",contractSize:1,minLeverage:1,maxLeverage:50,priceUnit:.01,volUnit:1,minVol:1,maxVol:2000,makerFeeRate:.0002,takerFeeRate:.0006,maintenanceMarginRate:.01,initialMarginRate:.02,positionOpenType:3,riskLimitType:"BY_VOLUME"};
  const account=await submitManualOrder(user,{idempotencyKey:"history-born-valid-0001",symbol:"BTC_USDT",side:"long",sizeMode:"fixed-notional",amount:1000,leverage:10,marginMode:"isolated"},100,"fair",contract);
  const newest=account.fills.at(-1);assert.equal(newest.history.sourceAccountVersion,4);assert.equal(newest.history.migrated,false);assert.match(newest.history.economicRecordHash,/^[a-f0-9]{64}$/);assert.doesNotThrow(()=>validateManualPaperBackup(account,user))
 }finally{if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;await rm(root,{recursive:true,force:true})}
});
