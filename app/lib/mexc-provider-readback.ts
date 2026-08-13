import "server-only";

import {
  MEXC_FUTURES_PRIVATE_BASE_URL,
  MEXC_PRIVATE_REQUEST_TIMEOUT_MS,
  MEXC_PRIVATE_RESPONSE_MAX_BYTES,
  MexcPrivateReadOnlyError,
  classifyMexcPrivateFailure,
  signMexcPrivateReadRequest,
} from "./mexc-private-readonly";
import { requireMexcReadOnlyCredentials } from "./mexc-readonly-credential-activation";

export const MEXC_PROVIDER_READBACK_VERSION = "mexc-provider-readback/1.0.0" as const;
export const MEXC_PROVIDER_READBACK_MAX_POSITIONS = 200;
export const MEXC_PROVIDER_READBACK_MAX_AGE_MS = 15_000;

export type MexcProviderReadbackCode =
  | "PROVIDER_DISABLED_OR_UNCONFIGURED" | "CREDENTIAL_ATTESTATION_INVALID"
  | "AUTHENTICATION_REJECTED" | "REQUEST_TIME_INVALID"
  | "PROVIDER_UNAVAILABLE" | "PROVIDER_RATE_LIMITED" | "PROVIDER_FAILURE"
  | "RESPONSE_MALFORMED_OR_OVERSIZED" | "ASSET_DATA_INVALID"
  | "POSITION_DATA_INVALID" | "SYMBOL_INVALID" | "IDENTITY_MISMATCH"
  | "READBACK_STALE_OR_UNAVAILABLE";

export class MexcProviderReadbackError extends Error {
  constructor(public readonly code: MexcProviderReadbackCode, message: string) {
    super(message.slice(0, 180));
    this.name = "MexcProviderReadbackError";
  }
}

export type MexcProviderPosition = Readonly<{
  symbol: string; side: "long" | "short"; contractVolume: number;
  openType?: "isolated" | "cross"; leverage?: number; averageOpenPrice?: number;
  providerPositionId?: string; providerUpdatedAt?: string;
}>;
export type MexcProviderAccountRiskReadback = Readonly<{
  version: typeof MEXC_PROVIDER_READBACK_VERSION; provider: "mexc";
  userId: string; accountId: string; observedAt: string; settlementCurrency: "USDT";
  equity: number; availableMargin: number; positions: readonly MexcProviderPosition[];
  providerRequestId?: string;
  // dayStartEquity is intentionally absent: these reads provide no authoritative baseline.
}>;

type Dependencies = Readonly<{ fetch?: typeof fetch; now?: () => number }>;
type Environment = Readonly<Record<string, string | undefined>>;
const paths = Object.freeze({
  assets: "/api/v1/private/account/assets",
  positions: "/api/v1/private/position/open_positions",
  riskLimits: "/api/v1/private/account/risk_limit",
} as const);

function codeFor(error: unknown): MexcProviderReadbackCode {
  if (error instanceof MexcProviderReadbackError) return error.code;
  if (error instanceof MexcPrivateReadOnlyError) {
    if (error.kind === "authentication" || error.kind.endsWith("permission-required")) return "AUTHENTICATION_REJECTED";
    if (error.kind === "stale-request") return "REQUEST_TIME_INVALID";
    if (error.kind === "rate-limit") return "PROVIDER_RATE_LIMITED";
    if (error.kind === "invalid-response") return "RESPONSE_MALFORMED_OR_OVERSIZED";
    if (error.kind === "timeout") return "PROVIDER_UNAVAILABLE";
  }
  return "PROVIDER_FAILURE";
}

function finite(value: unknown, code: MexcProviderReadbackCode, positive = false) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number) || (positive ? number <= 0 : number < 0))
    throw new MexcProviderReadbackError(code, "MEXC returned an invalid numeric field.");
  return number;
}

