import "server-only";

export const SAFE_OWNER_ID_PATTERN = /^[a-z0-9_-]{1,120}$/i;
export const OPAQUE_SESSION_TOKEN_PATTERN = /^[a-z0-9_-]{43}$/i;

export function safeOwnerId(value: string, label = "owner") {
  if (typeof value !== "string" || !SAFE_OWNER_ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label} identifier.`);
  }
  return value;
}

export function isOpaqueSessionToken(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_SESSION_TOKEN_PATTERN.test(value);
}
