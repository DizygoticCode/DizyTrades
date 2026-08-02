import { replace, write } from './utils.mjs';

await replace(
  'tests/manual-paper-engine.test.mjs',
  'test("malformed and non-finite sizing is rejected",()=>{for(const amount of [0,-1,NaN,Infinity])assert.throws(()=>sizePaperPosition({mode:"fixed-margin",amount,leverage:1,equity:100,price:10,side:"long"}));assert.throws(()=>sizePaperPosition({mode:"fixed-margin",amount:200,leverage:1,equity:100,price:10,side:"long"}),/INSUFFICIENT/)});',
  'test("symbol-specific leverage ceilings are enforced",()=>{assert.equal(sizePaperPosition({mode:"fixed-margin",amount:1,leverage:1000,maxLeverage:1000,equity:100,price:100,side:"long"}).notional,1000);assert.throws(()=>sizePaperPosition({mode:"fixed-margin",amount:1,leverage:1001,maxLeverage:1000,equity:100,price:100,side:"long"}),/INVALID_SIZING/)});\ntest("malformed and non-finite sizing is rejected",()=>{for(const amount of [0,-1,NaN,Infinity])assert.throws(()=>sizePaperPosition({mode:"fixed-margin",amount,leverage:1,equity:100,price:10,side:"long"}));assert.throws(()=>sizePaperPosition({mode:"fixed-margin",amount:200,leverage:1,equity:100,price:10,side:"long"}),/INSUFFICIENT/)});',
);
await replace(
  'tests/manual-paper.test.mjs',
  'test("manual paper allows fractional quantity and validates fields",()=>{assert.equal(calculateManualSizing({sizeMode:"fixed-margin",amount:.01,leverage:1},100,60000).quantity,1/6000000);',
  'test("manual paper allows fractional quantity and validates fields",()=>{assert.equal(calculateManualSizing({sizeMode:"fixed-margin",amount:.01,leverage:1},100,60000).quantity,1/6000000);assert.equal(calculateManualSizing({sizeMode:"fixed-margin",amount:1,leverage:1000,maxLeverage:1000},100,100).notional,1000);assert.throws(()=>calculateManualSizing({sizeMode:"fixed-margin",amount:1,leverage:1001,maxLeverage:1000},100,100),e=>e instanceof ManualPaperError&&e.code==="INVALID_LEVERAGE");',
);

const metadataTest = `import test from "node:test";
import assert from "node:assert/strict";
import {clampContractLeverage,leverageStopsForContract,parseMexcContractMetadata} from "../app/lib/mexc-contract-metadata.ts";

const xauPayload={success:true,data:[{symbol:"XAU_USDT",displayNameEn:"GOLD(XAU)USDT SWAP",positionOpenType:3,contractSize:.001,minLeverage:1,maxLeverage:1000,priceUnit:.01,volUnit:1,minVol:1,maxVol:1_000_000,makerFeeRate:.0002,takerFeeRate:.0006,maintenanceMarginRate:.0004,initialMarginRate:.001,riskLimitType:"BY_VOLUME"}]};

test("parses public MEXC contract leverage and precision",()=>{const contract=parseMexcContractMetadata(xauPayload,"XAU_USDT");assert.equal(contract.maxLeverage,1000);assert.equal(contract.contractSize,.001);assert.equal(contract.maintenanceMarginRate,.0004);assert.equal(contract.positionOpenType,3)});
test("builds practical stops while preserving exact range endpoints",()=>{const contract=parseMexcContractMetadata(xauPayload,"XAU_USDT");assert.deepEqual(leverageStopsForContract(contract),[1,2,3,5,10,20,25,50,75,100,125,200,500,1000]);assert.equal(clampContractLeverage(999.6,contract),1000);assert.equal(clampContractLeverage(5000,contract),1000)});
test("rejects malformed or mismatched contract metadata",()=>{assert.throws(()=>parseMexcContractMetadata(xauPayload,"BTC_USDT"),/unavailable|mismatch/i);assert.throws(()=>parseMexcContractMetadata({success:true,data:[{...xauPayload.data[0],maxLeverage:2000}]},"XAU_USDT"),/leverage range/i)});
`;
await write('tests/mexc-contract-metadata.test.mjs', metadataTest);
