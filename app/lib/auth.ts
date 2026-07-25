import "server-only";

import {
  createHmac,
} from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  authenticateUser,
  authIsConfigured,
  configuredUsers,
  safeEqual,
  withoutSecrets,
  type AuthUser,
} from "./auth-credentials";

export { authenticateUser, authIsConfigured, type AuthUser };
type SessionPayload = AuthUser & { expiresAt: number };

export const SESSION_COOKIE = "dizytrades_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const VIEWER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 2;
export const VIEWER_USER: AuthUser = { id: "guest", name: "Viewer", email: "", role: "viewer" };

function sessionSecret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV !== "production") {
    return "local-dizytrades-session-secret-change-before-deploy";
  }
  throw new Error("SESSION_SECRET must contain at least 32 characters");
}

export function createSessionToken(user: AuthUser, maxAge = SESSION_MAX_AGE_SECONDS) {
  const payload: SessionPayload = {
    ...user,
    expiresAt: Date.now() + maxAge * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function parseSessionToken(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", sessionSecret())
    .update(body)
    .digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (
      payload.expiresAt <= Date.now() ||
      !["rob", "friend", "guest"].includes(payload.id) ||
      !["owner", "admin", "viewer"].includes(payload.role)
    ) {
      return null;
    }
    if (payload.id === "guest" && payload.role === "viewer" && payload.email === "") return VIEWER_USER;
    const configured = configuredUsers().find(
      (candidate) =>
        candidate.id === payload.id && candidate.email === payload.email,
    );
    if (!configured) return null;
    return withoutSecrets(configured);
  } catch {
    return null;
  }
}

export async function currentUser() {
  const cookieStore = await cookies();
  return parseSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<AuthUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireApiUser(): Promise<AuthUser | null> {
  return currentUser();
}
