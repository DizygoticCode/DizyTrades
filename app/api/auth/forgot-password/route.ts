import { NextResponse } from "next/server";
import { consumeRateLimit, createPasswordResetTokenForEmail } from "../../../lib/auth-db";
import { accountMailConfigured, sendPasswordResetEmail } from "../../../lib/account-mail";
import { normaliseIdentifier } from "../../../lib/auth-credentials";
import { requestIp, validRequestOrigin } from "../../../lib/request-security";

export const runtime = "nodejs";
const accepted = () => NextResponse.json({ message: "If that address belongs to a verified DizyTrades account, a password-reset email has been sent." }, { status: 202 });

export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  if (!accountMailConfigured()) return NextResponse.json({ error: "Account email is temporarily unavailable." }, { status: 503 });
  let body: { email?: unknown };
  try { body = await request.json(); } catch { return accepted(); }
  const email = typeof body.email === "string" ? normaliseIdentifier(body.email) : "";
  const ip = requestIp(request);
  if (!email || email.length > 254) return accepted();
  if (consumeRateLimit([`password-reset:ip:${ip}`, `password-reset:email:${email}`], 3, 60 * 60_000)) return accepted();
  const reset = createPasswordResetTokenForEmail(email);
  if (reset) {
    try { await sendPasswordResetEmail(reset.email, reset.token); } catch { /* keep response enumeration-safe */ }
  }
  return accepted();
}
