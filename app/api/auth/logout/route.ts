import { NextResponse } from "next/server";
import { currentUser, SESSION_COOKIE } from "../../../lib/auth";
import { appendAudit } from "../../../lib/store";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (user) await appendAudit(user.id, "auth.logout");
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/login",
      "Cache-Control": "no-store",
    },
  });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
