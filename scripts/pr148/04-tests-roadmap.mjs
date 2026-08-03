import { readFile, writeFile } from "node:fs/promises";

const riskTests=`import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {auditPaperLiquidation} from "../app/lib/manual-paper-engine.ts";
import {parseMexcContractMetadata} from "../app/lib/mexc-contract-metadata.ts";
import {reselectPaperRiskTier,selectMexcContractRiskTier} from "../app/lib/manual-paper-risk-tiers.ts";

const payload=(overrides={})=>({success:true,data:[{symbol:"BTC_USDT",displayNameEn:"BTC_USDT SWAP",positionOpenType:3,contractSize:1,minLeverage:1,maxLeverage:50,priceUnit:.1,volUnit:1,minVol:1,maxVol:100,makerFeeRate:.0002,takerFeeRate:.0006,maintenanceMarginRate:.01,initialMarginRate:.02,riskBaseVol:5,riskIncrVol:5,riskIncrMmr:.01,riskIncrImr:.03,riskLevelLimit:3,riskLimitType:"BY_VOLUME",...overrides}]});
const contract=(overrides={})=>parseMexcContractMetadata(payload(overrides),"BTC_USDT");
const levels=pairs=>pairs.map(([price,contractQuantity])=>({price,orderCount:1,contractQuantity}));
const book=(bids=[[100,100]],asks=[[100,100]],receivedAt=Date.now())=>({snapshot:{symbol:"BTC_USDT",version:201,engineTimeMs:receivedAt,bids:levels(bids),asks:levels(asks)},receivedAt,diagnostic:{snapshotAgeMs:0,consecutiveFailures:0,lastError:null,sourceMode:"REST FALLBACK",snapshotComplete:true}});
async function isolated(name,fn){const prior=process.env.DATA_DIR,root=await mkdtemp(join(tmpdir(),name));process.env.DATA_DIR=root;try{return await fn()}finally{if(prior===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=prior;await rm(root,{recursive:true,force:true})}}

test("public contract increments select deterministic maintenance tiers",()=>{const value=contract(),tier1=selectMexcContractRiskTier(value,{contractVolume:5,notional:500},123),tier2=selectMexcContractRiskTier(value,{contractVolume:6,notional:600},123),tier3=selectMexcContractRiskTier(value,{contractVolume:15,notional:1500},123);assert.deepEqual([tier1.level,tier2.level,tier3.level],[1,2,3]);assert.deepEqual([tier1.maintenanceMarginRate,tier2.maintenanceMarginRate,tier3.maintenanceMarginRate],[.01,.02,.03]);assert.deepEqual([tier1.maxLeverage,tier2.maxLeverage,tier3.maxLeverage],[50,20,12]);assert.equal(tier2.source,"mexc-public-contract-derived");assert.equal(tier2.maxExposure,10);assert.equal(tier2.capturedAt,123);assert.throws(()=>selectMexcContractRiskTier(value,{contractVolume:16,notional:1600}),/RISK_LIMIT_EXCEEDED/)});

test("risk tier selection supports value exposure and explicit flat fallback",()=>{const byValue=contract({riskLimitType:"BY_VALUE",riskBaseVol:1000,riskIncrVol:1000});assert.equal(selectMexcContractRiskTier(byValue,{contractVolume:99,notional:1500}).level,2);const flat=contract({riskBaseVol:undefined,riskIncrVol:undefined,riskIncrMmr:undefined,riskIncrImr:undefined,riskLevelLimit:undefined});const selected=selectMexcContractRiskTier(flat,{contractVolume:10,notional:1000});assert.equal(selected.source,"mexc-public-contract-flat-fallback");assert.equal(selected.level,1);assert.equal(selected.maintenanceMarginRate,.01)});

test("partial exposure reselects the original snapshotted schedule",()=>{const opened=selectMexcContractRiskTier(contract(),{contractVolume:10,notional:1000},777),reduced=reselectPaperRiskTier(opened,5);assert.equal(opened.level,2);assert.equal(reduced.level,1);assert.equal(reduced.maintenanceMarginRate,.01);assert.equal(reduced.capturedAt,777);assert.equal(reduced.source,opened.source)});

test("liquidation audit separates trigger and bankruptcy for long and short",()=>{const base={entryPrice:100,quantity:10,marginMode:"isolated",assignedMargin:100,crossCollateral:300,entryFee:.6,maintenanceMarginRate:.02,liquidationPenaltyRate:.001},long=auditPaperLiquidation({...base,side:"long"}),short=auditPaperLiquidation({...base,side:"short"}),higher=auditPaperLiquidation({...base,side:"long",maintenanceMarginRate:.05});assert.ok(long.bankruptcyPrice<long.estimatedLiquidation&&long.estimatedLiquidation<100);assert.ok(short.estimatedLiquidation<short.bankruptcyPrice&&short.estimatedLiquidation>100);assert.ok(higher.estimatedLiquidation>long.estimatedLiquidation);assert.equal(long.collateralBasis,"assigned-margin");assert.ok(Math.abs(long.maintenanceMarginAtLiquidation-long.estimatedLiquidation*10*.02)<1e-10);assert.ok(Math.abs(long.liquidationToBankruptcyDistance-Math.abs(long.estimatedLiquidation-long.bankruptcyPrice))<1e-10)});

test("Manual Paper snapshots tier provenance and moves residuals down-tier",()=>isolated("dizy-risk-tier-",async()=>{const {submitManualOrder,partialCloseManualPosition}=await import("../app/lib/manual-paper.ts"),{validateManualPaperBackup}=await import("../app/lib/manual-paper-backup.ts"),rules=contract();let account=await submitManualOrder("risk-tier-user",{idempotencyKey:"risk-tier-open-0001",symbol:"BTC_USDT",side:"long",sizeMode:"fixed-notional",amount:1000,leverage:10},100,"fair",rules,undefined,book()),position=account.positions.BTC_USDT;assert.equal(position.contractVolume,10);assert.equal(position.riskTier.level,2);assert.equal(position.riskTier.maintenanceMarginRate,.02);assert.ok(position.bankruptcyPrice<position.estimatedLiquidation);assert.equal(position.liquidationAudit.estimatedLiquidation,position.estimatedLiquidation);assert.equal(account.fills.at(-1).riskTier.level,2);account=await partialCloseManualPosition("risk-tier-user","BTC_USDT","risk-tier-close-0001",100,{percentage:50},book(),rules,{expectedTradeId:position.tradeId,expectedSide:position.side});position=account.positions.BTC_USDT;assert.equal(position.contractVolume,5);assert.equal(position.riskTier.level,1);assert.equal(position.riskTier.capturedAt,account.fills[0].riskTier.capturedAt);assert.equal(position.liquidationAudit.maintenanceMarginRate,.01);assert.equal(validateManualPaperBackup(account,"risk-tier-user").positions.BTC_USDT.riskTier.level,1);for(const mutate of [copy=>copy.positions.BTC_USDT.riskTier.maxExposure=999,copy=>copy.positions.BTC_USDT.liquidationAudit.bankruptcyPrice=1,copy=>copy.positions.BTC_USDT.liquidationAudit.maintenanceMarginAtLiquidation=1]){const copy=structuredClone(account);mutate(copy);assert.throws(()=>validateManualPaperBackup(copy,"risk-tier-user"),/riskTier|risk tier|liquidation|reconcile|boundary/i)}}));

test("tier maximum leverage is enforced after actual visible fill",()=>isolated("dizy-risk-tier-lev-",async()=>{const {submitManualOrder}=await import("../app/lib/manual-paper.ts");await assert.rejects(()=>submitManualOrder("risk-tier-lev",{idempotencyKey:"risk-tier-lev-open-0001",symbol:"BTC_USDT",side:"long",sizeMode:"fixed-notional",amount:1000,leverage:25},100,"fair",contract(),undefined,book()),error=>error?.code==="RISK_TIER_LEVERAGE_EXCEEDED")}));
`;
await writeFile("tests/manual-paper-risk-tiers.test.mjs",riskTests);

