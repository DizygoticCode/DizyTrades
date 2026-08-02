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

const manualPath = "app/lib/manual-paper.ts";
let manual = await readFile(manualPath, "utf8");
manual = replaceOnce(
  manual,
  'import {parseMexcContractMetadata,type MexcContractMetadata} from "./mexc-contract-metadata";',
  'import {isMexcStepAligned,parseMexcContractMetadata,quantizeMexcExecutionPrice,quantizeMexcStep,sizeMexcContractOrder,type MexcContractMetadata} from "./mexc-contract-metadata";',
  "manual metadata import",
);
manual = replaceOnce(
  manual,
  'quantity:number;entryPrice:number;',
  'quantity:number;contractVolume?:number;contractSize?:number;priceUnit?:number;volUnit?:number;entryPrice:number;',
  "position precision type",
);
manual = replaceOnce(
  manual,
  'quantity:number;notional:number;',
  'quantity:number;contractVolume?:number;contractSize?:number;priceUnit?:number;volUnit?:number;notional:number;',
  "fill precision type",
);
manual = replaceOnce(
  manual,
  'function validateExits(side:ManualSide,entry:number,stop:unknown,target:unknown){const stopLoss=stop==null?null:number(stop),takeProfit=target==null?null:number(target);if(stopLoss!==null&&((side==="long"&&stopLoss>=entry)||(side==="short"&&stopLoss<=entry)))fail("INVALID_STOP_LOSS","stopLoss",side==="long"?"Stop loss must be below entry for a long.":"Stop loss must be above entry for a short.");if(takeProfit!==null&&((side==="long"&&takeProfit<=entry)||(side==="short"&&takeProfit>=entry)))fail("INVALID_TAKE_PROFIT","takeProfit",side==="long"?"Take profit must be above entry for a long.":"Take profit must be below entry for a short.");return {stopLoss,takeProfit}}',
  `function validatedContractOrder(notional:number,price:number,contract:MexcContractMetadata){try{return sizeMexcContractOrder(notional,price,contract)}catch(error){const code=error instanceof Error?error.message:"INVALID_CONTRACT_NOTIONAL";if(code==="CONTRACT_VOLUME_BELOW_MINIMUM")return fail(code,"amount",\`Order must contain at least \${contract.minVol} contracts.\`);if(code==="CONTRACT_VOLUME_ABOVE_MAXIMUM")return fail(code,"amount",\`Order cannot exceed \${contract.maxVol} contracts.\`);return fail("INVALID_CONTRACT_NOTIONAL","amount","The requested size cannot be represented by this contract.")}}
function validateExits(side:ManualSide,entry:number,stop:unknown,target:unknown,priceUnit?:number){const stopLoss=stop==null?null:number(stop),takeProfit=target==null?null:number(target);if(stopLoss!==null&&priceUnit&&!isMexcStepAligned(stopLoss,priceUnit))fail("INVALID_PRICE_STEP","stopLoss",\`Stop loss must use \${priceUnit} price increments.\`);if(takeProfit!==null&&priceUnit&&!isMexcStepAligned(takeProfit,priceUnit))fail("INVALID_PRICE_STEP","takeProfit",\`Take profit must use \${priceUnit} price increments.\`);if(stopLoss!==null&&((side==="long"&&stopLoss>=entry)||(side==="short"&&stopLoss<=entry)))fail("INVALID_STOP_LOSS","stopLoss",side==="long"?"Stop loss must be below entry for a long.":"Stop loss must be above entry for a short.");if(takeProfit!==null&&((side==="long"&&takeProfit<=entry)||(side==="short"&&takeProfit>=entry)))fail("INVALID_TAKE_PROFIT","takeProfit",side==="long"?"Take profit must be above entry for a long.":"Take profit must be below entry for a short.");return {stopLoss,takeProfit}}
function precisionSnapshot(position:ManualPosition,contractVolume=position.contractVolume){return contractVolume===undefined?{}:{contractVolume,contractSize:position.contractSize,priceUnit:position.priceUnit,volUnit:position.volUnit}}
function closeQuantityForInput(position:ManualPosition,input:{percentage?:unknown;quantity?:unknown}){const pct=number(input.percentage),requested=number(input.quantity);if(pct!==null&&(pct<=0||pct>100))fail("INVALID_CLOSE_SIZE","quantity","Close percentage must be greater than zero and no more than 100%.");const desired=requested??(pct===null?null:position.quantity*pct/100);if(desired===null||desired<=0||desired>position.quantity)fail("INVALID_CLOSE_SIZE","quantity","Close size must be greater than zero and no more than the open position.");if(desired>=position.quantity*(1-1e-12))return position.quantity;if(position.contractSize&&position.volUnit){const volume=quantizeMexcStep(desired/position.contractSize,position.volUnit,"floor");if(volume<position.volUnit)fail("INVALID_CLOSE_SIZE","quantity",\`Partial close must contain at least \${position.volUnit} contract units.\`);const quantity=Number((volume*position.contractSize).toPrecision(15));if(quantity<=0||quantity>position.quantity)return fail("INVALID_CLOSE_SIZE","quantity","Close size is outside the open contract volume.");return quantity}return desired}`, 
  "contract and exit helpers",
);
manual = replaceOnce(
  manual,
  'const marginMode=input.marginMode??"isolated";if(marginMode!=="isolated"&&marginMode!=="cross")fail("INVALID_MARGIN_MODE","marginMode","Choose isolated or cross margin.");const equity=manualEquity(account,{[input.symbol]:marketPrice}),sizing=calculateManualSizing({...input,leverage:input.leverage??1,side:input.side,minLeverage:contract?.minLeverage??1,maxLeverage:contract?.maxLeverage??20},equity,marketPrice),available=equity-usedManualMargin(account);if(sizing.margin>available)fail("INSUFFICIENT_EQUITY","amount","Margin exceeds available manual paper equity.");const existing=account.positions[input.symbol];',
  'const marginMode=input.marginMode??"isolated";if(marginMode!=="isolated"&&marginMode!=="cross")fail("INVALID_MARGIN_MODE","marginMode","Choose isolated or cross margin.");if(!contract)fail("CONTRACT_METADATA_UNAVAILABLE","symbol","Current public MEXC contract rules are unavailable.");const equity=manualEquity(account,{[input.symbol]:marketPrice}),sizing=calculateManualSizing({...input,leverage:input.leverage??1,side:input.side,minLeverage:contract.minLeverage,maxLeverage:contract.maxLeverage},equity,marketPrice);const existing=account.positions[input.symbol];',
  "submit contract requirement",
);
manual = replaceOnce(
  manual,
  'const slipped=marketPrice*(1+(input.side==="long"?1:-1)*account.settings.slippagePct/100),exits=validateExits(input.side,slipped,input.stopLoss,input.takeProfit),quantity=sizing.notional/slipped,fee=sizing.notional*account.settings.commissionPct/100;account.cashBalance-=fee;',
  'const rawSlipped=marketPrice*(1+(input.side==="long"?1:-1)*account.settings.slippagePct/100),slipped=quantizeMexcExecutionPrice(rawSlipped,contract.priceUnit,input.side,true),contractOrder=validatedContractOrder(sizing.notional,slipped,contract),quantity=contractOrder.quantity,notional=contractOrder.notional,margin=notional/sizing.leverage,available=equity-usedManualMargin(account);if(margin>available)fail("INSUFFICIENT_EQUITY","amount","Margin exceeds available manual paper equity.");const exits=validateExits(input.side,slipped,input.stopLoss,input.takeProfit,contract.priceUnit),fee=notional*account.settings.commissionPct/100;account.cashBalance-=fee;',
  "submit quantised order",
);
manual = replaceOnce(manual, 'assignedMargin:sizing.margin,', 'assignedMargin:margin,', "liquidation actual margin");
manual = replaceOnce(
  manual,
  'quantity,entryPrice:slipped,leverage:sizing.leverage,margin:sizing.margin,marginMode,',
  'quantity,contractVolume:contractOrder.contractVolume,contractSize:contract.contractSize,priceUnit:contract.priceUnit,volUnit:contract.volUnit,entryPrice:slipped,leverage:sizing.leverage,margin,marginMode,',
  "position precision snapshot",
);
manual = replaceOnce(
  manual,
  'price:slipped,quantity,notional:sizing.notional,marginUsed:sizing.margin,',
  'price:slipped,quantity,contractVolume:contractOrder.contractVolume,contractSize:contract.contractSize,priceUnit:contract.priceUnit,volUnit:contract.volUnit,notional,marginUsed:margin,',
  "entry fill precision snapshot",
);
manual = replaceOnce(
  manual,
  'const slipped=marketPrice*(1+(position.side==="long"?-1:1)*account.settings.slippagePct/100),notional=position.quantity*slipped,',
  'const rawSlipped=marketPrice*(1+(position.side==="long"?-1:1)*account.settings.slippagePct/100),slipped=position.priceUnit?quantizeMexcExecutionPrice(rawSlipped,position.priceUnit,position.side,false):rawSlipped,notional=position.quantity*slipped,',
  "close tick price",
);
manual = replaceOnce(
  manual,
  'price:slipped,quantity:position.quantity,notional,marginUsed:',
  'price:slipped,quantity:position.quantity,...precisionSnapshot(position),notional,marginUsed:',
  "close fill precision snapshot",
);
manual = replaceOnce(
  manual,
  'const pct=number(input.percentage),requested=number(input.quantity),quantity=requested??(pct===null?null:position.quantity*pct/100);if(quantity===null||quantity<=0||quantity>position.quantity||(pct!==null&&(pct<=0||pct>100)))fail("INVALID_CLOSE_SIZE","quantity","Close size must be greater than zero and no more than the open position.");const closeQuantity=quantity as number,slipped=marketPrice*(1+(position.side==="long"?-1:1)*account.settings.slippagePct/100),',
  'const closeQuantity=closeQuantityForInput(position,input),rawSlipped=marketPrice*(1+(position.side==="long"?-1:1)*account.settings.slippagePct/100),slipped=position.priceUnit?quantizeMexcExecutionPrice(rawSlipped,position.priceUnit,position.side,false):rawSlipped,',
  "partial close precision",
);
manual = replaceOnce(
  manual,
  'price:slipped,quantity:closeQuantity,notional,fee,',
  'price:slipped,quantity:closeQuantity,...precisionSnapshot(position,position.contractSize?Number((closeQuantity/position.contractSize).toPrecision(15)):undefined),notional,fee,',
  "partial fill precision snapshot",
);
manual = replaceOnce(
  manual,
  'if(fullyClosed)delete account.positions[symbol];else account.positions[symbol]={...position,quantity:position.quantity-closeQuantity,margin:(position.margin??position.quantity*position.entryPrice/position.leverage)*(1-ratio)};',
  'if(fullyClosed)delete account.positions[symbol];else{const remainingContractVolume=position.contractVolume===undefined||!position.contractSize?undefined:Number((position.contractVolume-closeQuantity/position.contractSize).toPrecision(15));account.positions[symbol]={...position,quantity:Number((position.quantity-closeQuantity).toPrecision(15)),contractVolume:remainingContractVolume,margin:(position.margin??position.quantity*position.entryPrice/position.leverage)*(1-ratio)}};',
  "partial remaining precision",
);
manual = replaceOnce(
  manual,
  'const closePrice=marketPrice*(1+(old.side==="long"?-1:1)*account.settings.slippagePct/100),openSide:ManualSide=old.side==="long"?"short":"long",openPrice=marketPrice*(1+(openSide==="long"?1:-1)*account.settings.slippagePct/100),',
  'const rawClosePrice=marketPrice*(1+(old.side==="long"?-1:1)*account.settings.slippagePct/100),closePrice=old.priceUnit?quantizeMexcExecutionPrice(rawClosePrice,old.priceUnit,old.side,false):rawClosePrice,openSide:ManualSide=old.side==="long"?"short":"long",rawOpenPrice=marketPrice*(1+(openSide==="long"?1:-1)*account.settings.slippagePct/100),openPrice=old.priceUnit?quantizeMexcExecutionPrice(rawOpenPrice,old.priceUnit,openSide,true):rawOpenPrice,',
  "reverse tick prices",
);
manual = replaceOnce(
  manual,
  'price:closePrice,quantity:old.quantity,notional:closeNotional,',
  'price:closePrice,quantity:old.quantity,...precisionSnapshot(old),notional:closeNotional,',
  "reverse close precision snapshot",
);
manual = replaceOnce(
  manual,
  'price:openPrice,quantity:old.quantity,notional:openNotional,',
  'price:openPrice,quantity:old.quantity,...precisionSnapshot(old),notional:openNotional,',
  "reverse open precision snapshot",
);
await writeFile(manualPath, manual);

