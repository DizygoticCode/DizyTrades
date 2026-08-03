import "server-only";

export const MEXC_ACCOUNT_STATE_SCHEMA_VERSION =
  "mexc-account-state/1.0.0" as const;

export type MexcAccountDecimal = string & {
  readonly __mexcAccountDecimal: unique symbol;
};

export type MexcAccountAsset = Readonly<{
  currency: string;
  positionMargin: MexcAccountDecimal;
  frozenBalance: MexcAccountDecimal;
  availableBalance: MexcAccountDecimal;
  cashBalance: MexcAccountDecimal;
  equity: MexcAccountDecimal;
  unrealizedPnl: MexcAccountDecimal;
  bonusBalance: MexcAccountDecimal | null;
}>;

export type MexcAccountPositionSide = "long" | "short";
export type MexcAccountMarginMode = "isolated" | "cross";
export type MexcAccountPositionState = "holding" | "system-holding";

export type MexcAccountPosition = Readonly<{
  positionId: string;
  symbol: string;
  side: MexcAccountPositionSide;
  marginMode: MexcAccountMarginMode;
  state: MexcAccountPositionState;
  holdVolume: MexcAccountDecimal;
  frozenVolume: MexcAccountDecimal;
  closeVolume: MexcAccountDecimal;
  holdAveragePrice: MexcAccountDecimal;
  openAveragePrice: MexcAccountDecimal;
  closeAveragePrice: MexcAccountDecimal;
  liquidationPrice: MexcAccountDecimal;
  originalInitialMargin: MexcAccountDecimal;
  initialMargin: MexcAccountDecimal;
  holdingFee: MexcAccountDecimal;
  realisedPnl: MexcAccountDecimal;
  adlLevel: 1 | 2 | 3 | 4 | 5 | null;
  leverage: number;
  autoAddMargin: boolean;
  createdAtMs: number | null;
  updatedAtMs: number | null;
}>;

export type MexcAccountStateReadEndpoint = "all-assets" | "open-positions";

export type MexcAccountStateReadRequest = Readonly<{
  endpoint: MexcAccountStateReadEndpoint;
}>;

export type MexcAccountStateReadResult = Readonly<{
  endpoint: MexcAccountStateReadEndpoint;
  permission: "trade-read";
  requestTimeMs: number;
  receivedAtMs: number;
  data: unknown;
}>;

export type MexcAccountStateReader = (
  request: MexcAccountStateReadRequest,
) => Promise<MexcAccountStateReadResult>;

export type MexcAccountStateSnapshot = Readonly<{
  schemaVersion: typeof MEXC_ACCOUNT_STATE_SCHEMA_VERSION;
  provider: "mexc-contract";
  accountKind: "futures";
  observedAtMs: number;
  assets: readonly MexcAccountAsset[];
  positions: readonly MexcAccountPosition[];
  summary: Readonly<{
    assetCount: number;
    openPositionCount: number;
    currencies: readonly string[];
    symbols: readonly string[];
  }>;
  provenance: Readonly<{
    reads: readonly Readonly<{
      endpoint: MexcAccountStateReadEndpoint;
      permission: "trade-read";
      requestTimeMs: number;
      receivedAtMs: number;
    }>[];
  }>;
}>;

export class MexcAccountStateError extends Error {
  constructor(
    public readonly kind:
      | "invalid-asset"
      | "invalid-position"
      | "duplicate-identity"
      | "invalid-read-result",
    message: string,
  ) {
    super(message);
    this.name = "MexcAccountStateError";
  }
}

const currencyPattern = /^[A-Z0-9]{1,20}$/;
const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const decimalPattern = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;
const unsignedIntegerPattern = /^\d+$/;

