import { readFile, writeFile } from "node:fs/promises";

const replaceOnce = (source, search, replacement, label) => {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(search, replacement);
};

const riskModule = `import type {MexcContractMetadata} from "./mexc-contract-metadata";

export type PaperRiskTierSource="mexc-public-contract-derived"|"mexc-public-contract-flat-fallback"|"legacy-flat-assumption";
export type PaperRiskTierCalculation="contract-tier-increments"|"flat-contract-fallback"|"legacy-flat-assumption";
export type PaperRiskLimitType="BY_VOLUME"|"BY_VALUE"|"UNKNOWN";
export type PaperRiskTierSnapshot=Readonly<{
 symbol:string;
 source:PaperRiskTierSource;
 calculationMethod:PaperRiskTierCalculation;
 riskLimitType:PaperRiskLimitType;
 level:number;
 exposure:number;
 maxExposure:number|null;
 maintenanceMarginRate:number;
 initialMarginRate:number;
 maxLeverage:number;
 baseExposure:number|null;
 exposureIncrement:number|null;
 maintenanceIncrement:number;
 initialIncrement:number;
 levelLimit:number;
 capturedAt:number;
}>;

const finite=(value:number)=>Number.isFinite(value);
const positive=(value:number)=>finite(value)&&value>0;
const nonNegative=(value:number)=>finite(value)&&value>=0;
const tolerance=(value:number)=>Math.max(1e-9,Math.abs(value)*1e-10);
const maxLeverageFor=(contractMaximum:number,initialMarginRate:number)=>initialMarginRate>0?Math.max(1,Math.min(contractMaximum,Math.floor(1/initialMarginRate+1e-10))):contractMaximum;

export function riskExposureForContract(contract:MexcContractMetadata,input:{contractVolume:number;notional:number}){
 const value=contract.riskLimitType==="BY_VOLUME"?input.contractVolume:input.notional;
 if(!positive(value))throw new Error("INVALID_RISK_EXPOSURE");
 return value;
}

function derivedScheduleAvailable(contract:MexcContractMetadata){return positive(contract.riskBaseVol??NaN)&&positive(contract.riskIncrVol??NaN)&&nonNegative(contract.riskIncrMmr??NaN)&&nonNegative(contract.riskIncrImr??NaN)&&Number.isInteger(contract.riskLevelLimit)&&Number(contract.riskLevelLimit)>=1}

export function selectMexcContractRiskTier(contract:MexcContractMetadata,input:{contractVolume:number;notional:number},capturedAt=Date.now()):PaperRiskTierSnapshot{
 const exposure=riskExposureForContract(contract,input);
 if(derivedScheduleAvailable(contract)){
  const baseExposure=contract.riskBaseVol as number,exposureIncrement=contract.riskIncrVol as number,maintenanceIncrement=contract.riskIncrMmr as number,initialIncrement=contract.riskIncrImr as number,levelLimit=contract.riskLevelLimit as number,maximum=baseExposure+exposureIncrement*(levelLimit-1);
  if(exposure-maximum>tolerance(maximum))throw new Error("RISK_LIMIT_EXCEEDED");
  const level=exposure<=baseExposure+tolerance(baseExposure)?1:Math.min(levelLimit,Math.ceil((exposure-baseExposure)/exposureIncrement)+1),maintenanceMarginRate=contract.maintenanceMarginRate+maintenanceIncrement*(level-1),initialMarginRate=contract.initialMarginRate+initialIncrement*(level-1);
  if(!nonNegative(maintenanceMarginRate)||maintenanceMarginRate>=1||!nonNegative(initialMarginRate)||initialMarginRate>=1)throw new Error("INVALID_RISK_TIER");
  return Object.freeze({symbol:contract.symbol,source:"mexc-public-contract-derived",calculationMethod:"contract-tier-increments",riskLimitType:contract.riskLimitType,level,exposure,maxExposure:baseExposure+exposureIncrement*(level-1),maintenanceMarginRate,initialMarginRate,maxLeverage:maxLeverageFor(contract.maxLeverage,initialMarginRate),baseExposure,exposureIncrement,maintenanceIncrement,initialIncrement,levelLimit,capturedAt});
 }
 const maxExposure=contract.riskLimitType==="BY_VOLUME"?contract.maxVol:null;
 if(maxExposure!==null&&exposure-maxExposure>tolerance(maxExposure))throw new Error("RISK_LIMIT_EXCEEDED");
 return Object.freeze({symbol:contract.symbol,source:"mexc-public-contract-flat-fallback",calculationMethod:"flat-contract-fallback",riskLimitType:contract.riskLimitType,level:1,exposure,maxExposure,maintenanceMarginRate:contract.maintenanceMarginRate,initialMarginRate:contract.initialMarginRate,maxLeverage:contract.maxLeverage,baseExposure:null,exposureIncrement:null,maintenanceIncrement:0,initialIncrement:0,levelLimit:1,capturedAt});
}

export function reselectPaperRiskTier(snapshot:PaperRiskTierSnapshot,exposure:number):PaperRiskTierSnapshot{
 if(!positive(exposure))throw new Error("INVALID_RISK_EXPOSURE");
 if(snapshot.calculationMethod==="contract-tier-increments"){
  const base=snapshot.baseExposure,increment=snapshot.exposureIncrement;
  if(!positive(base??NaN)||!positive(increment??NaN))throw new Error("INVALID_RISK_TIER");
  const maximum=(base as number)+(increment as number)*(snapshot.levelLimit-1);
  if(exposure-maximum>tolerance(maximum))throw new Error("RISK_LIMIT_EXCEEDED");
  const level=exposure<=(base as number)+tolerance(base as number)?1:Math.min(snapshot.levelLimit,Math.ceil((exposure-(base as number))/(increment as number))+1),maintenanceMarginRate=snapshot.maintenanceMarginRate-snapshot.maintenanceIncrement*(snapshot.level-1)+snapshot.maintenanceIncrement*(level-1),initialMarginRate=snapshot.initialMarginRate-snapshot.initialIncrement*(snapshot.level-1)+snapshot.initialIncrement*(level-1),contractMaximum=Math.max(snapshot.maxLeverage,Math.floor(1/Math.max(1e-12,snapshot.initialMarginRate-snapshot.initialIncrement*(snapshot.level-1))+1e-10));
  return Object.freeze({...snapshot,level,exposure,maxExposure:(base as number)+(increment as number)*(level-1),maintenanceMarginRate,initialMarginRate,maxLeverage:maxLeverageFor(contractMaximum,initialMarginRate)});
 }
 if(snapshot.maxExposure!==null&&exposure-snapshot.maxExposure>tolerance(snapshot.maxExposure))throw new Error("RISK_LIMIT_EXCEEDED");
 return Object.freeze({...snapshot,level:1,exposure});
}

export function legacyPaperRiskTierSnapshot(input:{symbol:string;riskLimitType?:PaperRiskLimitType;exposure:number;maintenanceMarginRate:number;initialMarginRate?:number;maxLeverage:number;capturedAt?:number}):PaperRiskTierSnapshot{
 if(!positive(input.exposure)||!nonNegative(input.maintenanceMarginRate)||input.maintenanceMarginRate>=1||!positive(input.maxLeverage))throw new Error("INVALID_RISK_TIER");
 const initialMarginRate=input.initialMarginRate??1/input.maxLeverage;
 return Object.freeze({symbol:input.symbol,source:"legacy-flat-assumption",calculationMethod:"legacy-flat-assumption",riskLimitType:input.riskLimitType??"UNKNOWN",level:1,exposure:input.exposure,maxExposure:null,maintenanceMarginRate:input.maintenanceMarginRate,initialMarginRate,maxLeverage:input.maxLeverage,baseExposure:null,exposureIncrement:null,maintenanceIncrement:0,initialIncrement:0,levelLimit:1,capturedAt:input.capturedAt??Date.now()});
}
`;
await writeFile("app/lib/manual-paper-risk-tiers.ts",riskModule);