const backupPath = "app/lib/manual-paper-backup.ts";
let backup = await readFile(backupPath, "utf8");
backup = replaceOnce(
  backup,
  '    quantity,\n    entryPrice,',
  '    quantity,\n    contractVolume: input.contractVolume == null ? undefined : number(input.contractVolume, "manualPaper.position.contractVolume", 0.000000000001),\n    contractSize: input.contractSize == null ? undefined : number(input.contractSize, "manualPaper.position.contractSize", 0.000000000001),\n    priceUnit: input.priceUnit == null ? undefined : number(input.priceUnit, "manualPaper.position.priceUnit", 0.000000000001),\n    volUnit: input.volUnit == null ? undefined : number(input.volUnit, "manualPaper.position.volUnit", 0.000000000001),\n    entryPrice,',
  "backup position precision",
);
backup = replaceOnce(
  backup,
  '    quantity: number(input.quantity, "manualPaper.fill.quantity", 0),\n    notional:',
  '    quantity: number(input.quantity, "manualPaper.fill.quantity", 0),\n    contractVolume: input.contractVolume == null ? undefined : number(input.contractVolume, "manualPaper.fill.contractVolume", 0.000000000001),\n    contractSize: input.contractSize == null ? undefined : number(input.contractSize, "manualPaper.fill.contractSize", 0.000000000001),\n    priceUnit: input.priceUnit == null ? undefined : number(input.priceUnit, "manualPaper.fill.priceUnit", 0.000000000001),\n    volUnit: input.volUnit == null ? undefined : number(input.volUnit, "manualPaper.fill.volUnit", 0.000000000001),\n    notional:',
  "backup fill precision",
);
await writeFile(backupPath, backup);

