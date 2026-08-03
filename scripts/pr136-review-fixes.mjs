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
  'quantity:number;contractVolume?:number;contractSize?:number;priceUnit?:number;volUnit?:number;entryPrice:number;',
  'quantity:number;contractVolume?:number;contractSize?:number;priceUnit?:number;volUnit?:number;minContractVolume?:number;maxContractVolume?:number;entryPrice:number;',
  "position contract limits type",
);
manual = replaceOnce(
  manual,
  'quantity:number;contractVolume?:number;contractSize?:number;priceUnit?:number;volUnit?:number;notional:number;',
  'quantity:number;contractVolume?:number;contractSize?:number;priceUnit?:number;volUnit?:number;minContractVolume?:number;maxContractVolume?:number;notional:number;',
  "fill contract limits type",
);
manual = replaceOnce(
  manual,
  'function precisionSnapshot(position:ManualPosition,contractVolume=position.contractVolume){return contractVolume===undefined?{}:{contractVolume,contractSize:position.contractSize,priceUnit:position.priceUnit,volUnit:position.volUnit}}',
  'function precisionSnapshot(position:ManualPosition,contractVolume=position.contractVolume){return contractVolume===undefined?{}:{contractVolume,contractSize:position.contractSize,priceUnit:position.priceUnit,volUnit:position.volUnit,minContractVolume:position.minContractVolume,maxContractVolume:position.maxContractVolume}}',
  "precision snapshot limits",
);
manual = replaceOnce(
  manual,
  'if(position.contractSize&&position.volUnit){const volume=quantizeMexcStep(desired/position.contractSize,position.volUnit,"floor");if(volume<position.volUnit)fail("INVALID_CLOSE_SIZE","quantity",`Partial close must contain at least ${position.volUnit} contract units.`);const quantity=Number((volume*position.contractSize).toPrecision(15));if(quantity<=0||quantity>position.quantity)return fail("INVALID_CLOSE_SIZE","quantity","Close size is outside the open contract volume.");return quantity}',
  'if(position.contractSize&&position.volUnit){const volume=quantizeMexcStep(desired/position.contractSize,position.volUnit,"floor"),minimum=position.minContractVolume??position.volUnit,openVolume=position.contractVolume??position.quantity/position.contractSize,remaining=Number((openVolume-volume).toPrecision(15));if(volume<minimum)fail("INVALID_CLOSE_SIZE","quantity",`Partial close must contain at least ${minimum} contracts.`);if(remaining>1e-12&&remaining<minimum)fail("INVALID_CLOSE_SIZE","quantity",`Partial close would leave fewer than ${minimum} contracts open.`);const quantity=Number((volume*position.contractSize).toPrecision(15));if(quantity<=0||quantity>position.quantity)return fail("INVALID_CLOSE_SIZE","quantity","Close size is outside the open contract volume.");return quantity}',
  "partial close contract limits",
);
manual = replaceCount(
  manual,
  'contractSize:currentContract.contractSize,priceUnit:currentContract.priceUnit,volUnit:currentContract.volUnit',
  'contractSize:currentContract.contractSize,priceUnit:currentContract.priceUnit,volUnit:currentContract.volUnit,minContractVolume:currentContract.minVol,maxContractVolume:currentContract.maxVol',
  2,
  "entry precision limits",
);
await writeFile(manualPath, manual);

const backupPath = "app/lib/manual-paper-backup.ts";
let backup = await readFile(backupPath, "utf8");
backup = replaceOnce(
  backup,
  '    volUnit: input.volUnit == null ? undefined : number(input.volUnit, "manualPaper.position.volUnit", 0.000000000001),\n    entryPrice,',
  '    volUnit: input.volUnit == null ? undefined : number(input.volUnit, "manualPaper.position.volUnit", 0.000000000001),\n    minContractVolume: input.minContractVolume == null ? undefined : number(input.minContractVolume, "manualPaper.position.minContractVolume", 0.000000000001),\n    maxContractVolume: input.maxContractVolume == null ? undefined : number(input.maxContractVolume, "manualPaper.position.maxContractVolume", 0.000000000001),\n    entryPrice,',
  "backup position limits",
);
backup = replaceOnce(
  backup,
  '    volUnit: input.volUnit == null ? undefined : number(input.volUnit, "manualPaper.fill.volUnit", 0.000000000001),\n    notional:',
  '    volUnit: input.volUnit == null ? undefined : number(input.volUnit, "manualPaper.fill.volUnit", 0.000000000001),\n    minContractVolume: input.minContractVolume == null ? undefined : number(input.minContractVolume, "manualPaper.fill.minContractVolume", 0.000000000001),\n    maxContractVolume: input.maxContractVolume == null ? undefined : number(input.maxContractVolume, "manualPaper.fill.maxContractVolume", 0.000000000001),\n    notional:',
  "backup fill limits",
);
await writeFile(backupPath, backup);