const sourceTests=`import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("risk tier and bankruptcy provenance is visible at source boundaries",async()=>{const [metadata,core,ticket,backup,roadmap]=await Promise.all([readFile("app/lib/mexc-contract-metadata.ts","utf8"),readFile("app/lib/manual-paper.ts","utf8"),readFile("app/manual-paper-ticket.tsx","utf8"),readFile("app/lib/manual-paper-backup.ts","utf8"),readFile("ROADMAP.md","utf8")]);for(const field of ["riskBaseVol","riskIncrVol","riskIncrMmr","riskIncrImr","riskLevelLimit"])assert.match(metadata,new RegExp(field));assert.match(core,/validatedEntryRiskTier/);assert.match(core,/auditPaperLiquidation/);assert.match(core,/bankruptcyPrice/);assert.match(ticket,/Tier max leverage/);assert.match(ticket,/Bankruptcy price/);assert.match(ticket,/Liquidation buffer/);assert.match(backup,/tier boundary does not reconcile/);assert.match(backup,/liquidation buffer does not reconcile/);assert.match(roadmap,/- \[x\] maintenance tiers and bankruptcy-price audit/);assert.match(roadmap,/Next slice: clearer isolated versus cross-margin assumptions/)});
`;
await writeFile("tests/manual-paper-risk-tier-source.test.mjs",sourceTests);

{
 const path="tests/mexc-contract-metadata.test.mjs";
 let source=await readFile(path,"utf8");
 source=source.replace(
  'assert.match(source, /maintenanceMarginRate:contract\?\.maintenanceMarginRate\?\?/);',
  'assert.match(source, /maintenanceMarginRate:riskTierPreview\?\.maintenanceMarginRate\?\?contract\?\.maintenanceMarginRate\?\?/);'
 );
 await writeFile(path,source);
}

{
 const path="ROADMAP.md";
 let source=await readFile(path,"utf8");
 const old='- [ ] maintenance tiers and bankruptcy-price audit\n- [ ] clearer isolated versus cross-margin assumptions';
 const next='- [x] maintenance tiers and bankruptcy-price audit\n- [ ] clearer isolated versus cross-margin assumptions';
 if(!source.includes(old))throw new Error("roadmap tier checkbox anchor unavailable");
 source=source.replace(old,next);
 source=source.replace('Current slice: maintenance tiers and bankruptcy-price audit.','Maintenance tiers now use snapshotted public contract increment fields with explicit flat fallback, and liquidation is separated from bankruptcy price. Next slice: clearer isolated versus cross-margin assumptions.');
 await writeFile(path,source);
}