const ticketPath = "app/manual-paper-ticket.tsx";
let ticket = await readFile(ticketPath, "utf8");
ticket = replaceOnce(
  ticket,
  'import {clampContractLeverage,leverageStopsForContract,type MexcContractMetadata} from "./lib/mexc-contract-metadata";',
  'import {clampContractLeverage,isMexcStepAligned,leverageStopsForContract,quantizeMexcExecutionPrice,sizeMexcContractOrder,type MexcContractMetadata} from "./lib/mexc-contract-metadata";',
  "ticket metadata imports",
);
ticket = replaceOnce(
  ticket,
  '  quantity: number;\n  entryPrice: number;',
  '  quantity: number;\n  contractVolume?: number;\n  contractSize?: number;\n  priceUnit?: number;\n  volUnit?: number;\n  entryPrice: number;',
  "ticket position precision type",
);
ticket = replaceOnce(
  ticket,
  '  quantity: number;\n  fee: number;',
  '  quantity: number;\n  contractVolume?: number;\n  fee: number;',
  "ticket fill precision type",
);
ticket = replaceOnce(
  ticket,
  '    commissionPct: number;\n    confirmationRequired:',
  '    commissionPct: number;\n    slippagePct: number;\n    confirmationRequired:',
  "ticket slippage type",
);
ticket = replaceOnce(
  ticket,
  `    margin = Math.max(
      0,
      mode === "equity-percent"||mode==="risk-percent"
        ? (equity * amountNumber) / 100
        : mode === "fixed-notional"
          ? amountNumber / leverageNumber
          : amountNumber,
    ),
    notional = Math.max(
      0,
      mode === "fixed-notional" ? amountNumber : mode==="risk-percent"&&publicPrice&&Number(stopLoss)>0?equity*amountNumber/100/(Math.abs(publicPrice-Number(stopLoss))/publicPrice):margin * leverageNumber,
    ),
    quantity = publicPrice && publicPrice > 0 ? notional / publicPrice : 0,
    fee = Math.max(
      0,
      (notional * (account?.settings.commissionPct ?? 0)) / 100,
    ),
    liquidation=quantity>0?estimateLiquidation({side,entryPrice:publicPrice??0,quantity,marginMode,assignedMargin:margin,crossCollateral:equity,entryFee:fee,maintenanceMarginRate:contract?.maintenanceMarginRate??(account?.settings.maintenanceMarginPct??.5)/100,liquidationPenaltyRate:(account?.settings.liquidationPenaltyPct??.1)/100}):NaN,
    riskAmount=stopLoss&&quantity?Math.abs((publicPrice??0)-Number(stopLoss))*quantity:0,
    rewardRisk=stopLoss&&takeProfit&&riskAmount?Math.abs(Number(takeProfit)-(publicPrice??0))*quantity/riskAmount:0,
    remaining = equity - used - margin - fee,
    invalidAmount = !Number.isFinite(quantity) || quantity <= 0 || margin < 0;`,
  `    targetMargin = Math.max(
      0,
      mode === "equity-percent"||mode==="risk-percent"
        ? (equity * amountNumber) / 100
        : mode === "fixed-notional"
          ? amountNumber / leverageNumber
          : amountNumber,
    ),
    targetNotional = Math.max(
      0,
      mode === "fixed-notional" ? amountNumber : mode==="risk-percent"&&publicPrice&&Number(stopLoss)>0?equity*amountNumber/100/(Math.abs(publicPrice-Number(stopLoss))/publicPrice):targetMargin * leverageNumber,
    ),
    rawExecutionPrice=publicPrice?publicPrice*(1+(side==="long"?1:-1)*(account?.settings.slippagePct??0)/100):0,
    executionPrice=contract&&rawExecutionPrice>0?quantizeMexcExecutionPrice(rawExecutionPrice,contract.priceUnit,side,true):rawExecutionPrice,
    rawContractVolume=contract&&executionPrice>0?targetNotional/(executionPrice*contract.contractSize):0,
    contractVolumeIssue=contract&&targetNotional>0?(rawContractVolume<contract.minVol?\`Minimum \${contract.minVol} contracts\`:rawContractVolume>contract.maxVol?\`Maximum \${contract.maxVol} contracts\`:null):null,
    contractOrder=(()=>{try{return contract&&executionPrice>0&&!contractVolumeIssue?sizeMexcContractOrder(targetNotional,executionPrice,contract):null}catch{return null}})(),
    contractVolume=contractOrder?.contractVolume??0,
    quantity=contractOrder?.quantity??0,
    notional=contractOrder?.notional??0,
    margin=leverageNumber>0?notional/leverageNumber:0,
    fee = Math.max(0,(notional * (account?.settings.commissionPct ?? 0)) / 100),
    liquidation=quantity>0?estimateLiquidation({side,entryPrice:executionPrice,quantity,marginMode,assignedMargin:margin,crossCollateral:equity,entryFee:fee,maintenanceMarginRate:contract?.maintenanceMarginRate??(account?.settings.maintenanceMarginPct??.5)/100,liquidationPenaltyRate:(account?.settings.liquidationPenaltyPct??.1)/100}):NaN,
    riskAmount=stopLoss&&quantity?Math.abs(executionPrice-Number(stopLoss))*quantity:0,
    rewardRisk=stopLoss&&takeProfit&&riskAmount?Math.abs(Number(takeProfit)-executionPrice)*quantity/riskAmount:0,
    remaining = equity - used - margin - fee,
    invalidPriceStep=Boolean(contract&&((stopLoss&&!isMexcStepAligned(Number(stopLoss),contract.priceUnit))||(takeProfit&&!isMexcStepAligned(Number(takeProfit),contract.priceUnit)))),
    invalidAmount = !Number.isFinite(quantity) || quantity <= 0 || margin < 0 || Boolean(contractVolumeIssue) || invalidPriceStep;`,
  "ticket quantised preview",
);
ticket = replaceCount(
  ticket,
  '                  type="number"\n                  value=',
  '                  type="number"\n                  step={contract?.priceUnit ?? "any"}\n                  value=',
  2,
  "stop and target steps",
);
ticket = replaceOnce(
  ticket,
  '                ["Margin mode", marginMode],\n                ["Quantity", quantity.toFixed(8)],',
  '                ["Margin mode", marginMode],\n                ["Execution price", executionPrice?money(executionPrice):"—"],\n                ["Contracts", contractVolume?String(contractVolume):"—"],\n                ["Contract size", contract?String(contract.contractSize):"—"],\n                ["Price tick", contract?String(contract.priceUnit):"—"],\n                ["Quantity", quantity.toFixed(8)],',
  "ticket precision preview rows",
);
ticket = replaceOnce(
  ticket,
  '              {!contract?<span>Public MEXC contract rules unavailable — opening new paper positions is disabled.</span>:null}\n              {!stopLoss?',
  '              {!contract?<span>Public MEXC contract rules unavailable — opening new paper positions is disabled.</span>:null}\n              {contractVolumeIssue?<span>{contractVolumeIssue}; requested size cannot be opened.</span>:null}\n              {invalidPriceStep&&contract?<span>Stop loss and take profit must use {contract.priceUnit} price increments.</span>:null}\n              {!stopLoss?',
  "ticket precision warnings",
);
await writeFile(ticketPath, ticket);

const testsPath = "tests/manual-paper.test.mjs";
let tests = await readFile(testsPath, "utf8");
tests += `

test("Manual Paper source applies MEXC contract and tick precision server-side",()=>{const source=readFileSync(new URL("../app/lib/manual-paper.ts",import.meta.url),"utf8");assert.match(source,/sizeMexcContractOrder/);assert.match(source,/quantizeMexcExecutionPrice/);assert.match(source,/INVALID_PRICE_STEP/);assert.match(source,/contractVolume:contractOrder\.contractVolume/)});
`;
await writeFile(testsPath, tests);
