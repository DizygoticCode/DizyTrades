import { NextResponse } from "next/server";
import { consumeRateLimit } from "../../../lib/auth-db";
import { authenticateUserDetailed, issueSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "../../../lib/auth";
import { normaliseIdentifier } from "../../../lib/auth-credentials";
import { requestIp, validRequestOrigin } from "../../../lib/request-security";
import { appendAudit } from "../../../lib/store";

export const runtime = "nodejs";
const error = () => NextResponse.json({ error: "Username/email or password was not recognised." }, { status: 401 });

export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  let body: { identifier?: unknown; email?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return error(); }
  const identifier = typeof body.identifier === "string" ? body.identifier : typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const ip = requestIp(request);
  const normalized = normaliseIdentifier(identifier);
  if (!normalized || password.length < 1 || password.length > 128) return error();
  if (consumeRateLimit([`login:ip:${ip}`, `login:id:${normalized}`], 8, 15 * 60_000)) {
    return NextResponse.json({ error: "Username/email or password was not recognised." }, { status: 429 });
  }
  const authentication = await authenticateUserDetailed(normalized, password);
  if (authentication.status === "email-unverified") {
    return NextResponse.json({ error: "Verify your email before signing in.", code: "EMAIL_UNVERIFIED" }, { status: 403 });
  }
  if (authentication.status !== "authenticated") return error();
  const user = authentication.user;
  const token = issueSession(user);
  if (!token) return NextResponse.json({ error: "Authentication service unavailable." }, { status: 503 });
  const response = NextResponse.json({ user });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SECONDS });
  await appendAudit(user.id, "auth.login", { ip });
  return response;
}
