import { readFile, writeFile } from "node:fs/promises";

const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(before, after);
};
const replaceCount = (source, before, after, expected, label) => {
  const count = source.split(before).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return source.split(before).join(after);
};

const path = "tests/manual-paper.test.mjs";
let source = await readFile(path, "utf8");
source = replaceOnce(
  source,
  'import test from "node:test";import assert from "node:assert/strict";import {calculateManualSizing,ManualPaperError,newManualAccount,manualEquity} from "../app/lib/manual-paper.ts";',
  'import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";import {calculateManualSizing,ManualPaperError,newManualAccount,manualEquity} from "../app/lib/manual-paper.ts";\nconst btcContract={symbol:"BTC_USDT",displayName:"BTCUSDT SWAP",contractSize:.001,minLeverage:1,maxLeverage:125,priceUnit:.1,volUnit:1,minVol:1,maxVol:1_000_000,makerFeeRate:.0002,takerFeeRate:.0006,maintenanceMarginRate:.004,initialMarginRate:.008,positionOpenType:3,riskLimitType:"BY_VOLUME"};',
  "manual paper test imports and fixture",
);
source = replaceCount(
  source,
  'amount:100,leverage:2},100)',
  'amount:100,leverage:2},100,"last",btcContract)',
  2,
  "direct submit fixtures",
);
source += `

test("new Manual Paper fills use valid MEXC contract volume and tick prices",async()=>{const {mkdtemp,rm}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),{join}=await import("node:path"),{submitManualOrder}=await import("../app/lib/manual-paper.ts"),prior=process.env.DATA_DIR,root=await mkdtemp(join(tmpdir(),"dizy-paper-precision-"));process.env.DATA_DIR=root;try{const contract={...btcContract,symbol:"XAU_USDT",displayName:"GOLD(XAU)USDT SWAP",maxLeverage:1000,priceUnit:.01};const account=await submitManualOrder("precision-owner",{idempotencyKey:"precision-open-00001",symbol:"XAU_USDT",side:"long",sizeMode:"fixed-notional",amount:123.456,leverage:1000},2500,"fair",contract),position=account.positions.XAU_USDT,fill=account.fills.at(-1);assert.equal(position.contractVolume,49);assert.equal(position.quantity,.049);assert.equal(position.contractSize,.001);assert.equal(position.priceUnit,.01);assert.equal(position.entryPrice,2500.5);assert.equal(fill.contractVolume,49);assert.equal(fill.notional,122.5245);assert.ok(Math.abs(fill.marginUsed-0.1225245)<1e-12)}finally{if(prior===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=prior;await rm(root,{recursive:true,force:true})}});

test("Manual Paper rejects invalid price increments and sub-minimum contract volume",async()=>{const {mkdtemp,rm}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),{join}=await import("node:path"),{submitManualOrder}=await import("../app/lib/manual-paper.ts"),prior=process.env.DATA_DIR,root=await mkdtemp(join(tmpdir(),"dizy-paper-precision-reject-"));process.env.DATA_DIR=root;const contract={...btcContract,symbol:"XAU_USDT",displayName:"GOLD(XAU)USDT SWAP",maxLeverage:1000,priceUnit:.01};try{await assert.rejects(()=>submitManualOrder("precision-reject",{idempotencyKey:"precision-stop-00001",symbol:"XAU_USDT",side:"long",sizeMode:"fixed-margin",amount:10,leverage:10,stopLoss:2400.005},2500,"fair",contract),error=>error instanceof ManualPaperError&&error.code==="INVALID_PRICE_STEP");await assert.rejects(()=>submitManualOrder("precision-reject",{idempotencyKey:"precision-small-0001",symbol:"XAU_USDT",side:"long",sizeMode:"fixed-notional",amount:1,leverage:1},2500,"fair",contract),error=>error instanceof ManualPaperError&&error.code==="CONTRACT_VOLUME_BELOW_MINIMUM")}finally{if(prior===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=prior;await rm(root,{recursive:true,force:true})}});
`;
await writeFile(path, source);
