import "server-only";

import type {
  MexcAccountPosition,
  MexcAccountStateSnapshot,
} from "./mexc-account-state";
import type { MexcPrivateReadResult } from "./mexc-private-readonly";

export const MEXC_ACCOUNT_RISK_CONTEXT_SCHEMA_VERSION =
  "mexc-account-risk-context/1.0.0" as const;

export type MexcAccountRiskSide = "long" | "short";
export type MexcAccountRiskAttentionReason =
  | "missing-risk-context"
  | "leverage-exceeds-provider-limit"
  | "volume-exceeds-provider-limit"
  | "high-adl-level"
  | "system-holding";

export type MexcAccountRiskLimit = Readonly<{
  symbol: string;
  side: MexcAccountRiskSide;
  level: number;
  maxVolume: string;
  maxLeverage: number;
  maintenanceMarginRate: string;
  initialMarginRate: string;
}>;

export type MexcAccountPositionRiskContext = Readonly<{
  positionId: string;
  symbol: string;
  side: MexcAccountRiskSide;
  leverage: number;
  holdVolume: string;
  adlLevel: 1 | 2 | 3 | 4 | 5 | null;
  riskLimit: MexcAccountRiskLimit | null;
  leverageWithinProviderLimit: boolean | null;
  volumeWithinProviderLimit: boolean | null;
  attentionReasons: readonly MexcAccountRiskAttentionReason[];
}>;

export type MexcAccountRiskContextSnapshot = Readonly<{
  schemaVersion: typeof MEXC_ACCOUNT_RISK_CONTEXT_SCHEMA_VERSION;
  provider: "mexc-contract";
  accountKind: "futures";
  observedAtMs: number;
  positions: readonly MexcAccountPositionRiskContext[];
  summary: Readonly<{
    openPositionCount: number;
    coveredPositionCount: number;
    missingRiskContextCount: number;
    attentionPositionCount: number;
    highAdlPositionCount: number;
  }>;
  provenance: Readonly<{
    endpoint: "risk-limits";
    permission: "trade-read";
    requestTimeMs: number;
    receivedAtMs: number;
  }>;
  interpretation: Readonly<{
    informationalOnly: true;
    liquidationOracle: false;
    executionPermission: false;
  }>;
}>;

export class MexcAccountRiskContextError extends Error {
  constructor(
    public readonly kind:
      | "invalid-read-result"
      | "invalid-risk-limit"
      | "duplicate-risk-limit"
      | "invalid-account-snapshot",
    message: string,
  ) {
    super(message);
    this.name = "MexcAccountRiskContextError";
  }
}

const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const decimalPattern = /^(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

function positiveSafeInteger(value: unknown, field: string) {
  const numeric =
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : value;
  if (
    typeof numeric !== "number" ||
    !Number.isSafeInteger(numeric) ||
    numeric <= 0
  ) {
    throw new MexcAccountRiskContextError(
      "invalid-risk-limit",
      `${field} must be a positive safe integer.`,
    );
  }
  return numeric;
}

function safeTimestamp(value: unknown, field: string) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new MexcAccountRiskContextError(
      "invalid-read-result",
      `${field} must be a positive safe-integer timestamp.`,
    );
  }
  return value;
}

function canonicalNonNegativeDecimal(value: unknown, field: string) {
  let source: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new MexcAccountRiskContextError(
        "invalid-risk-limit",
        `${field} must be a finite non-negative decimal.`,
      );
    }
    source = String(value);
  } else if (typeof value === "string") {
    source = value.trim();
  } else {
    throw new MexcAccountRiskContextError(
      "invalid-risk-limit",
      `${field} must be decimal text or a number.`,
    );
  }

  if (!source || source.length > 128) {
    throw new MexcAccountRiskContextError(
      "invalid-risk-limit",
      `${field} has an invalid length.`,
    );
  }
  const match = decimalPattern.exec(source);
  if (!match) {
    throw new MexcAccountRiskContextError(
      "invalid-risk-limit",
      `${field} is not a non-negative decimal.`,
    );
  }

  const integer = match[1];
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? "0");
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) {
    throw new MexcAccountRiskContextError(
      "invalid-risk-limit",
      `${field} exponent is out of range.`,
    );
  }

  const digits = `${integer}${fraction}`;
  const point = integer.length + exponent;
  let expanded: string;
  if (point <= 0) expanded = `0.${"0".repeat(-point)}${digits}`;
  else if (point >= digits.length) {
    expanded = `${digits}${"0".repeat(point - digits.length)}`;
  } else expanded = `${digits.slice(0, point)}.${digits.slice(point)}`;

  const [rawWhole, rawFraction = ""] = expanded.split(".");
  const whole = rawWhole.replace(/^0+(?=\d)/, "") || "0";
  const trimmedFraction = rawFraction.replace(/0+$/, "");
  const canonical = trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
  if (canonical.length > 128) {
    throw new MexcAccountRiskContextError(
      "invalid-risk-limit",
      `${field} expands beyond the supported range.`,
    );
  }
  return canonical;
}

