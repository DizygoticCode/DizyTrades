import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/auth";
import { confirmMfaEnrollment, consumeRateLimit } from "../../../../lib/auth-db";
import { requestIp, validRequestOrigin } from "../../../../lib/request-security";
import { appendAudit } from "../../../../lib/store";

export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (consumeRateLimit([`mfa:confirm:user:${user.id}`, `mfa:confirm:ip:${requestIp(request)}`], 5, 15 * 60_000)) return NextResponse.json({ error: "Too many MFA attempts." }, { status: 429 });
  let body: { code?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid code." }, { status: 400 }); }
  const codes = confirmMfaEnrollment(user.id, typeof body.code === "string" ? body.code : "");
  if (!codes) return NextResponse.json({ error: "Invalid code." }, { status: 400 });
  await appendAudit(user.id, "auth.mfa-activated");
  return NextResponse.json({ recoveryCodes: codes });
}
