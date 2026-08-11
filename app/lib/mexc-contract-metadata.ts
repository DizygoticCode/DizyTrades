export type MexcContractMetadata = {
  symbol: string;
  displayName: string;
  contractSize: number;
  minLeverage: number;
  maxLeverage: number;
  priceUnit: number;
  volUnit: number;
  minVol: number;
  maxVol: number;
  makerFeeRate: number;
  takerFeeRate: number;
  maintenanceMarginRate: number;
  initialMarginRate: number;
  positionOpenType: 1 | 2 | 3;
  riskLimitType: "BY_VOLUME" | "BY_VALUE" | "UNKNOWN";
  riskBaseVol?: number;
  riskIncrVol?: number;
  riskIncrMmr?: number;
  riskIncrImr?: number;
  riskLevelLimit?: number;
};

export type MexcStepMode = "floor" | "ceil" | "nearest";
export type MexcContractOrderSizing = {
  contractVolume: number;
  contractSize: number;
  quantity: number;
  notional: number;
};

const finite = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const positive = (value: unknown, field: string) => {
  const parsed = finite(value);
  if (parsed === null || parsed <= 0) throw new Error(`Invalid MEXC contract ${field}.`);
  return parsed;
};
const nonNegative = (value: unknown, field: string) => {
  const parsed = finite(value);
  if (parsed === null || parsed < 0) throw new Error(`Invalid MEXC contract ${field}.`);
  return parsed;
};
const optionalPositive = (value: unknown) => {
  if (value == null) return undefined;
  const parsed = finite(value);
  return parsed !== null && parsed > 0 ? parsed : undefined;
};
const optionalNonNegative = (value: unknown) => {
  if (value == null) return undefined;
  const parsed = finite(value);
  return parsed !== null && parsed >= 0 ? parsed : undefined;
};
const optionalRiskLevel = (value: unknown) => {
  const parsed = finite(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000
    ? parsed
    : undefined;
};

export function parseMexcContractMetadata(
  payload: unknown,
  expectedSymbol?: string,
): MexcContractMetadata {
  if (!payload || typeof payload !== "object") throw new Error("Invalid MEXC contract response.");
  const response = payload as { success?: unknown; data?: unknown };
  if (response.success === false) throw new Error("MEXC contract metadata request failed.");
  const entries = Array.isArray(response.data) ? response.data : [response.data];
  const candidate = entries.find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    return !expectedSymbol || (entry as { symbol?: unknown }).symbol === expectedSymbol;
  });
  if (!candidate || typeof candidate !== "object") throw new Error("MEXC contract metadata is unavailable.");
  const input = candidate as Record<string, unknown>;
  const symbol = typeof input.symbol === "string" ? input.symbol : "";
  if (!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol)) throw new Error("Invalid MEXC contract symbol.");
  if (expectedSymbol && symbol !== expectedSymbol) throw new Error("MEXC contract symbol mismatch.");
  const minLeverage = positive(input.minLeverage, "minimum leverage");
  const maxLeverage = positive(input.maxLeverage, "maximum leverage");
  if (maxLeverage < minLeverage || maxLeverage > 1_000) throw new Error("Invalid MEXC leverage range.");
  const openType = finite(input.positionOpenType);
  if (openType !== 1 && openType !== 2 && openType !== 3) throw new Error("Invalid MEXC margin mode support.");
  const riskLimitType = input.riskLimitType === "BY_VOLUME" || input.riskLimitType === "BY_VALUE"
    ? input.riskLimitType
    : "UNKNOWN";
  const volUnit = positive(input.volUnit, "volume unit");
  const minVol = positive(input.minVol, "minimum volume");
  const maxVol = positive(input.maxVol, "maximum volume");
  if (maxVol < minVol) throw new Error("Invalid MEXC contract volume range.");
  return Object.freeze({
    symbol,
    displayName:
      typeof input.displayNameEn === "string" && input.displayNameEn.trim()
        ? input.displayNameEn.trim()
        : symbol,
    contractSize: positive(input.contractSize, "contract size"),
    minLeverage,
    maxLeverage,
    priceUnit: positive(input.priceUnit, "price unit"),
    volUnit,
    minVol,
    maxVol,
    makerFeeRate: nonNegative(input.makerFeeRate, "maker fee"),
    takerFeeRate: nonNegative(input.takerFeeRate, "taker fee"),
    maintenanceMarginRate: nonNegative(input.maintenanceMarginRate, "maintenance margin"),
    initialMarginRate: nonNegative(input.initialMarginRate, "initial margin"),
    positionOpenType: openType,
    riskLimitType,
    riskBaseVol: optionalPositive(input.riskBaseVol),
    riskIncrVol: optionalPositive(input.riskIncrVol),
    riskIncrMmr: optionalNonNegative(input.riskIncrMmr),
    riskIncrImr: optionalNonNegative(input.riskIncrImr),
    riskLevelLimit: optionalRiskLevel(input.riskLevelLimit),
  });
}

