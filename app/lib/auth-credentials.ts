import "server-only";

import { randomBytes, scrypt as nodeScrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (password: string, salt: string | Buffer, length: number, options?: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => nodeScrypt(password, salt, length, options || {}, (error, key) => error ? reject(error) : resolve(key)));
export type UserRole = "owner" | "admin" | "user" | "viewer";
export type AuthUser = { id: string; name: string; email: string; role: UserRole };
export type ConfiguredUser = AuthUser & { passwordHash: string; plaintextPassword: string };

export const normaliseIdentifier = (value: string) => value.trim().toLowerCase();
export const publicSignupEnabled = () => process.env.PUBLIC_SIGNUP_ENABLED !== "false";

function testPlaintextPasswordsAllowed() {
  return process.env.ALLOW_TEST_PLAINTEXT_PASSWORDS === "true" && process.env.LIVE_TRADING_ENABLED !== "true";
}

function validLegacyHash(value: string) {
  const [salt, expected, extra] = value.split(":");
  return Boolean(salt && expected && !extra && /^[a-f\d]{128}$/i.test(expected));
}

export function configuredUsers(): ConfiguredUser[] {
  return [
    { id: "rob", name: process.env.ROB_NAME?.trim() || "Rob", email: normaliseIdentifier(process.env.ROB_EMAIL || ""), passwordHash: process.env.ROB_PASSWORD_HASH || "", plaintextPassword: process.env.ROB_PASSWORD || "", role: "owner" },
    { id: "friend", name: process.env.FRIEND_NAME?.trim() || "Nick", email: normaliseIdentifier(process.env.FRIEND_EMAIL || ""), passwordHash: process.env.FRIEND_PASSWORD_HASH || "", plaintextPassword: process.env.FRIEND_PASSWORD || "", role: "admin" },
  ].filter((user) => user.email && (validLegacyHash(user.passwordHash) || (testPlaintextPasswordsAllowed() && Boolean(user.plaintextPassword)))) as ConfiguredUser[];
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const parameters = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
  const derived = await scrypt(password, salt, 64, parameters);
  return `scrypt$v=1$N=${parameters.N},r=${parameters.r},p=${parameters.p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  if (password.length > 128) return false;
  if (!encoded.startsWith("scrypt$")) {
    const [salt, expected] = encoded.split(":");
    if (!salt || !expected) return false;
    const derived = await scrypt(password, salt, 64);
    return safeEqual(derived.toString("hex"), expected);
  }
  const parts = encoded.split("$");
  if (parts.length !== 5 || parts[1] !== "v=1") return false;
  const match = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parts[2]);
  if (!match) return false;
  const [N, r, p] = match.slice(1).map(Number);
  if (N !== 16384 || r !== 8 || p !== 1) return false;
  const salt = Buffer.from(parts[3], "base64url");
  const expected = Buffer.from(parts[4], "base64url");
  const derived = await scrypt(password, salt, expected.length, { N, r, p, maxmem: 32 * 1024 * 1024 });
  return expected.length > 0 && timingSafeEqual(derived, expected);
}

export function withoutSecrets(user: ConfiguredUser): AuthUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function authenticateLegacyUser(identifier: string, password: string): Promise<AuthUser | null> {
  if (process.env.LEGACY_AUTH_FALLBACK_ENABLED === "false") return null;
  const user = configuredUsers().find((candidate) => candidate.email === normaliseIdentifier(identifier));
  if (!user) return null;
  const matches = testPlaintextPasswordsAllowed() && user.plaintextPassword
    ? safeEqual(password, user.plaintextPassword)
    : await verifyPassword(password, user.passwordHash);
  return matches ? withoutSecrets(user) : null;
}

export const authenticateUser = authenticateLegacyUser;
export function authIsConfigured() { return configuredUsers().length > 0; }
