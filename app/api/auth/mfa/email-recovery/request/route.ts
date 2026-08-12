import { NextResponse } from "next/server";
import { accountMailConfigured, sendMfaRecoveryEmail } from "../../../../../lib/account-mail";
import { consumeRateLimit, createMfaEmailRecoveryToken, mfaEmailRecoveryCandidate } from "../../../../../lib/auth-db";
import { requestIp, validRequestOrigin } from "../../../../../lib/request-security";

export const runtime = "nodejs";
const accepted = () => NextResponse.json({ message: "If this MFA challenge is eligible, a recovery email has been sent." }, { status: 202 });

export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  let body: { challenge?: unknown }; try { body = await request.json(); } catch { return accepted(); }
  const challenge = typeof body.challenge === "string" ? body.challenge : "";
  const ip = requestIp(request);
  if (consumeRateLimit([`mfa-email-recovery:request:ip:${ip}`], 3, 60 * 60_000)) return accepted();
  const candidate = mfaEmailRecoveryCandidate(challenge);
  if (!candidate || consumeRateLimit([`mfa-email-recovery:request:user:${candidate.userId}`], 3, 60 * 60_000)) return accepted();
  const recovery = createMfaEmailRecoveryToken(challenge);
  if (recovery && accountMailConfigured()) {
    try { await sendMfaRecoveryEmail(recovery.email, recovery.token); } catch { /* enumeration-safe */ }
  }
  return accepted();
}