async function privateGet(path: (typeof paths)[keyof typeof paths], credentials: Readonly<{apiKey:string;apiSecret:string}>, dependencies: Dependencies) {
  if (!Object.values(paths).includes(path)) throw new MexcProviderReadbackError("PROVIDER_FAILURE", "Private path is not allowlisted.");
  const now = dependencies.now ?? Date.now;
  const requestTimeMs = now();
  const headers = signMexcPrivateReadRequest({ credentials, requestTimeMs, query: "", receiveWindowSeconds: 5 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MEXC_PRIVATE_REQUEST_TIMEOUT_MS);
  try {
    const response = await (dependencies.fetch ?? fetch)(new URL(path, MEXC_FUTURES_PRIVATE_BASE_URL), {
      method: "GET", headers, cache: "no-store", redirect: "error", signal: controller.signal,
    });
    const text = await response.text();
    if (Buffer.byteLength(text) > MEXC_PRIVATE_RESPONSE_MAX_BYTES)
      throw new MexcProviderReadbackError("RESPONSE_MALFORMED_OR_OVERSIZED", "MEXC response exceeded the size bound.");
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new MexcProviderReadbackError("RESPONSE_MALFORMED_OR_OVERSIZED", "MEXC response was not valid JSON."); }
    if (!body || typeof body !== "object") throw new MexcProviderReadbackError("RESPONSE_MALFORMED_OR_OVERSIZED", "MEXC response shape was invalid.");
    const envelope = body as { success?: unknown; code?: unknown; data?: unknown };
    const providerCode = Number(envelope.code);
    if (!response.ok || envelope.success !== true || providerCode !== 0) {
      const kind = Number.isFinite(providerCode) ? classifyMexcPrivateFailure(providerCode) : "invalid-response";
      throw new MexcPrivateReadOnlyError(kind, "MEXC private read was rejected.", Number.isFinite(providerCode) ? providerCode : null);
    }
    return Object.freeze({ data: envelope.data, observedAtMs: now(), requestId: response.headers.get("x-request-id") });
  } catch (error) {
    if (error instanceof MexcProviderReadbackError || error instanceof MexcPrivateReadOnlyError) throw error;
    throw new MexcProviderReadbackError(error instanceof DOMException && error.name === "AbortError" ? "PROVIDER_UNAVAILABLE" : "PROVIDER_FAILURE", "MEXC private read was unavailable.");
  } finally { clearTimeout(timer); }
}

/** The only production network operations: three fixed-path, internally fixed-GET reads. */
export const createMexcProviderReadTransport = (credentials: Readonly<{apiKey:string;apiSecret:string}>, dependencies: Dependencies = {}) => Object.freeze({
  readAssets: () => privateGet(paths.assets, credentials, dependencies),
  readOpenPositions: () => privateGet(paths.positions, credentials, dependencies),
  readRiskLimits: () => privateGet(paths.riskLimits, credentials, dependencies),
});

function normalizeAssets(data: unknown) {
  if (!Array.isArray(data) || data.length > 100) throw new MexcProviderReadbackError("ASSET_DATA_INVALID", "MEXC asset data was missing or invalid.");
  const matches = data.filter((item) => item && typeof item === "object" && (item as {currency?:unknown}).currency === "USDT");
  if (matches.length !== 1) throw new MexcProviderReadbackError("ASSET_DATA_INVALID", "MEXC must return exactly one USDT asset.");
  const asset = matches[0] as { equity?:unknown; availableBalance?:unknown };
  const equity = finite(asset.equity, "ASSET_DATA_INVALID", true);
  const availableMargin = finite(asset.availableBalance, "ASSET_DATA_INVALID");
  if (availableMargin > equity * 2) throw new MexcProviderReadbackError("ASSET_DATA_INVALID", "MEXC available balance was impossible.");
  return { equity, availableMargin };
}

