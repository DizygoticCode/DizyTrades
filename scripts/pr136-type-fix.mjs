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

const path = "app/lib/manual-paper.ts";
let source = await readFile(path, "utf8");

source = replaceOnce(
  source,
  'const desired=requested??(pct===null?null:position.quantity*pct/100);if(desired===null||desired<=0||desired>position.quantity)fail("INVALID_CLOSE_SIZE","quantity","Close size must be greater than zero and no more than the open position.");if(desired>=position.quantity*(1-1e-12))return position.quantity;if(position.contractSize&&position.volUnit){const volume=quantizeMexcStep(desired/position.contractSize,position.volUnit,"floor");',
  'const desiredValue=requested??(pct===null?null:position.quantity*pct/100);if(desiredValue===null)fail("INVALID_CLOSE_SIZE","quantity","Close size must be greater than zero and no more than the open position.");const desired=desiredValue as number;if(desired<=0||desired>position.quantity)fail("INVALID_CLOSE_SIZE","quantity","Close size must be greater than zero and no more than the open position.");if(desired>=position.quantity*(1-1e-12))return position.quantity;if(position.contractSize&&position.volUnit){const volume=quantizeMexcStep(desired/position.contractSize,position.volUnit,"floor");',
  "partial-close narrowing",
);

source = replaceOnce(
  source,
  'if(!contract)fail("CONTRACT_METADATA_UNAVAILABLE","symbol","Current public MEXC contract rules are unavailable.");const equity=manualEquity(account,{[input.symbol]:marketPrice}),sizing=calculateManualSizing({...input,leverage:input.leverage??1,side:input.side,minLeverage:contract.minLeverage,maxLeverage:contract.maxLeverage},equity,marketPrice);const existing=',
  'if(!contract)fail("CONTRACT_METADATA_UNAVAILABLE","symbol","Current public MEXC contract rules are unavailable.");const currentContract=contract as MexcContractMetadata,equity=manualEquity(account,{[input.symbol]:marketPrice}),sizing=calculateManualSizing({...input,leverage:input.leverage??1,side:input.side,minLeverage:currentContract.minLeverage,maxLeverage:currentContract.maxLeverage},equity,marketPrice);const existing=',
  "contract metadata narrowing",
);
source = replaceOnce(
  source,
  'slipped=quantizeMexcExecutionPrice(rawSlipped,contract.priceUnit,input.side,true),contractOrder=validatedContractOrder(sizing.notional,slipped,contract)',
  'slipped=quantizeMexcExecutionPrice(rawSlipped,currentContract.priceUnit,input.side,true),contractOrder=validatedContractOrder(sizing.notional,slipped,currentContract)',
  "contract execution narrowing",
);
source = replaceOnce(
  source,
  'validateExits(input.side,slipped,input.stopLoss,input.takeProfit,contract.priceUnit)',
  'validateExits(input.side,slipped,input.stopLoss,input.takeProfit,currentContract.priceUnit)',
  "contract exit-step narrowing",
);
source = replaceOnce(
  source,
  'maintenanceMarginRate:contract?.maintenanceMarginRate??account.settings.maintenanceMarginPct/100',
  'maintenanceMarginRate:currentContract.maintenanceMarginRate',
  "contract maintenance narrowing",
);
source = replaceCount(
  source,
  'contractSize:contract.contractSize,priceUnit:contract.priceUnit,volUnit:contract.volUnit',
  'contractSize:currentContract.contractSize,priceUnit:currentContract.priceUnit,volUnit:currentContract.volUnit',
  2,
  "contract precision snapshot narrowing",
);

await writeFile(path, source);
