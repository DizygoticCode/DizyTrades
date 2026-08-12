import "server-only";

import { applyAccountProfile, authenticateDatabaseUserDetailed, databaseHasPrivilegedIdentity, migratePrivilegedAccounts } from "./auth-db";
import { authenticateLegacyUser, type AuthUser } from "./auth-credentials";

export type AuthenticationResult =
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "email-unverified"; email: string }>
  | Readonly<{ status: "authenticated"; user: AuthUser; mfaEnabled: boolean; credentialSource: "database" | "legacy" }>;

export async function authenticateUserDetailed(identifier: string, password: string): Promise<AuthenticationResult> {
  const normalized = identifier.trim().toLowerCase();
  const privilegedIdentifier = [process.env.ROB_EMAIL, process.env.FRIEND_EMAIL].some(value => value?.trim().toLowerCase() === normalized);
  try { await migratePrivilegedAccounts(); }
  catch { return { status: "invalid" }; }
  const database = await authenticateDatabaseUserDetailed(identifier, password);
  if (database.status === "email-unverified") return database;
  if (database.status === "authenticated") return { status: "authenticated", user: applyAccountProfile(database.user), mfaEnabled: database.mfaEnabled, credentialSource: "database" };
  if (privilegedIdentifier || databaseHasPrivilegedIdentity(identifier)) return { status: "invalid" };
  const legacy = await authenticateLegacyUser(identifier, password);
  return legacy ? { status: "authenticated", user: applyAccountProfile(legacy), mfaEnabled: false, credentialSource: "legacy" } : { status: "invalid" };
}

export async function authenticateUser(identifier: string, password: string) {
  const result = await authenticateUserDetailed(identifier, password);
  return result.status === "authenticated" ? result.user : null;
}
