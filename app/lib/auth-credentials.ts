import "server-only";

import { scryptSync, timingSafeEqual } from "node:crypto";

export type AuthUser = {
  id: "rob" | "friend" | "guest";
  name: string;
  email: string;
  role: "owner" | "admin" | "viewer";
};

export type ConfiguredUser = AuthUser & {
  passwordHash: string;
  plaintextPassword: string;
};

const cleanEmail = (value: string) => value.trim().toLowerCase();

function testPlaintextPasswordsAllowed() {
  return (
    process.env.ALLOW_TEST_PLAINTEXT_PASSWORDS === "true" &&
    process.env.LIVE_TRADING_ENABLED !== "true"
  );
}

function validPasswordHash(value: string) {
  const [salt, expected, extra] = value.split(":");
  return Boolean(
    salt &&
    expected &&
    !extra &&
    /^[a-f\d]{128}$/i.test(expected),
  );
}

export function configuredUsers(): ConfiguredUser[] {
  return [
    {
      id: "rob",
      name: process.env.ROB_NAME?.trim() || "Rob",
      email: cleanEmail(process.env.ROB_EMAIL || ""),
      passwordHash: process.env.ROB_PASSWORD_HASH || "",
      plaintextPassword: process.env.ROB_PASSWORD || "",
      role: "owner",
    },
    {
      id: "friend",
      name: process.env.FRIEND_NAME?.trim() || "Friend",
      email: cleanEmail(process.env.FRIEND_EMAIL || ""),
      passwordHash: process.env.FRIEND_PASSWORD_HASH || "",
      plaintextPassword: process.env.FRIEND_PASSWORD || "",
      role: "admin",
    },
  ].filter(
    (user) =>
      user.email &&
      (validPasswordHash(user.passwordHash) ||
        (testPlaintextPasswordsAllowed() && Boolean(user.plaintextPassword))),
  ) as ConfiguredUser[];
}

export function safeEqual(left: string, right: string) {
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

export function withoutSecrets(user: ConfiguredUser): AuthUser {
  const {
    passwordHash: _passwordHash,
    plaintextPassword: _plaintextPassword,
    ...safeUser
  } = user;
  void _passwordHash;
  void _plaintextPassword;
  return safeUser;
}

export function authenticateUser(
  email: string,
  password: string,
): AuthUser | null {
  const user = configuredUsers().find(
    (candidate) => candidate.email === cleanEmail(email),
  );
  if (!user) return null;
  const usePlaintextPassword =
    testPlaintextPasswordsAllowed() && Boolean(user.plaintextPassword);
  const passwordMatches = usePlaintextPassword
    ? safeEqual(password, user.plaintextPassword)
    : verifyPassword(password, user.passwordHash);
  return passwordMatches ? withoutSecrets(user) : null;
}

export function authIsConfigured() {
  return configuredUsers().length > 0;
}
