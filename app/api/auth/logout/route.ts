import { NextResponse } from "next/server";
import { revokeDatabaseSession } from "../../../lib/auth-db";
import { currentUser, SESSION_COOKIE } from "../../../lib/auth";
import { validRequestOrigin } from "../../../lib/request-security";
import { appendAudit } from "../../../lib/store";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)dizytrades_session=([^;]+)/)?.[1];
  const user = await currentUser(); if (token) revokeDatabaseSession(token);
  if (user && user.role !== "viewer") await appendAudit(user.id, "auth.logout");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)dizytrades_session=([^;]+)/)?.[1];
  const user = await currentUser(); if (token) revokeDatabaseSession(token);
  if (user && user.role !== "viewer") await appendAudit(user.id, "auth.logout");
  const response = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
