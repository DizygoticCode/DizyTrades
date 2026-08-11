import { NextResponse } from "next/server";
import { consumeRateLimit, createEmailVerificationTokenForEmail } from "../../../lib/auth-db";
import { accountMailConfigured, sendVerificationEmail } from "../../../lib/account-mail";
import { normaliseIdentifier } from "../../../lib/auth-credentials";
import { requestIp, validRequestOrigin } from "../../../lib/request-security";

export const runtime = "nodejs";
const accepted = () => NextResponse.json({ message: "If that address belongs to an unverified account, a verification email has been sent." }, { status: 202 });

export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  if (!accountMailConfigured()) return NextResponse.json({ error: "Account email is temporarily unavailable." }, { status: 503 });
  let body: { email?: unknown };
  try { body = await request.json(); } catch { return accepted(); }
  const email = typeof body.email === "string" ? normaliseIdentifier(body.email) : "";
  const ip = requestIp(request);
  if (!email || email.length > 254) return accepted();
  if (consumeRateLimit([`verify-resend:ip:${ip}`, `verify-resend:email:${email}`], 3, 60 * 60_000)) return accepted();
  const verification = createEmailVerificationTokenForEmail(email);
  if (verification) {
    try { await sendVerificationEmail(verification.email, verification.token); } catch { /* keep response enumeration-safe */ }
  }
  return accepted();
}
