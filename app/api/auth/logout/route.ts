import { NextResponse } from "next/server";
import { currentUser, SESSION_COOKIE } from "../../../lib/auth";
import { appendAudit } from "../../../lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await currentUser();
  if (user) await appendAudit(user.id, "auth.logout");
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
