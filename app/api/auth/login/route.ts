import { NextResponse } from "next/server";
import {
  authenticateUser,
  authIsConfigured,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "../../../lib/auth";
import { appendAudit } from "../../../lib/store";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = attempts.get(ip);
  if (current && current.resetAt > now && current.count >= 8) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }
  if (!authIsConfigured()) {
    return NextResponse.json(
      { error: "Test users have not been configured on this service." },
      { status: 503 },
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json() as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const user = authenticateUser(body.email || "", body.password || "");
  if (!user) {
    attempts.set(ip, {
      count: current && current.resetAt > now ? current.count + 1 : 1,
      resetAt: current && current.resetAt > now
        ? current.resetAt
        : now + 15 * 60 * 1000,
    });
    return NextResponse.json(
      { error: "Email or password was not recognised." },
      { status: 401 },
    );
  }

  attempts.delete(ip);
  const response = NextResponse.json({ user });
  response.cookies.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  await appendAudit(user.id, "auth.login", { ip });
  return response;
}
