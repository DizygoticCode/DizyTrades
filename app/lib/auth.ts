import "server-only";

import {
  createHmac,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type AuthUser = {
  id: "rob" | "friend";
  name: string;
  email: string;
  role: "owner" | "admin";
};

type ConfiguredUser = AuthUser & { passwordHash: string };
type SessionPayload = AuthUser & { expiresAt: number };

export const SESSION_COOKIE = "dizytrades_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

const cleanEmail = (value: string) => value.trim().toLowerCase();

function users(): ConfiguredUser[] {
  return [
    {
      id: "rob",
      name: process.env.ROB_NAME?.trim() || "Rob",
      email: cleanEmail(process.env.ROB_EMAIL || ""),
      passwordHash: process.env.ROB_PASSWORD_HASH || "",
      role: "owner",
    },
    {
      id: "friend",
      name: process.env.FRIEND_NAME?.trim() || "Friend",
      email: cleanEmail(process.env.FRIEND_EMAIL || ""),
      passwordHash: process.env.FRIEND_PASSWORD_HASH || "",
      role: "admin",
    },
  ].filter((user) => user.email && user.passwordHash) as ConfiguredUser[];
}

function sessionSecret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV !== "production") {
    return "local-dizytrades-session-secret-change-before-deploy";
  }
  throw new Error("SESSION_SECRET must contain at least 32 characters");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyPassword(password: string, encodedHash: string) {
  const [salt, expected] = encodedHash.split(":");
  if (!salt || !expected || password.length > 256) return false;
  const derived = scryptSync(password, salt, 64).toString("hex");
  return safeEqual(derived, expected);
}

export function authenticateUser(
  email: string,
  password: string,
): AuthUser | null {
  const user = users().find((candidate) => candidate.email === cleanEmail(email));
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  const { passwordHash: _passwordHash, ...safeUser } = user;
  void _passwordHash;
  return safeUser;
}

export function createSessionToken(user: AuthUser) {
  const payload: SessionPayload = {
    ...user,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function parseSessionToken(token: string | undefined): AuthUser | null {
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
      !["rob", "friend"].includes(payload.id) ||
      !["owner", "admin"].includes(payload.role)
    ) {
      return null;
    }
    const configured = users().find(
      (candidate) =>
        candidate.id === payload.id && candidate.email === payload.email,
    );
    if (!configured) return null;
    const { passwordHash: _passwordHash, ...user } = configured;
    void _passwordHash;
    return user;
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

export function authIsConfigured() {
  return users().length > 0;
}
