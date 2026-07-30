import "server-only";

import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateDatabaseUser, createDatabaseSession, databaseSession } from "./auth-db";
import { authenticateLegacyUser, authIsConfigured, configuredUsers, safeEqual, withoutSecrets, type AuthUser } from "./auth-credentials";

export { authIsConfigured, type AuthUser };
type SessionPayload = AuthUser & { expiresAt: number };
export const SESSION_COOKIE = "dizytrades_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const VIEWER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 2;
export const VIEWER_USER: AuthUser = { id: "guest", name: "Viewer", email: "", role: "viewer" };

function sessionSecret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV !== "production") return "local-dizytrades-session-secret-change-before-deploy";
  throw new Error("SESSION_SECRET must contain at least 32 characters");
}

/** Signed tokens remain for viewer and backwards-compatible legacy sessions. */
export function createSessionToken(user: AuthUser, maxAge = SESSION_MAX_AGE_SECONDS) {
  const body = Buffer.from(JSON.stringify({ ...user, expiresAt: Date.now() + maxAge * 1000 })).toString("base64url");
  return `${body}.${createHmac("sha256", sessionSecret()).update(body).digest("base64url")}`;
}

export function parseSessionToken(token: string | undefined): AuthUser | null {
  if (!token) return null; const [body, signature] = token.split("."); if (!body || !signature) return null;
  if (!safeEqual(signature, createHmac("sha256", sessionSecret()).update(body).digest("base64url"))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.expiresAt <= Date.now()) return null;
    if (payload.id === "guest" && payload.role === "viewer" && payload.email === "") return VIEWER_USER;
    if (!(["owner", "admin"] as string[]).includes(payload.role)) return null;
    const legacy = configuredUsers().find((user) => user.id === payload.id && user.email === payload.email);
    return legacy ? withoutSecrets(legacy) : null;
  } catch { return null; }
}

export async function authenticateUser(identifier: string, password: string) {
  return await authenticateDatabaseUser(identifier, password) || await authenticateLegacyUser(identifier, password);
}

export function issueSession(user: AuthUser) {
  return createDatabaseSession(user, SESSION_MAX_AGE_SECONDS) || createSessionToken(user);
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? databaseSession(token) || parseSessionToken(token) : null;
}

export async function requireUser(): Promise<AuthUser> { const user = await currentUser(); if (!user) redirect("/login"); return user; }
export async function requireApiUser(): Promise<AuthUser | null> { return currentUser(); }
