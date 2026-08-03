import {readFile,writeFile} from "node:fs/promises";

const path="app/lib/mexc-contract-metadata.ts";
let source=await readFile(path,"utf8");
const old='  const riskLevelRaw=input.riskLevelLimit==null?undefined:finite(input.riskLevelLimit);\n  if(riskLevelRaw!==undefined&&(!Number.isInteger(riskLevelRaw)||riskLevelRaw<1||riskLevelRaw>1000))throw new Error("Invalid MEXC risk level limit.");';
const next='  const parsedRiskLevel=input.riskLevelLimit==null?null:finite(input.riskLevelLimit);\n  const riskLevelRaw=parsedRiskLevel===null?undefined:parsedRiskLevel;\n  if(riskLevelRaw!==undefined&&(!Number.isInteger(riskLevelRaw)||riskLevelRaw<1||riskLevelRaw>1000))throw new Error("Invalid MEXC risk level limit.");';
if(source.split(old).length-1!==1)throw new Error("risk level null normalisation anchor unavailable");
source=source.replace(old,next);
await writeFile(path,source);
