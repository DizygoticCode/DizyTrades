import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {clampContractLeverage,leverageStopsForContract,parseMexcContractMetadata} from "../app/lib/mexc-contract-metadata.ts";

const xauPayload={success:true,data:[{symbol:"XAU_USDT",displayNameEn:"GOLD(XAU)USDT SWAP",positionOpenType:3,contractSize:.001,minLeverage:1,maxLeverage:1000,priceUnit:.01,volUnit:1,minVol:1,maxVol:1_000_000,makerFeeRate:.0002,takerFeeRate:.0006,maintenanceMarginRate:.0004,initialMarginRate:.001,riskLimitType:"BY_VOLUME"}]};

test("parses public MEXC contract leverage and precision",()=>{const contract=parseMexcContractMetadata(xauPayload,"XAU_USDT");assert.equal(contract.maxLeverage,1000);assert.equal(contract.contractSize,.001);assert.equal(contract.maintenanceMarginRate,.0004);assert.equal(contract.positionOpenType,3)});
test("builds practical stops while preserving exact range endpoints",()=>{const contract=parseMexcContractMetadata(xauPayload,"XAU_USDT");assert.deepEqual(leverageStopsForContract(contract),[1,2,3,5,10,20,25,50,75,100,125,200,500,1000]);assert.equal(clampContractLeverage(999.6,contract),1000);assert.equal(clampContractLeverage(5000,contract),1000)});
test("rejects malformed or mismatched contract metadata",()=>{assert.throws(()=>parseMexcContractMetadata(xauPayload,"BTC_USDT"),/unavailable|mismatch/i);assert.throws(()=>parseMexcContractMetadata({success:true,data:[{...xauPayload.data[0],maxLeverage:2000}]},"XAU_USDT"),/leverage range/i)});

test("Manual Paper ticket requires contract rules and previews the contract maintenance rate",()=>{const source=readFileSync(new URL("../app/manual-paper-ticket.tsx",import.meta.url),"utf8");assert.match(source,/!publicPrice \|\|\s*!contract \|\|\s*invalidAmount/);assert.match(source,/maintenanceMarginRate:contract\?\.maintenanceMarginRate\?\?/)});
