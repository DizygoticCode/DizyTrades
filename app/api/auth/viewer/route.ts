import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, VIEWER_SESSION_MAX_AGE_SECONDS, VIEWER_USER } from "../../../lib/auth";
import { validRequestOrigin } from "../../../lib/request-security";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const response = NextResponse.json({ user: VIEWER_USER });
  response.cookies.set(SESSION_COOKIE, createSessionToken(VIEWER_USER, VIEWER_SESSION_MAX_AGE_SECONDS), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: VIEWER_SESSION_MAX_AGE_SECONDS });
  return response;
}
