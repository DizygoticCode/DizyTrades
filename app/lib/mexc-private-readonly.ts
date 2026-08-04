import "server-only";

import { createHmac } from "node:crypto";
import { MEXC_REST_ORIGIN } from "./market/mexc-shared.ts";

export const MEXC_PRIVATE_READONLY_POLICY_VERSION =
  "mexc-private-readonly/1.1.0" as const;
export const MEXC_PRIVATE_REST_BASE_URL = MEXC_REST_ORIGIN;
/** @deprecated Compatibility alias; private HTTPS reads use api.mexc.com. */
export const MEXC_CONTRACT_PRIVATE_BASE_URL = MEXC_PRIVATE_REST_BASE_URL;
export const MEXC_PRIVATE_RESPONSE_MAX_BYTES = 1_000_000;
export const MEXC_PRIVATE_REQUEST_TIMEOUT_MS = 8_000;

export type MexcPrivateReadPermission = "account-read" | "trade-read";
export type MexcPrivateReadEndpointId =
  | "all-assets"
  | "single-asset"
  | "open-positions"
  | "risk-limits"
  | "tiered-fee-rate";

export type MexcPrivateReadEndpoint = Readonly<{
  id: MexcPrivateReadEndpointId;
  method: "GET";
  path: string;
  permission: MexcPrivateReadPermission;
  requiredParameters: readonly string[];
  optionalParameters: readonly string[];
  description: string;
}>;

export type MexcPrivateReadCredentials = Readonly<{
  apiKey: string;
  apiSecret: string;
}>;

export type MexcPrivateReadRequest = Readonly<{
  endpoint: MexcPrivateReadEndpointId;
  parameters?: Readonly<Record<string, string | number | undefined>>;
  credentials: MexcPrivateReadCredentials;
  requestTimeMs?: number;
  receiveWindowSeconds?: number;
  timeoutMs?: number;
}>;

export type MexcPrivateReadResult<T = unknown> = Readonly<{
  endpoint: MexcPrivateReadEndpointId;
  permission: MexcPrivateReadPermission;
  requestTimeMs: number;
  receivedAtMs: number;
  data: T;
}>;

export type MexcPrivateReadFailureKind =
  | "account-read-permission-required"
  | "trade-read-permission-required"
  | "write-permission-required"
  | "authentication"
  | "ip-whitelist"
  | "rate-limit"
  | "stale-request"
  | "provider"
  | "invalid-response"
  | "timeout";

export class MexcPrivateReadOnlyError extends Error {
  constructor(
    public readonly kind: MexcPrivateReadFailureKind,
    message: string,
    public readonly providerCode: number | null = null,
  ) {
    super(message);
    this.name = "MexcPrivateReadOnlyError";
  }
}

const definitions: Readonly<
  Record<MexcPrivateReadEndpointId, MexcPrivateReadEndpoint>
> = Object.freeze({
  "all-assets": Object.freeze({
    id: "all-assets",
    method: "GET",
    path: "/api/v1/private/account/assets",
    permission: "trade-read",
    requiredParameters: Object.freeze([]),
    optionalParameters: Object.freeze([]),
    description: "All futures account asset balances.",
  }),
  "single-asset": Object.freeze({
    id: "single-asset",
    method: "GET",
    path: "/api/v1/private/account/asset/{currency}",
    permission: "account-read",
    requiredParameters: Object.freeze(["currency"]),
    optionalParameters: Object.freeze([]),
    description: "One futures account currency balance.",
  }),
  "open-positions": Object.freeze({
    id: "open-positions",
    method: "GET",
    path: "/api/v1/private/position/open_positions",
    permission: "trade-read",
    requiredParameters: Object.freeze([]),
    optionalParameters: Object.freeze(["symbol"]),
    description: "Current futures positions, optionally filtered by symbol.",
  }),
  "risk-limits": Object.freeze({
    id: "risk-limits",
    method: "GET",
    path: "/api/v1/private/account/risk_limit",
    permission: "trade-read",
    requiredParameters: Object.freeze([]),
    optionalParameters: Object.freeze(["symbol"]),
    description: "Current futures account risk limits.",
  }),
  "tiered-fee-rate": Object.freeze({
    id: "tiered-fee-rate",
    method: "GET",
    path: "/api/v1/private/account/tiered_fee_rate",
    permission: "trade-read",
    requiredParameters: Object.freeze(["symbol"]),
    optionalParameters: Object.freeze([]),
    description: "Current maker and taker fee rate for one futures symbol.",
  }),
});

export const MEXC_PRIVATE_READ_ENDPOINTS = Object.freeze(
  Object.values(definitions),
);

const endpointIds = new Set<MexcPrivateReadEndpointId>(
  MEXC_PRIVATE_READ_ENDPOINTS.map((endpoint) => endpoint.id),
);
const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const currencyPattern = /^[A-Z0-9]{1,20}$/;
const sensitiveLabelPattern =
  /\b(api[_-]?key|api[_-]?secret|secret|signature|token)\s*[:=]\s*[^\s,;]+/gi;