{
 const path="app/lib/mexc-contract-metadata.ts";
 let source=await readFile(path,"utf8");
 source=replaceOnce(source,'  riskLimitType: "BY_VOLUME" | "BY_VALUE" | "UNKNOWN";\n','  riskLimitType: "BY_VOLUME" | "BY_VALUE" | "UNKNOWN";\n  riskBaseVol?: number;\n  riskIncrVol?: number;\n  riskIncrMmr?: number;\n  riskIncrImr?: number;\n  riskLevelLimit?: number;\n',"metadata tier type");
 source=replaceOnce(source,'  const volUnit = positive(input.volUnit, "volume unit");\n','  const optionalPositive=(value:unknown,field:string)=>value==null?undefined:positive(value,field);\n  const optionalNonNegative=(value:unknown,field:string)=>value==null?undefined:nonNegative(value,field);\n  const riskLevelRaw=input.riskLevelLimit==null?undefined:finite(input.riskLevelLimit);\n  if(riskLevelRaw!==undefined&&(!Number.isInteger(riskLevelRaw)||riskLevelRaw<1||riskLevelRaw>1000))throw new Error("Invalid MEXC risk level limit.");\n  const volUnit = positive(input.volUnit, "volume unit");\n',"metadata optional parsers");
 source=replaceOnce(source,'    riskLimitType,\n  });','    riskLimitType,\n    riskBaseVol: optionalPositive(input.riskBaseVol, "risk base volume"),\n    riskIncrVol: optionalPositive(input.riskIncrVol, "risk volume increment"),\n    riskIncrMmr: optionalNonNegative(input.riskIncrMmr, "risk maintenance increment"),\n    riskIncrImr: optionalNonNegative(input.riskIncrImr, "risk initial increment"),\n    riskLevelLimit: riskLevelRaw,\n  });',"metadata tier fields");
 await writeFile(path,source);
}

