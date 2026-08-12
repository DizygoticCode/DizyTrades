import "server-only";

import { createHmac } from "node:crypto";
import { createDatabaseSession, privilegedAccountMigrationCompleted } from "./auth-db";
import {
  configuredUsers,
  legacyAuthFallbackEnabled,
  safeEqual,
  withoutSecrets,
  type AuthUser,
} from "./auth-credentials";
import { safeOwnerId } from "./security-boundaries";

type SessionPayload = AuthUser & { expiresAt: number };
export const SESSION_COOKIE = "dizytrades_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const VIEWER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 2;
export const VIEWER_USER: AuthUser = { id: "guest", name: "Viewer", email: "", role: "viewer" };

const SIGNED_SESSION_MAX_LENGTH = 2048;
const BASE64URL_PART = /^[a-z0-9_-]+$/i;
const HMAC_BASE64URL = /^[a-z0-9_-]{43}$/i;

function sessionSecret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV !== "production") return "local-dizytrades-session-secret-change-before-deploy";
  throw new Error("SESSION_SECRET must contain at least 32 characters");
}

/** Signed tokens remain for viewer and backwards-compatible legacy sessions. */
export function createSessionToken(user: AuthUser, maxAge = SESSION_MAX_AGE_SECONDS) {
  if (!Number.isSafeInteger(maxAge) || maxAge < 60 || maxAge > SESSION_MAX_AGE_SECONDS) {
    throw new Error("Invalid session lifetime.");
  }
  const payload: SessionPayload = {
    id: safeOwnerId(user.id, "session owner"),
    name: user.name.slice(0, 120),
    email: user.email.slice(0, 254),
    role: user.role,
    expiresAt: Date.now() + maxAge * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", sessionSecret()).update(body).digest("base64url")}`;
}

export function parseSessionToken(token: string | undefined): AuthUser | null {
  if (!token || token.length > SIGNED_SESSION_MAX_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature || !BASE64URL_PART.test(body) || !HMAC_BASE64URL.test(signature)) return null;
  const expectedSignature = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  if (!safeEqual(signature, expectedSignature)) return null;
  try {
    const decoded = Buffer.from(body, "base64url");
    if (decoded.length > 1024) return null;
    const payload = JSON.parse(decoded.toString("utf8")) as Partial<SessionPayload>;
    if (!Number.isSafeInteger(payload.expiresAt) || payload.expiresAt! <= Date.now()) return null;
    if (typeof payload.id !== "string" || typeof payload.name !== "string" || typeof payload.email !== "string") return null;
    if (payload.name.length > 120 || payload.email.length > 254) return null;
    const ownerId = safeOwnerId(payload.id, "session owner");
    if (ownerId === "guest" && payload.role === "viewer" && payload.email === "") return VIEWER_USER;
    if (payload.role !== "owner" && payload.role !== "admin") return null;
    if (!legacyAuthFallbackEnabled()) return null;
    // Once the one-way privileged migration has completed, rob/friend sessions
    // are revocable database rows. Never let an older signed token bypass that
    // authority (including after password reset or MFA break-glass recovery).
    if ((ownerId === "rob" || ownerId === "friend") && privilegedAccountMigrationCompleted()) return null;
    const legacy = configuredUsers().find((user) => user.id === ownerId && user.email === payload.email);
    return legacy ? withoutSecrets(legacy) : null;
  } catch {
    return null;
  }
}

export function issueSession(user: AuthUser) {
  const databaseToken = createDatabaseSession(user, SESSION_MAX_AGE_SECONDS);
  if (databaseToken) return databaseToken;
  if (user.role === "owner" || user.role === "admin" || user.role === "viewer") {
    return createSessionToken(user);
  }
  return null;
}