function boundedProviderMessage(
  value: unknown,
  sensitiveValues: readonly string[] = [],
) {
  if (typeof value !== "string") return "MEXC private read request failed.";
  let normalised = value
    .replaceAll(/[\r\n\t]+/g, " ")
    .replaceAll(sensitiveLabelPattern, "$1=[redacted]")
    .trim();
  for (const sensitive of sensitiveValues) {
    if (sensitive.length >= 4) normalised = normalised.replaceAll(sensitive, "[redacted]");
  }
  return normalised.slice(0, 240) || "MEXC private read request failed.";
}

function validateCredentials(
  credentials: MexcPrivateReadCredentials,
): MexcPrivateReadCredentials {
  if (
    typeof credentials?.apiKey !== "string" ||
    typeof credentials?.apiSecret !== "string" ||
    !credentials.apiKey.trim() ||
    !credentials.apiSecret.trim() ||
    credentials.apiKey.length > 256 ||
    credentials.apiSecret.length > 512
  ) {
    throw new MexcPrivateReadOnlyError(
      "authentication",
      "MEXC read-only credentials are not configured correctly.",
    );
  }
  return credentials;
}

function endpointDefinition(value: unknown): MexcPrivateReadEndpoint {
  if (typeof value !== "string" || !endpointIds.has(value as MexcPrivateReadEndpointId)) {
    throw new MexcPrivateReadOnlyError(
      "provider",
      "MEXC private endpoint is not in the read-only allowlist.",
    );
  }
  return definitions[value as MexcPrivateReadEndpointId];
}

function parameterValue(
  parameters: Readonly<Record<string, string | number | undefined>>,
  key: string,
) {
  const value = parameters[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new MexcPrivateReadOnlyError(
      "provider",
      `Invalid parameter for MEXC read endpoint: ${key}.`,
    );
  }
  const text = String(value);
  if (text.length > 100) {
    throw new MexcPrivateReadOnlyError(
      "provider",
      `MEXC read parameter is too long: ${key}.`,
    );
  }
  return text;
}

export function canonicalMexcPrivateGetParameters(
  parameters: Readonly<Record<string, string | number | undefined>>,
) {
  return Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
}

export function mexcPrivateReadRequestTarget(input: {
  apiKey: string;
  requestTimeMs: number;
  query: string;
}) {
  return `${input.apiKey}${input.requestTimeMs}${input.query}`;
}

export function signMexcPrivateReadRequest(input: {
  credentials: MexcPrivateReadCredentials;
  requestTimeMs: number;
  query: string;
  receiveWindowSeconds?: number;
}) {
  const credentials = validateCredentials(input.credentials);
  if (!Number.isSafeInteger(input.requestTimeMs) || input.requestTimeMs <= 0) {
    throw new MexcPrivateReadOnlyError(
      "stale-request",
      "MEXC request time is invalid.",
    );
  }
  if (
    input.receiveWindowSeconds !== undefined &&
    (!Number.isSafeInteger(input.receiveWindowSeconds) ||
      input.receiveWindowSeconds < 1 ||
      input.receiveWindowSeconds > 60)
  ) {
    throw new MexcPrivateReadOnlyError(
      "stale-request",
      "MEXC receive window must be between 1 and 60 seconds.",
    );
  }
  const target = mexcPrivateReadRequestTarget({
    apiKey: credentials.apiKey,
    requestTimeMs: input.requestTimeMs,
    query: input.query,
  });
  const signature = createHmac("sha256", credentials.apiSecret)
    .update(target)
    .digest("hex");
  const headers: Record<string, string> = {
    ApiKey: credentials.apiKey,
    "Request-Time": String(input.requestTimeMs),
    Signature: signature,
    "Content-Type": "application/json",
  };
  if (input.receiveWindowSeconds !== undefined) {
    headers["Recv-Window"] = String(input.receiveWindowSeconds);
  }
  return Object.freeze(headers);
}

export function buildMexcPrivateReadUrl(input: {
  endpoint: MexcPrivateReadEndpointId;
  parameters?: Readonly<Record<string, string | number | undefined>>;
}) {
  const endpoint = endpointDefinition(input.endpoint);
  const supplied = input.parameters ?? {};
  const allowed = new Set([
    ...endpoint.requiredParameters,
    ...endpoint.optionalParameters,
  ]);
  for (const key of Object.keys(supplied)) {
    if (!allowed.has(key)) {
      throw new MexcPrivateReadOnlyError(
        "provider",
        `Parameter is not allowed for ${endpoint.id}: ${key}.`,
      );
    }
  }
  for (const key of endpoint.requiredParameters) {
    if (parameterValue(supplied, key) === null) {
      throw new MexcPrivateReadOnlyError(
        "provider",
        `Required parameter is missing for ${endpoint.id}: ${key}.`,
      );
    }
  }

  let path = endpoint.path;
  const queryParameters: Record<string, string> = {};
  for (const key of allowed) {
    const value = parameterValue(supplied, key);
    if (value === null) continue;
    if (key === "symbol" && !symbolPattern.test(value)) {
      throw new MexcPrivateReadOnlyError(
        "provider",
        "MEXC futures symbol is invalid.",
      );
    }
    if (key === "currency") {
      if (!currencyPattern.test(value)) {
        throw new MexcPrivateReadOnlyError(
          "provider",
          "MEXC futures currency is invalid.",
        );
      }
      path = path.replace("{currency}", encodeURIComponent(value));
    } else {
      queryParameters[key] = value;
    }
  }
  if (path.includes("{")) {
    throw new MexcPrivateReadOnlyError(
      "provider",
      "MEXC private read path is incomplete.",
    );
  }
  const query = canonicalMexcPrivateGetParameters(queryParameters);
  const url = new URL(path, MEXC_PRIVATE_REST_BASE_URL);
  url.search = query;
  return Object.freeze({ endpoint, url, query });
}

