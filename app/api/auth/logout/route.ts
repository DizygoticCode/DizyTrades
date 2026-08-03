import { NextResponse } from "next/server";
import { revokeDatabaseSession } from "../../../lib/auth-db";
import { currentUser, SESSION_COOKIE } from "../../../lib/auth";
import { validRequestOrigin, validSameOriginNavigation } from "../../../lib/request-security";
import { appendAudit } from "../../../lib/store";

export const runtime = "nodejs";

function sessionToken(request: Request) {
  return request.headers.get("cookie")?.match(/(?:^|;\s*)dizytrades_session=([^;]+)/)?.[1];
}

async function revokeCurrentSession(request: Request) {
  const token = sessionToken(request);
  const user = await currentUser();
  if (token) revokeDatabaseSession(token);
  if (user && user.role !== "viewer") await appendAudit(user.id, "auth.logout");
}

function expireSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function POST(request: Request) {
  if (!validRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  await revokeCurrentSession(request);
  return expireSessionCookie(NextResponse.json({ ok: true }));
}

export async function GET(request: Request) {
  if (!validSameOriginNavigation(request)) {
    return NextResponse.json({ error: "Use the DizyTrades sign-out control." }, { status: 403 });
  }
  await revokeCurrentSession(request);
  return expireSessionCookie(
    new NextResponse(null, { status: 303, headers: { Location: "/login" } }),
  );
}