function compareDecimals(left: string, right: string) {
  const [leftWhole, leftFraction = ""] = left.split(".");
  const [rightWhole, rightFraction = ""] = right.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const leftInteger = BigInt(`${leftWhole}${leftFraction.padEnd(scale, "0")}`);
  const rightInteger = BigInt(`${rightWhole}${rightFraction.padEnd(scale, "0")}`);
  return leftInteger < rightInteger ? -1 : leftInteger > rightInteger ? 1 : 0;
}

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MexcAccountRiskContextError(
      "invalid-risk-limit",
      "MEXC risk-limit entry must be an object.",
    );
  }
  return value as Record<string, unknown>;
}

function normaliseRiskLimit(
  value: unknown,
  expectedSymbol: string,
): MexcAccountRiskLimit {
  const source = record(value);
  if (typeof source.symbol !== "string") {
    throw new MexcAccountRiskContextError(
      "invalid-risk-limit",
      "MEXC risk-limit symbol must be text.",
    );
  }
  const symbol = source.symbol.trim().toUpperCase();
  if (!symbolPattern.test(symbol) || symbol !== expectedSymbol) {
    throw new MexcAccountRiskContextError(
      "invalid-risk-limit",
      "MEXC risk-limit symbol did not match its response bucket.",
    );
  }
  const positionType = positiveSafeInteger(source.positionType, "positionType");
  if (positionType !== 1 && positionType !== 2) {
    throw new MexcAccountRiskContextError(
      "invalid-risk-limit",
      "MEXC risk-limit positionType is unsupported.",
    );
  }
  const maxVolume = canonicalNonNegativeDecimal(source.maxVol, "maxVol");
  if (compareDecimals(maxVolume, "0") <= 0) {
    throw new MexcAccountRiskContextError(
      "invalid-risk-limit",
      "MEXC risk-limit maxVol must be positive.",
    );
  }
  return Object.freeze({
    symbol,
    side: positionType === 1 ? "long" : "short",
    level: positiveSafeInteger(source.level, "level"),
    maxVolume,
    maxLeverage: positiveSafeInteger(source.maxLeverage, "maxLeverage"),
    maintenanceMarginRate: canonicalNonNegativeDecimal(source.mmr, "mmr"),
    initialMarginRate: canonicalNonNegativeDecimal(source.imr, "imr"),
  });
}

function positionKey(symbol: string, side: MexcAccountRiskSide) {
  return `${symbol}:${side}`;
}

function checkedAccountSnapshot(snapshot: MexcAccountStateSnapshot) {
  if (
    snapshot?.provider !== "mexc-contract" ||
    snapshot.accountKind !== "futures" ||
    !Array.isArray(snapshot.positions)
  ) {
    throw new MexcAccountRiskContextError(
      "invalid-account-snapshot",
      "A reviewed MEXC futures account snapshot is required.",
    );
  }
  return snapshot;
}

function contextForPosition(
  position: MexcAccountPosition,
  riskLimit: MexcAccountRiskLimit | null,
): MexcAccountPositionRiskContext {
  const attention: MexcAccountRiskAttentionReason[] = [];
  let leverageWithinProviderLimit: boolean | null = null;
  let volumeWithinProviderLimit: boolean | null = null;

  if (!riskLimit) attention.push("missing-risk-context");
  else {
    leverageWithinProviderLimit = position.leverage <= riskLimit.maxLeverage;
    volumeWithinProviderLimit =
      compareDecimals(position.holdVolume.replace(/^\+/, ""), riskLimit.maxVolume) <= 0;
    if (!leverageWithinProviderLimit) {
      attention.push("leverage-exceeds-provider-limit");
    }
    if (!volumeWithinProviderLimit) attention.push("volume-exceeds-provider-limit");
  }
  if (position.adlLevel !== null && position.adlLevel >= 4) {
    attention.push("high-adl-level");
  }
  if (position.state === "system-holding") attention.push("system-holding");

  return Object.freeze({
    positionId: position.positionId,
    symbol: position.symbol,
    side: position.side,
    leverage: position.leverage,
    holdVolume: position.holdVolume,
    adlLevel: position.adlLevel,
    riskLimit,
    leverageWithinProviderLimit,
    volumeWithinProviderLimit,
    attentionReasons: Object.freeze(attention),
  });
}

