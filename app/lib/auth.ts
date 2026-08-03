import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateDatabaseUser, databaseSession } from "./auth-db";
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

export async function authenticateUser(identifier: string, password: string) {
  return await authenticateDatabaseUser(identifier, password)
    || await authenticateLegacyUser(identifier, password);
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? databaseSession(token) || parseSessionToken(token) : null;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireApiUser(): Promise<AuthUser | null> {
  return currentUser();
}
