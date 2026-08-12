import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { applyAccountProfile, databaseSession } from "./auth-db";
import { authenticateUser, authenticateUserDetailed, type AuthenticationResult } from "./auth-authentication";
import {
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

export { authenticateUser, authenticateUserDetailed, type AuthenticationResult };

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