export function buildMexcAccountRiskContext(input: Readonly<{
  accountSnapshot: MexcAccountStateSnapshot;
  read: MexcPrivateReadResult<unknown>;
}>): MexcAccountRiskContextSnapshot {
  const accountSnapshot = checkedAccountSnapshot(input.accountSnapshot);
  const read = input.read;
  if (read.endpoint !== "risk-limits" || read.permission !== "trade-read") {
    throw new MexcAccountRiskContextError(
      "invalid-read-result",
      "MEXC risk context requires the reviewed risk-limits Trade-read result.",
    );
  }
  const requestTimeMs = safeTimestamp(read.requestTimeMs, "requestTimeMs");
  const receivedAtMs = safeTimestamp(read.receivedAtMs, "receivedAtMs");
  if (receivedAtMs < requestTimeMs) {
    throw new MexcAccountRiskContextError(
      "invalid-read-result",
      "MEXC risk-limit receipt cannot predate its request.",
    );
  }
  if (!read.data || typeof read.data !== "object" || Array.isArray(read.data)) {
    throw new MexcAccountRiskContextError(
      "invalid-read-result",
      "MEXC all-symbol risk-limit data must be an object.",
    );
  }

  const buckets = Object.entries(read.data as Record<string, unknown>);
  if (buckets.length > 10_000) {
    throw new MexcAccountRiskContextError(
      "invalid-read-result",
      "MEXC risk-limit response exceeded the supported symbol count.",
    );
  }
  const limits = new Map<string, MexcAccountRiskLimit>();
  for (const [rawSymbol, value] of buckets) {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbolPattern.test(symbol) || !Array.isArray(value) || value.length > 20) {
      throw new MexcAccountRiskContextError(
        "invalid-risk-limit",
        "MEXC risk-limit bucket is malformed.",
      );
    }
    for (const item of value) {
      const limit = normaliseRiskLimit(item, symbol);
      const key = positionKey(limit.symbol, limit.side);
      if (limits.has(key)) {
        throw new MexcAccountRiskContextError(
          "duplicate-risk-limit",
          `Duplicate MEXC risk-limit identity: ${key}.`,
        );
      }
      limits.set(key, limit);
    }
  }

  const positions = Object.freeze(
    [...accountSnapshot.positions]
      .sort((left, right) =>
        left.symbol.localeCompare(right.symbol) ||
        left.side.localeCompare(right.side) ||
        left.positionId.localeCompare(right.positionId),
      )
      .map((position) =>
        contextForPosition(
          position,
          limits.get(positionKey(position.symbol, position.side)) ?? null,
        ),
      ),
  );

  return Object.freeze({
    schemaVersion: MEXC_ACCOUNT_RISK_CONTEXT_SCHEMA_VERSION,
    provider: "mexc-contract" as const,
    accountKind: "futures" as const,
    observedAtMs: receivedAtMs,
    positions,
    summary: Object.freeze({
      openPositionCount: positions.length,
      coveredPositionCount: positions.filter((position) => position.riskLimit).length,
      missingRiskContextCount: positions.filter((position) => !position.riskLimit).length,
      attentionPositionCount: positions.filter(
        (position) => position.attentionReasons.length > 0,
      ).length,
      highAdlPositionCount: positions.filter(
        (position) => position.adlLevel !== null && position.adlLevel >= 4,
      ).length,
    }),
    provenance: Object.freeze({
      endpoint: "risk-limits" as const,
      permission: "trade-read" as const,
      requestTimeMs,
      receivedAtMs,
    }),
    interpretation: Object.freeze({
      informationalOnly: true as const,
      liquidationOracle: false as const,
      executionPermission: false as const,
    }),
  });
}
