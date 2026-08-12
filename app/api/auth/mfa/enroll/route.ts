import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/auth";
import { beginMfaEnrollment, consumeRateLimit, getAccountProfile, getMfaStatus, verifyAccountPassword } from "../../../../lib/auth-db";
import { requestIp, validRequestOrigin } from "../../../../lib/request-security";
import { appendAudit } from "../../../../lib/store";

export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const user = await requireApiUser();
  if (!user || getAccountProfile(user).credentialSource !== "database") return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (getMfaStatus(user.id).enabled) return NextResponse.json({ error: "MFA is already active." }, { status: 409 });
  if (consumeRateLimit([`mfa:enroll:user:${user.id}`, `mfa:enroll:ip:${requestIp(request)}`], 5, 15 * 60_000)) return NextResponse.json({ error: "Too many re-authentication attempts." }, { status: 429 });
  let body: { password?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Re-authentication required." }, { status: 400 }); }
  if (typeof body.password !== "string" || !await verifyAccountPassword(user.id, body.password)) return NextResponse.json({ error: "Re-authentication failed." }, { status: 403 });
  const secret = beginMfaEnrollment(user.id);
  await appendAudit(user.id, "auth.mfa-enrollment-begun");
  return NextResponse.json({ secret, otpauth: `otpauth://totp/DizyTrades:${encodeURIComponent(user.email)}?secret=${secret}&issuer=DizyTrades&algorithm=SHA1&digits=6&period=30` });
}
