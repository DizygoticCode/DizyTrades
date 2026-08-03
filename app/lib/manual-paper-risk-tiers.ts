import type {MexcContractMetadata} from "./mexc-contract-metadata";

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
