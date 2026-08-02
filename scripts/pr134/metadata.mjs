import { replace, write } from './utils.mjs';

const metadataModule = `export type MexcContractMetadata = {
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
};

const finite = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const positive = (value: unknown, field: string) => {
  const parsed = finite(value);
  if (parsed === null || parsed <= 0) throw new Error(\`Invalid MEXC contract \${field}.\`);
  return parsed;
};
const nonNegative = (value: unknown, field: string) => {
  const parsed = finite(value);
  if (parsed === null || parsed < 0) throw new Error(\`Invalid MEXC contract \${field}.\`);
  return parsed;
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
    volUnit: positive(input.volUnit, "volume unit"),
    minVol: positive(input.minVol, "minimum volume"),
    maxVol: positive(input.maxVol, "maximum volume"),
    makerFeeRate: nonNegative(input.makerFeeRate, "maker fee"),
    takerFeeRate: nonNegative(input.takerFeeRate, "taker fee"),
    maintenanceMarginRate: nonNegative(input.maintenanceMarginRate, "maintenance margin"),
    initialMarginRate: nonNegative(input.initialMarginRate, "initial margin"),
    positionOpenType: openType,
    riskLimitType,
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
`;

await write('app/lib/mexc-contract-metadata.ts', metadataModule);
await replace(
  'app/lib/manual-paper-engine.ts',
  'export function sizePaperPosition(input:{mode:PaperSizeMode;amount:number;leverage:number;equity:number;price:number;side:PaperSide;stopLoss?:number|null}){\n const {amount,leverage,equity,price}=input;if(!valid(amount)||!valid(leverage)||leverage>20||!valid(equity)||!valid(price))throw new Error("INVALID_SIZING");',
  'export function sizePaperPosition(input:{mode:PaperSizeMode;amount:number;leverage:number;equity:number;price:number;side:PaperSide;stopLoss?:number|null;maxLeverage?:number}){\n const {amount,leverage,equity,price}=input,maxLeverage=input.maxLeverage??20;if(!valid(amount)||!valid(leverage)||!valid(maxLeverage)||leverage>maxLeverage||!valid(equity)||!valid(price))throw new Error("INVALID_SIZING");',
);
