import {readFile,writeFile} from "node:fs/promises";

const path="tests/manual-paper-risk-tiers.test.mjs";
let source=await readFile(path,"utf8");
const openingOld='assert.equal(position.liquidationAudit.estimatedLiquidation,position.estimatedLiquidation);assert.equal(account.fills.at(-1).riskTier.level,2);';
const openingNew='assert.equal(position.liquidationAudit.estimatedLiquidation,position.estimatedLiquidation);assert.equal(position.liquidationAudit.positionQuantity,position.quantity);assert.equal(account.fills.at(-1).riskTier.level,2);assert.equal(account.fills.at(-1).liquidationAudit.positionQuantity,10);';
if(source.split(openingOld).length-1!==1)throw new Error("opening liquidation basis assertion anchor unavailable");
source=source.replace(openingOld,openingNew);
const residualOld='assert.equal(position.liquidationAudit.maintenanceMarginRate,.01);assert.equal(validateManualPaperBackup(account,"risk-tier-user").positions.BTC_USDT.riskTier.level,1);';
const residualNew='assert.equal(position.liquidationAudit.maintenanceMarginRate,.01);assert.equal(position.liquidationAudit.positionQuantity,5);const closeFill=account.fills.at(-1);assert.equal(closeFill.liquidationAudit.positionQuantity,10);assert.equal(validateManualPaperBackup(account,"risk-tier-user").positions.BTC_USDT.riskTier.level,1);';
if(source.split(residualOld).length-1!==1)throw new Error("residual liquidation basis assertion anchor unavailable");
source=source.replace(residualOld,residualNew);
const tamperOld='copy=>copy.positions.BTC_USDT.liquidationAudit.maintenanceMarginAtLiquidation=1]';
const tamperNew='copy=>copy.positions.BTC_USDT.liquidationAudit.maintenanceMarginAtLiquidation=1,copy=>copy.positions.BTC_USDT.liquidationAudit.positionQuantity=999]';
if(source.split(tamperOld).length-1!==1)throw new Error("liquidation basis tamper anchor unavailable");
source=source.replace(tamperOld,tamperNew);
await writeFile(path,source);