const ticketPath = "app/manual-paper-ticket.tsx";
let ticket = await readFile(ticketPath, "utf8");
ticket = replaceOnce(
  ticket,
  'clampContractLeverage,isMexcStepAligned,leverageStopsForContract,quantizeMexcExecutionPrice,sizeMexcContractOrder',
  'clampContractLeverage,isMexcStepAligned,leverageStopsForContract,quantizeMexcExecutionPrice,quantizeMexcStep,sizeMexcContractOrder',
  "ticket step import",
);
ticket = replaceOnce(
  ticket,
  '  volUnit?: number;\n  entryPrice:',
  '  volUnit?: number;\n  minContractVolume?: number;\n  maxContractVolume?: number;\n  entryPrice:',
  "ticket position limits type",
);
ticket = replaceOnce(
  ticket,
  '    rawContractVolume=contract&&executionPrice>0?targetNotional/(executionPrice*contract.contractSize):0,\n    contractVolumeIssue=contract&&targetNotional>0?(rawContractVolume<contract.minVol?`Minimum ${contract.minVol} contracts`:rawContractVolume>contract.maxVol?`Maximum ${contract.maxVol} contracts`:null):null,',
  '    rawContractVolume=contract&&executionPrice>0?targetNotional/(executionPrice*contract.contractSize):0,\n    steppedContractVolume=contract&&rawContractVolume>0?quantizeMexcStep(rawContractVolume,contract.volUnit,"floor"):0,\n    contractVolumeIssue=contract&&targetNotional>0?(steppedContractVolume<contract.minVol?`Minimum ${contract.minVol} contracts`:steppedContractVolume>contract.maxVol?`Maximum ${contract.maxVol} contracts`:null):null,',
  "ticket stepped volume limits",
);
await writeFile(ticketPath, ticket);

const metadataTestsPath = "tests/mexc-contract-metadata.test.mjs";
let metadataTests = await readFile(metadataTestsPath, "utf8");
metadataTests = replaceOnce(
  metadataTests,
  '  assert.ok(sizing.notional <= 123.456);\n});',
  '  assert.ok(sizing.notional <= 123.456);\n  const maxEdge=sizeMexcContractOrder((value.maxVol+.5)*2500*value.contractSize,2500,value);\n  assert.equal(maxEdge.contractVolume,value.maxVol);\n});',
  "max-volume flooring test",
);
await writeFile(metadataTestsPath, metadataTests);

const manualTestsPath = "tests/manual-paper.test.mjs";
let manualTests = await readFile(manualTestsPath, "utf8");
manualTests += `\n\ntest("partial closes reject invalid contract-sized remnants",async()=>{const {mkdtemp,rm}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),{join}=await import("node:path"),{submitManualOrder,partialCloseManualPosition}=await import("../app/lib/manual-paper.ts"),prior=process.env.DATA_DIR,root=await mkdtemp(join(tmpdir(),"dizy-paper-remnant-"));process.env.DATA_DIR=root;const contract={...btcContract,symbol:"XAU_USDT",displayName:"GOLD(XAU)USDT SWAP",maxLeverage:1000,priceUnit:.01,minVol:5};try{const account=await submitManualOrder("precision-remnant",{idempotencyKey:"precision-remnant-open",symbol:"XAU_USDT",side:"long",sizeMode:"fixed-notional",amount:25,leverage:10},2500,"fair",contract);assert.equal(account.positions.XAU_USDT.contractVolume,9);await assert.rejects(()=>partialCloseManualPosition("precision-remnant","XAU_USDT","precision-remnant-close",2500,{quantity:.005}),error=>error instanceof ManualPaperError&&error.code==="INVALID_CLOSE_SIZE")}finally{if(prior===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=prior;await rm(root,{recursive:true,force:true})}});\n`;
await writeFile(manualTestsPath, manualTests);