export function classifyMexcPrivateFailure(code: number): MexcPrivateReadFailureKind {
  if (code === 701) return "account-read-permission-required";
  if (code === 703) return "trade-read-permission-required";
  if (code === 702 || code === 704) return "write-permission-required";
  if (code === 401 || code === 402 || code === 602) return "authentication";
  if (code === 406) return "ip-whitelist";
  if (code === 510) return "rate-limit";
  if (code === 513) return "stale-request";
  return "provider";
}

export function mexcPrivateReadCapabilityManifest() {
  return Object.freeze({
    policyVersion: MEXC_PRIVATE_READONLY_POLICY_VERSION,
    baseOrigin: new URL(MEXC_PRIVATE_REST_BASE_URL).origin,
    methods: Object.freeze(["GET"] as const),
    permissions: Object.freeze(
      [...new Set(MEXC_PRIVATE_READ_ENDPOINTS.map((endpoint) => endpoint.permission))].sort(),
    ),
    endpoints: Object.freeze(
      MEXC_PRIVATE_READ_ENDPOINTS.map((endpoint) =>
        Object.freeze({
          id: endpoint.id,
          method: endpoint.method,
          path: endpoint.path,
          permission: endpoint.permission,
        }),
      ),
    ),
    writeCapability: false as const,
  });
}

async function readBoundedJson(response: Response) {
  const text = await response.text();
  if (Buffer.byteLength(text) > MEXC_PRIVATE_RESPONSE_MAX_BYTES) {
    throw new MexcPrivateReadOnlyError(
      "invalid-response",
      "MEXC private response exceeded the configured size limit.",
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MexcPrivateReadOnlyError(
      "invalid-response",
      "MEXC private response was not valid JSON.",
    );
  }
}

export async function requestMexcPrivateRead<T = unknown>(
  input: MexcPrivateReadRequest,
  dependencies: Readonly<{
    fetch?: typeof fetch;
    now?: () => number;
  }> = {},
): Promise<MexcPrivateReadResult<T>> {
  const requestTimeMs = input.requestTimeMs ?? (dependencies.now ?? Date.now)();
  const { endpoint, url, query } = buildMexcPrivateReadUrl(input);
  const headers = signMexcPrivateReadRequest({
    credentials: input.credentials,
    requestTimeMs,
    query,
    receiveWindowSeconds: input.receiveWindowSeconds,
  });
  const timeoutMs = input.timeoutMs ?? MEXC_PRIVATE_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30_000) {
    throw new MexcPrivateReadOnlyError(
      "timeout",
      "MEXC private read timeout is invalid.",
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (dependencies.fetch ?? fetch)(url, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    const body = await readBoundedJson(response);
    if (!body || typeof body !== "object") {
      throw new MexcPrivateReadOnlyError(
        "invalid-response",
        "MEXC private response had an invalid shape.",
      );
    }
    const payload = body as {
      success?: unknown;
      code?: unknown;
      message?: unknown;
      data?: T;
    };
    const code = Number(payload.code);
    if (!response.ok || payload.success !== true || !Number.isFinite(code) || code !== 0) {
      const providerCode = Number.isFinite(code) ? code : null;
      throw new MexcPrivateReadOnlyError(
        providerCode === null
          ? "invalid-response"
          : classifyMexcPrivateFailure(providerCode),
        boundedProviderMessage(payload.message, [
          input.credentials.apiKey,
          input.credentials.apiSecret,
        ]),
        providerCode,
      );
    }
    return Object.freeze({
      endpoint: endpoint.id,
      permission: endpoint.permission,
      requestTimeMs,
      receivedAtMs: (dependencies.now ?? Date.now)(),
      data: payload.data as T,
    });
  } catch (error) {
    if (error instanceof MexcPrivateReadOnlyError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new MexcPrivateReadOnlyError(
        "timeout",
        "MEXC private read request timed out.",
      );
    }
    throw new MexcPrivateReadOnlyError(
      "provider",
      "MEXC private read request could not be completed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
