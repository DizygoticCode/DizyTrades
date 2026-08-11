import { NextResponse } from "next/server";
import { consumeRateLimit, resetPasswordWithToken } from "../../../lib/auth-db";
import { requestIp, validRequestOrigin } from "../../../lib/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  let body: { token?: unknown; password?: unknown; passwordConfirmation?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Reset link is invalid or expired." }, { status: 400 }); }
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirmation = typeof body.passwordConfirmation === "string" ? body.passwordConfirmation : "";
  const ip = requestIp(request);
  if (consumeRateLimit([`password-reset-submit:ip:${ip}`], 8, 15 * 60_000)) return NextResponse.json({ error: "Reset link is invalid or expired." }, { status: 429 });
  if (password.length < 12 || password.length > 128 || password !== confirmation) {
    return NextResponse.json({ error: "Use a matching password between 12 and 128 characters." }, { status: 400 });
  }
  const changed = await resetPasswordWithToken(token, password);
  if (!changed) return NextResponse.json({ error: "Reset link is invalid or expired." }, { status: 400 });
  return NextResponse.json({ reset: true });
}