const preferredStops = [1, 2, 3, 5, 10, 20, 25, 50, 75, 100, 125, 200, 500, 1_000] as const;

export function leverageStopsForContract(contract: MexcContractMetadata | null) {
  if (!contract) return [1, 2, 3, 5, 10, 20];
  return [...new Set([
    contract.minLeverage,
    ...preferredStops.filter(
      (value) => value >= contract.minLeverage && value <= contract.maxLeverage,
    ),
    contract.maxLeverage,
  ])].sort((a, b) => a - b);
}

export function clampContractLeverage(
  leverage: number,
  contract: MexcContractMetadata,
) {
  if (!Number.isFinite(leverage)) return contract.minLeverage;
  return Math.min(contract.maxLeverage, Math.max(contract.minLeverage, Math.round(leverage)));
}

function decimalPlaces(value: number) {
  const [coefficient, exponentText] = value.toExponential().split("e");
  const fractionDigits = (coefficient.split(".")[1] ?? "").length;
  return Math.max(0, Math.min(12, fractionDigits - Number(exponentText)));
}

export function quantizeMexcStep(
  value: number,
  step: number,
  mode: MexcStepMode = "nearest",
) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0)
    throw new Error("INVALID_MEXC_STEP");
  const ratio = value / step;
  const units = mode === "floor"
    ? Math.floor(ratio + 1e-10)
    : mode === "ceil"
      ? Math.ceil(ratio - 1e-10)
      : Math.round(ratio);
  return Number((units * step).toFixed(decimalPlaces(step)));
}

export function isMexcStepAligned(value: number, step: number) {
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(step) || step <= 0)
    return false;
  const nearest = quantizeMexcStep(value, step, "nearest");
  return Math.abs(value - nearest) <= Math.max(1e-10, step * 1e-9);
}

export function quantizeMexcExecutionPrice(
  price: number,
  priceUnit: number,
  side: "long" | "short",
  opening: boolean,
) {
  const adverseDirection = (side === "long") === opening ? "ceil" : "floor";
  const result = quantizeMexcStep(price, priceUnit, adverseDirection);
  if (result <= 0) throw new Error("INVALID_CONTRACT_PRICE");
  return result;
}

export function sizeMexcContractOrder(
  notional: number,
  executionPrice: number,
  contract: MexcContractMetadata,
): MexcContractOrderSizing {
  if (!Number.isFinite(notional) || notional <= 0 || !Number.isFinite(executionPrice) || executionPrice <= 0)
    throw new Error("INVALID_CONTRACT_NOTIONAL");
  const rawVolume = notional / (executionPrice * contract.contractSize);
  const contractVolume = quantizeMexcStep(rawVolume, contract.volUnit, "floor");
  if (contractVolume < contract.minVol) throw new Error("CONTRACT_VOLUME_BELOW_MINIMUM");
  if (contractVolume > contract.maxVol) throw new Error("CONTRACT_VOLUME_ABOVE_MAXIMUM");
  const quantity = Number((contractVolume * contract.contractSize).toPrecision(15));
  const actualNotional = Number((quantity * executionPrice).toPrecision(15));
  if (quantity <= 0 || actualNotional <= 0) throw new Error("INVALID_CONTRACT_NOTIONAL");
  return Object.freeze({
    contractVolume,
    contractSize: contract.contractSize,
    quantity,
    notional: actualNotional,
  });
}
