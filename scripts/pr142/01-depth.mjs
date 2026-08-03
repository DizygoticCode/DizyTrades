import {readFile,writeFile} from "node:fs/promises";
const path="app/lib/manual-paper-depth.ts",source=await readFile(path,"utf8");
const replace=(value,oldText,newText,label)=>{const count=value.split(oldText).length-1;if(count!==1)throw new Error(label+": "+count);return value.replace(oldText,newText)};
let next=replace(source,"  availableContractVolume: number;\n  openPositionContractVolume?: number;","  availableContractVolume: number;\n  priorConsumedContractVolume?: number;\n  openPositionContractVolume?: number;","evidence field");
next=replace(next,"  minimumRemainingContractVolume?: number;\n  referencePrice: number;","  minimumRemainingContractVolume?: number;\n  priorConsumedContractVolume?: number;\n  referencePrice: number;","input field");
next=replace(next,`  const levels = sortedLevels(side, opening, depth).map((level) => {
    positive(level.price, "INVALID_DEPTH_LEVEL");
    nonNegative(level.contractQuantity, "INVALID_DEPTH_LEVEL");
    return {
      price: level.price,
      volume: quantizeMexcStep(level.contractQuantity, contract.volUnit, "floor"),
    };
  });
  const availableContractVolume = quantizeMexcStep(
    levels.reduce((sum, level) => sum + level.volume, 0),
    contract.volUnit,
    "floor",
  );`,`  const priorConsumedContractVolume = input.priorConsumedContractVolume === undefined
    ? 0
    : quantizeMexcStep(
        nonNegative(input.priorConsumedContractVolume, "INVALID_PRIOR_DEPTH_CONSUMPTION"),
        contract.volUnit,
        "floor",
      );
  let skipRemaining = priorConsumedContractVolume;
  const levels = sortedLevels(side, opening, depth).map((level) => {
    positive(level.price, "INVALID_DEPTH_LEVEL");
    nonNegative(level.contractQuantity, "INVALID_DEPTH_LEVEL");
    const originalVolume = quantizeMexcStep(level.contractQuantity, contract.volUnit, "floor");
    const skipped = quantizeMexcStep(Math.min(skipRemaining, originalVolume), contract.volUnit, "floor");
    skipRemaining = Number((skipRemaining - skipped).toPrecision(15));
    return {price:level.price,volume:quantizeMexcStep(Math.max(0,originalVolume-skipped),contract.volUnit,"floor")};
  });
  if (skipRemaining > contract.volUnit * 1e-9)
    throw new Error("DEPTH_PRIOR_CONSUMPTION_EXCEEDS_BOOK");
  const availableContractVolume = quantizeMexcStep(
    levels.reduce((sum, level) => sum + level.volume, 0),
    contract.volUnit,
    "floor",
  );`,"sequential levels");
next=replace(next,"    availableContractVolume,\n    ...(openContractVolume === undefined ? {} : { openPositionContractVolume: openContractVolume }),","    availableContractVolume,\n    ...(priorConsumedContractVolume > 0 ? { priorConsumedContractVolume } : {}),\n    ...(openContractVolume === undefined ? {} : { openPositionContractVolume: openContractVolume }),","evidence output");
await writeFile(path,next);
