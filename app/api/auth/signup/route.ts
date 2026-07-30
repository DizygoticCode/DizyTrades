import { NextResponse } from "next/server";
import { consumeRateLimit, createAccount, createDatabaseSession } from "../../../lib/auth-db";
import { normaliseIdentifier, publicSignupEnabled } from "../../../lib/auth-credentials";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "../../../lib/auth";
import { requestIp, validRequestOrigin } from "../../../lib/request-security";
import { appendAudit } from "../../../lib/store";

export const runtime = "nodejs";
const generic = (status = 400) => NextResponse.json({ error: "Registration could not be completed. Check your details and try again." }, { status });

export async function POST(request: Request) {
  if (!publicSignupEnabled()) return NextResponse.json({ error: "Registration is currently unavailable." }, { status: 403 });
  if (!validRequestOrigin(request)) return generic(403);
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return generic(); }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirmation = typeof body.passwordConfirmation === "string" ? body.passwordConfirmation : "";
  const honeypot = typeof body.website === "string" ? body.website : "";
  const usernameValid = !username || (/^[A-Za-z0-9_.-]{3,32}$/.test(username) && !username.includes("@"));
  const emailValid = !email || (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (honeypot || (!username && !email) || !usernameValid || !emailValid || password.length < 12 || password.length > 128 || password !== confirmation) return generic();
  const ip = requestIp(request); const identifiers = [username, email].filter(Boolean).map(normaliseIdentifier);
  if (consumeRateLimit([`signup:ip:${ip}`, ...identifiers.map((id) => `signup:id:${id}`)], 5, 60 * 60_000)) return generic(429);
  try {
    const user = await createAccount({ username: username || undefined, email: email || undefined, password });
    const token = createDatabaseSession(user, SESSION_MAX_AGE_SECONDS); if (!token) return generic(503);
    await appendAudit(user.id, "auth.signup", { ip, hasUsername: Boolean(username), hasEmail: Boolean(email) });
    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SECONDS });
    return response;
  } catch (error) { return generic(String(error).includes("AUTH_UNAVAILABLE") ? 503 : 409); }
}