{
 const path="app/lib/manual-paper-engine.ts";
 let source=await readFile(path,"utf8");
 source=replaceOnce(source,'export type CloseReason="manual"|"stop"|"target"|"liquidation"|"reversal";\n','export type CloseReason="manual"|"stop"|"target"|"liquidation"|"reversal";\nexport type PaperLiquidationAudit=Readonly<{calculationMethod:"linear-usdt-mark-notional-v2";bankruptcyCalculationMethod:"linear-usdt-zero-equity-v1";collateralBasis:"assigned-margin"|"cross-collateral-snapshot";collateral:number;usableCollateral:number;entryFee:number;maintenanceMarginRate:number;liquidationPenaltyRate:number;maintenanceMarginAtLiquidation:number;liquidationPenaltyReserve:number;estimatedLiquidation:number;bankruptcyPrice:number;liquidationToBankruptcyDistance:number}>;\n',"engine audit type");
 const old=`export function estimateLiquidation(input:{side:PaperSide;entryPrice:number;quantity:number;marginMode:MarginMode;assignedMargin:number;crossCollateral:number;entryFee:number;maintenanceMarginRate?:number;liquidationPenaltyRate?:number}){\n const {side,entryPrice,quantity}=input,collateral=input.marginMode==="isolated"?input.assignedMargin:input.crossCollateral,mmr=input.maintenanceMarginRate??PAPER_RISK_ASSUMPTIONS.maintenanceMarginRate,penalty=input.liquidationPenaltyRate??PAPER_RISK_ASSUMPTIONS.liquidationPenaltyRate;\n if(!valid(entryPrice)||!valid(quantity)||!valid(collateral)||!Number.isFinite(input.entryFee)||input.entryFee<0||!Number.isFinite(mmr)||mmr<0||mmr>=1||!Number.isFinite(penalty)||penalty<0)return NaN;\n const usable=collateral-input.entryFee, direction=side==="long"?1:-1;\n // Equity loss equals collateral less maintenance and the assumed liquidation closing cost.\n const distance=(usable-entryPrice*quantity*(mmr+penalty))/quantity;\n return Math.max(0,entryPrice-direction*distance);\n}\n`;
 const next=`export function auditPaperLiquidation(input:{side:PaperSide;entryPrice:number;quantity:number;marginMode:MarginMode;assignedMargin:number;crossCollateral:number;entryFee:number;maintenanceMarginRate?:number;liquidationPenaltyRate?:number}):PaperLiquidationAudit{\n const {side,entryPrice,quantity}=input,collateral=input.marginMode==="isolated"?input.assignedMargin:input.crossCollateral,mmr=input.maintenanceMarginRate??PAPER_RISK_ASSUMPTIONS.maintenanceMarginRate,penalty=input.liquidationPenaltyRate??PAPER_RISK_ASSUMPTIONS.liquidationPenaltyRate,totalRate=mmr+penalty;\n if(!valid(entryPrice)||!valid(quantity)||!valid(collateral)||!Number.isFinite(input.entryFee)||input.entryFee<0||input.entryFee>=collateral||!Number.isFinite(mmr)||mmr<0||mmr>=1||!Number.isFinite(penalty)||penalty<0||totalRate>=1)throw new Error("INVALID_LIQUIDATION_INPUT");\n const usableCollateral=collateral-input.entryFee,bankruptcyPrice=Math.max(0,side==="long"?entryPrice-usableCollateral/quantity:entryPrice+usableCollateral/quantity),estimatedLiquidation=Math.max(0,side==="long"?(entryPrice*quantity-usableCollateral)/(quantity*(1-totalRate)):(entryPrice*quantity+usableCollateral)/(quantity*(1+totalRate))),maintenanceMarginAtLiquidation=estimatedLiquidation*quantity*mmr,liquidationPenaltyReserve=estimatedLiquidation*quantity*penalty;\n return Object.freeze({calculationMethod:"linear-usdt-mark-notional-v2",bankruptcyCalculationMethod:"linear-usdt-zero-equity-v1",collateralBasis:input.marginMode==="isolated"?"assigned-margin":"cross-collateral-snapshot",collateral,usableCollateral,entryFee:input.entryFee,maintenanceMarginRate:mmr,liquidationPenaltyRate:penalty,maintenanceMarginAtLiquidation,liquidationPenaltyReserve,estimatedLiquidation,bankruptcyPrice,liquidationToBankruptcyDistance:Math.abs(estimatedLiquidation-bankruptcyPrice)});\n}\n\nexport function estimateLiquidation(input:{side:PaperSide;entryPrice:number;quantity:number;marginMode:MarginMode;assignedMargin:number;crossCollateral:number;entryFee:number;maintenanceMarginRate?:number;liquidationPenaltyRate?:number}){try{return auditPaperLiquidation(input).estimatedLiquidation}catch{return NaN}}\n`;
 source=replaceOnce(source,old,next,"engine liquidation audit");
 await writeFile(path,source);
}