const symbolPattern = /^[A-Z0-9]{1,20}_USDT$/;
function normalizePositions(data: unknown): readonly MexcProviderPosition[] {
  if (!Array.isArray(data) || data.length > MEXC_PROVIDER_READBACK_MAX_POSITIONS) throw new MexcProviderReadbackError("POSITION_DATA_INVALID", "MEXC position data was missing or too large.");
  const seen = new Set<string>();
  return Object.freeze(data.map((raw) => {
    if (!raw || typeof raw !== "object") throw new MexcProviderReadbackError("POSITION_DATA_INVALID", "MEXC position entry was invalid.");
    const item = raw as Record<string, unknown>;
    if (typeof item.symbol !== "string" || !symbolPattern.test(item.symbol)) throw new MexcProviderReadbackError("SYMBOL_INVALID", "MEXC position symbol was unsupported.");
    const side = item.positionType === 1 || item.positionType === "1" ? "long" : item.positionType === 2 || item.positionType === "2" ? "short" : null;
    if (!side) throw new MexcProviderReadbackError("POSITION_DATA_INVALID", "MEXC position side was invalid.");
    const key = `${item.symbol}:${side}`;
    if (seen.has(key)) throw new MexcProviderReadbackError("POSITION_DATA_INVALID", "MEXC returned ambiguous duplicate positions.");
    seen.add(key);
    const position: Record<string, unknown> = { symbol: item.symbol, side, contractVolume: finite(item.holdVol, "POSITION_DATA_INVALID") };
    if (item.openType !== undefined) {
      if (item.openType !== 1 && item.openType !== "1" && item.openType !== 2 && item.openType !== "2") throw new MexcProviderReadbackError("POSITION_DATA_INVALID", "MEXC open type was invalid.");
      position.openType = item.openType === 1 || item.openType === "1" ? "isolated" : "cross";
    }
    if (item.leverage !== undefined) position.leverage = finite(item.leverage, "POSITION_DATA_INVALID", true);
    if (item.openAvgPrice !== undefined) position.averageOpenPrice = finite(item.openAvgPrice, "POSITION_DATA_INVALID", true);
    if (item.positionId !== undefined) {
      const id = String(item.positionId);
      if (!/^[\w.-]{1,80}$/.test(id)) throw new MexcProviderReadbackError("POSITION_DATA_INVALID", "MEXC position identifier was invalid.");
      position.providerPositionId = id;
    }
    if (item.updateTime !== undefined) {
      const timestamp = finite(item.updateTime, "POSITION_DATA_INVALID");
      position.providerUpdatedAt = new Date(timestamp).toISOString();
    }
    return Object.freeze(position) as MexcProviderPosition;
  }));
}

export async function readAuthoritativeMexcAccountRisk(input: Readonly<{userId:string;accountId:string;environment?:Environment}>, dependencies: Dependencies = {}): Promise<MexcProviderAccountRiskReadback> {
  if (!input.userId.trim() || !input.accountId.trim() || input.userId.length > 128 || input.accountId.length > 128) throw new MexcProviderReadbackError("IDENTITY_MISMATCH", "Trusted account identity was invalid.");
  let credentials;
  try { credentials = requireMexcReadOnlyCredentials(input.environment ?? process.env); }
  catch (error) {
    const kind = error && typeof error === "object" && "kind" in error ? String(error.kind) : "";
    throw new MexcProviderReadbackError(kind.includes("attestation") ? "CREDENTIAL_ATTESTATION_INVALID" : "PROVIDER_DISABLED_OR_UNCONFIGURED", "MEXC owner read-only configuration is unavailable.");
  }
  const transport = createMexcProviderReadTransport(credentials, dependencies);
  try {
    const [assets, positions] = await Promise.all([transport.readAssets(), transport.readOpenPositions()]);
    const observedAtMs = Math.max(assets.observedAtMs, positions.observedAtMs);
    const now = (dependencies.now ?? Date.now)();
    if (now - observedAtMs < 0 || now - observedAtMs > MEXC_PROVIDER_READBACK_MAX_AGE_MS) throw new MexcProviderReadbackError("READBACK_STALE_OR_UNAVAILABLE", "MEXC readback was stale.");
    const account = normalizeAssets(assets.data);
    return Object.freeze({ version: MEXC_PROVIDER_READBACK_VERSION, provider: "mexc", userId: input.userId, accountId: input.accountId, observedAt: new Date(observedAtMs).toISOString(), settlementCurrency: "USDT", ...account, positions: normalizePositions(positions.data), ...(assets.requestId && /^[\w.-]{1,80}$/.test(assets.requestId) ? {providerRequestId:assets.requestId} : {}) });
  } catch (error) { throw new MexcProviderReadbackError(codeFor(error), "Authoritative MEXC account readback is unavailable."); }
}

export function translateMexcReadback(readback: MexcProviderAccountRiskReadback) {
  return Object.freeze({
    accountState: Object.freeze({ userId: readback.userId, accountId: readback.accountId, observedAt: readback.observedAt, positions: Object.freeze(readback.positions.map((p) => Object.freeze({symbol:p.symbol,side:p.side,quantity:p.contractVolume}))) }),
    riskSnapshot: null,
    riskSnapshotUnavailableReason: "authoritative-day-start-equity-unavailable" as const,
  });
}
