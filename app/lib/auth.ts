import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { applyAccountProfile, authenticateDatabaseUserDetailed, databaseSession } from "./auth-db";
import {
  authenticateLegacyUser,
  authIsConfigured,
  type AuthUser,
} from "./auth-credentials";
import {
  createSessionToken,
  issueSession,
  parseSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  VIEWER_SESSION_MAX_AGE_SECONDS,
  VIEWER_USER,
} from "./auth-session";

export {
  authIsConfigured,
  createSessionToken,
  issueSession,
  parseSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  VIEWER_SESSION_MAX_AGE_SECONDS,
  VIEWER_USER,
  type AuthUser,
};

export type AuthenticationResult =
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "email-unverified"; email: string }>
  | Readonly<{ status: "authenticated"; user: AuthUser }>;

export async function authenticateUserDetailed(identifier: string, password: string): Promise<AuthenticationResult> {
  const database = await authenticateDatabaseUserDetailed(identifier, password);
  if (database.status === "email-unverified") return database;
  if (database.status === "authenticated") return { status: "authenticated", user: applyAccountProfile(database.user) };
  const legacy = await authenticateLegacyUser(identifier, password);
  return legacy
    ? { status: "authenticated", user: applyAccountProfile(legacy) }
    : { status: "invalid" };
}

export async function authenticateUser(identifier: string, password: string) {
  const result = await authenticateUserDetailed(identifier, password);
  return result.status === "authenticated" ? result.user : null;
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = databaseSession(token) || parseSessionToken(token);
  return user ? applyAccountProfile(user) : null;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireApiUser(): Promise<AuthUser | null> {
  return currentUser();
}