function accountRecord(
  value: unknown,
  kind: "invalid-asset" | "invalid-position",
  label: string,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MexcAccountStateError(kind, `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  kind: "invalid-asset" | "invalid-position",
) {
  const value = record[key];
  if (value === undefined || value === null || value === "") {
    throw new MexcAccountStateError(kind, `${key} is required.`);
  }
  return value;
}

function canonicalDecimal(
  value: unknown,
  kind: "invalid-asset" | "invalid-position",
  field: string,
): MexcAccountDecimal {
  let source: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new MexcAccountStateError(kind, `${field} must be finite.`);
    }
    source = String(value);
  } else if (typeof value === "string") {
    source = value.trim();
  } else {
    throw new MexcAccountStateError(kind, `${field} must be decimal text or a number.`);
  }

  if (source.length === 0 || source.length > 128) {
    throw new MexcAccountStateError(kind, `${field} has an invalid length.`);
  }
  const match = decimalPattern.exec(source);
  if (!match) {
    throw new MexcAccountStateError(kind, `${field} is not a valid decimal.`);
  }

  const sign = match[1] === "-" ? "-" : "";
  const integer = match[2];
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? "0");
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) {
    throw new MexcAccountStateError(kind, `${field} exponent is out of range.`);
  }

  const digits = `${integer}${fraction}`;
  const point = integer.length + exponent;
  let expanded: string;
  if (point <= 0) {
    expanded = `0.${"0".repeat(-point)}${digits}`;
  } else if (point >= digits.length) {
    expanded = `${digits}${"0".repeat(point - digits.length)}`;
  } else {
    expanded = `${digits.slice(0, point)}.${digits.slice(point)}`;
  }

  const [rawWhole, rawFraction = ""] = expanded.split(".");
  const whole = rawWhole.replace(/^0+(?=\d)/, "") || "0";
  const trimmedFraction = rawFraction.replace(/0+$/, "");
  const unsigned = trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : whole;
  const canonical = /^0(?:\.0*)?$/.test(unsigned) ? "0" : `${sign}${unsigned}`;
  if (canonical.length > 128) {
    throw new MexcAccountStateError(kind, `${field} expands beyond the supported range.`);
  }
  return canonical as MexcAccountDecimal;
}

function accountIdentity(
  value: unknown,
  kind: "invalid-position",
  field: string,
) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new MexcAccountStateError(
        kind,
        `${field} must be a safe non-negative integer or integer text.`,
      );
    }
    return String(value);
  }
  if (typeof value !== "string") {
    throw new MexcAccountStateError(kind, `${field} must be integer text.`);
  }
  const text = value.trim();
  if (!unsignedIntegerPattern.test(text) || text.length > 40) {
    throw new MexcAccountStateError(kind, `${field} is invalid.`);
  }
  return text.replace(/^0+(?=\d)/, "");
}

function boundedTimestamp(
  value: unknown,
  field: string,
): number | null {
  if (value === undefined || value === null || value === "") return null;
  const numeric = typeof value === "string" && unsignedIntegerPattern.test(value.trim())
    ? Number(value.trim())
    : value;
  if (
    typeof numeric !== "number" ||
    !Number.isSafeInteger(numeric) ||
    numeric <= 0
  ) {
    throw new MexcAccountStateError(
      "invalid-position",
      `${field} must be a positive millisecond timestamp.`,
    );
  }
  return numeric;
}

function enumInteger(
  value: unknown,
  field: string,
  allowed: readonly number[],
) {
  const numeric = typeof value === "string" && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : value;
  if (
    typeof numeric !== "number" ||
    !Number.isSafeInteger(numeric) ||
    !allowed.includes(numeric)
  ) {
    throw new MexcAccountStateError(
      "invalid-position",
      `${field} is outside the supported MEXC enum.`,
    );
  }
  return numeric;
}

function optionalBoolean(value: unknown, field: string) {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") {
    throw new MexcAccountStateError(
      "invalid-position",
      `${field} must be boolean when present.`,
    );
  }
  return value;
}

function normaliseAsset(value: unknown): MexcAccountAsset {
  const record = accountRecord(value, "invalid-asset", "MEXC asset");
  const currencyValue = requiredField(record, "currency", "invalid-asset");
  if (typeof currencyValue !== "string") {
    throw new MexcAccountStateError("invalid-asset", "currency must be text.");
  }
  const currency = currencyValue.trim().toUpperCase();
  if (!currencyPattern.test(currency)) {
    throw new MexcAccountStateError("invalid-asset", "currency is invalid.");
  }

  return Object.freeze({
    currency,
    positionMargin: canonicalDecimal(
      requiredField(record, "positionMargin", "invalid-asset"),
      "invalid-asset",
      "positionMargin",
    ),
    frozenBalance: canonicalDecimal(
      requiredField(record, "frozenBalance", "invalid-asset"),
      "invalid-asset",
      "frozenBalance",
    ),
    availableBalance: canonicalDecimal(
      requiredField(record, "availableBalance", "invalid-asset"),
      "invalid-asset",
      "availableBalance",
    ),
    cashBalance: canonicalDecimal(
      requiredField(record, "cashBalance", "invalid-asset"),
      "invalid-asset",
      "cashBalance",
    ),
    equity: canonicalDecimal(
      requiredField(record, "equity", "invalid-asset"),
      "invalid-asset",
      "equity",
    ),
    unrealizedPnl: canonicalDecimal(
      requiredField(record, "unrealized", "invalid-asset"),
      "invalid-asset",
      "unrealized",
    ),
    bonusBalance:
      record.bonus === undefined || record.bonus === null
        ? null
        : canonicalDecimal(record.bonus, "invalid-asset", "bonus"),
  });
}

function normalisePosition(value: unknown): MexcAccountPosition {
  const record = accountRecord(value, "invalid-position", "MEXC position");
  const symbolValue = requiredField(record, "symbol", "invalid-position");
  if (typeof symbolValue !== "string") {
    throw new MexcAccountStateError("invalid-position", "symbol must be text.");
  }
  const symbol = symbolValue.trim().toUpperCase();
  if (!symbolPattern.test(symbol)) {
    throw new MexcAccountStateError("invalid-position", "symbol is invalid.");
  }

  const positionType = enumInteger(
    requiredField(record, "positionType", "invalid-position"),
    "positionType",
    [1, 2],
  );
  const openType = enumInteger(
    requiredField(record, "openType", "invalid-position"),
    "openType",
    [1, 2],
  );
  const state = enumInteger(
    requiredField(record, "state", "invalid-position"),
    "state",
    [1, 2],
  );
  const leverage = enumInteger(
    requiredField(record, "leverage", "invalid-position"),
    "leverage",
    Array.from({ length: 1000 }, (_, index) => index + 1),
  );
  const adlLevel =
    record.adlLevel === undefined || record.adlLevel === null || record.adlLevel === ""
      ? null
      : (enumInteger(record.adlLevel, "adlLevel", [1, 2, 3, 4, 5]) as
          | 1
          | 2
          | 3
          | 4
          | 5);
  const createdAtMs = boundedTimestamp(record.createTime, "createTime");
  const updatedAtMs = boundedTimestamp(record.updateTime, "updateTime");
  if (
    createdAtMs !== null &&
    updatedAtMs !== null &&
    updatedAtMs < createdAtMs
  ) {
    throw new MexcAccountStateError(
      "invalid-position",
      "updateTime cannot be earlier than createTime.",
    );
  }

  return Object.freeze({
    positionId: accountIdentity(
      requiredField(record, "positionId", "invalid-position"),
      "invalid-position",
      "positionId",
    ),
    symbol,
    side: positionType === 1 ? "long" : "short",
    marginMode: openType === 1 ? "isolated" : "cross",
    state: state === 1 ? "holding" : "system-holding",
    holdVolume: canonicalDecimal(
      requiredField(record, "holdVol", "invalid-position"),
      "invalid-position",
      "holdVol",
    ),
    frozenVolume: canonicalDecimal(
      requiredField(record, "frozenVol", "invalid-position"),
      "invalid-position",
      "frozenVol",
    ),
    closeVolume: canonicalDecimal(
      requiredField(record, "closeVol", "invalid-position"),
      "invalid-position",
      "closeVol",
    ),
    holdAveragePrice: canonicalDecimal(
      requiredField(record, "holdAvgPrice", "invalid-position"),
      "invalid-position",
      "holdAvgPrice",
    ),
    openAveragePrice: canonicalDecimal(
      requiredField(record, "openAvgPrice", "invalid-position"),
      "invalid-position",
      "openAvgPrice",
    ),
    closeAveragePrice: canonicalDecimal(
      requiredField(record, "closeAvgPrice", "invalid-position"),
      "invalid-position",
      "closeAvgPrice",
    ),
    liquidationPrice: canonicalDecimal(
      requiredField(record, "liquidatePrice", "invalid-position"),
      "invalid-position",
      "liquidatePrice",
    ),
    originalInitialMargin: canonicalDecimal(
      requiredField(record, "oim", "invalid-position"),
      "invalid-position",
      "oim",
    ),
    initialMargin: canonicalDecimal(
      requiredField(record, "im", "invalid-position"),
      "invalid-position",
      "im",
    ),
    holdingFee: canonicalDecimal(
      requiredField(record, "holdFee", "invalid-position"),
      "invalid-position",
      "holdFee",
    ),
    realisedPnl: canonicalDecimal(
      requiredField(record, "realised", "invalid-position"),
      "invalid-position",
      "realised",
    ),
    adlLevel,
    leverage,
    autoAddMargin: optionalBoolean(record.autoAddIm, "autoAddIm"),
    createdAtMs,
    updatedAtMs,
  });
}

function payloadArray(
  value: unknown,
  kind: "invalid-asset" | "invalid-position",
  label: string,
) {
  if (!Array.isArray(value)) {
    throw new MexcAccountStateError(kind, `${label} must be an array.`);
  }
  if (value.length > 10_000) {
    throw new MexcAccountStateError(kind, `${label} exceeds the supported item count.`);
  }
  return value;
}

function readMetadata(
  value: MexcAccountStateReadResult,
  expectedEndpoint: MexcAccountStateReadEndpoint,
) {
  if (
    value.endpoint !== expectedEndpoint ||
    value.permission !== "trade-read" ||
    !Number.isSafeInteger(value.requestTimeMs) ||
    value.requestTimeMs <= 0 ||
    !Number.isSafeInteger(value.receivedAtMs) ||
    value.receivedAtMs <= 0 ||
    value.receivedAtMs < value.requestTimeMs
  ) {
    throw new MexcAccountStateError(
      "invalid-read-result",
      `MEXC ${expectedEndpoint} read metadata is invalid or mismatched.`,
    );
  }
  return Object.freeze({
    endpoint: value.endpoint,
    permission: value.permission,
    requestTimeMs: value.requestTimeMs,
    receivedAtMs: value.receivedAtMs,
  });
}

export function buildMexcAccountStateSnapshot(input: Readonly<{
  assets: unknown;
  positions: unknown;
  reads: readonly MexcAccountStateReadResult[];
}>): MexcAccountStateSnapshot {
  const assets = payloadArray(input.assets, "invalid-asset", "MEXC assets")
    .map(normaliseAsset)
    .sort((left, right) => left.currency.localeCompare(right.currency));
  const positions = payloadArray(
    input.positions,
    "invalid-position",
    "MEXC positions",
  )
    .map(normalisePosition)
    .sort(
      (left, right) =>
        left.symbol.localeCompare(right.symbol) ||
        left.side.localeCompare(right.side) ||
        left.positionId.localeCompare(right.positionId),
    );

  const assetIdentities = new Set<string>();
  for (const asset of assets) {
    if (assetIdentities.has(asset.currency)) {
      throw new MexcAccountStateError(
        "duplicate-identity",
        `Duplicate MEXC asset currency: ${asset.currency}.`,
      );
    }
    assetIdentities.add(asset.currency);
  }
  const positionIdentities = new Set<string>();
  for (const position of positions) {
    if (positionIdentities.has(position.positionId)) {
      throw new MexcAccountStateError(
        "duplicate-identity",
        `Duplicate MEXC position ID: ${position.positionId}.`,
      );
    }
    positionIdentities.add(position.positionId);
  }

  const reads = input.reads.map((read) =>
    readMetadata(read, read.endpoint),
  );
  if (reads.length !== 2) {
    throw new MexcAccountStateError(
      "invalid-read-result",
      "A MEXC account snapshot requires exactly two reads.",
    );
  }
  const endpointSet = new Set(reads.map((read) => read.endpoint));
  if (!endpointSet.has("all-assets") || !endpointSet.has("open-positions")) {
    throw new MexcAccountStateError(
      "invalid-read-result",
      "A MEXC account snapshot requires assets and open positions.",
    );
  }
  const observedAtMs = Math.max(...reads.map((read) => read.receivedAtMs));

  return Object.freeze({
    schemaVersion: MEXC_ACCOUNT_STATE_SCHEMA_VERSION,
    provider: "mexc-contract",
    accountKind: "futures",
    observedAtMs,
    assets: Object.freeze(assets),
    positions: Object.freeze(positions),
    summary: Object.freeze({
      assetCount: assets.length,
      openPositionCount: positions.length,
      currencies: Object.freeze(assets.map((asset) => asset.currency)),
      symbols: Object.freeze(
        [...new Set(positions.map((position) => position.symbol))].sort(),
      ),
    }),
    provenance: Object.freeze({ reads: Object.freeze(reads) }),
  });
}

export async function ingestMexcAccountState(
  reader: MexcAccountStateReader,
): Promise<MexcAccountStateSnapshot> {
  const [assetsResult, positionsResult] = await Promise.all([
    reader(Object.freeze({ endpoint: "all-assets" })),
    reader(Object.freeze({ endpoint: "open-positions" })),
  ]);

  const assetsRead = readMetadata(assetsResult, "all-assets");
  const positionsRead = readMetadata(positionsResult, "open-positions");
  return buildMexcAccountStateSnapshot({
    assets: assetsResult.data,
    positions: positionsResult.data,
    reads: [
      Object.freeze({ ...assetsRead, data: assetsResult.data }),
      Object.freeze({ ...positionsRead, data: positionsResult.data }),
    ],
  });
}
