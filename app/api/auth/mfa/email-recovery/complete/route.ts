import { NextResponse } from "next/server";
import { completeMfaEmailRecovery, consumeRateLimit, mfaEmailRecoveryTokenCandidate } from "../../../../../lib/auth-db";
import { requestIp, validRequestOrigin } from "../../../../../lib/request-security";

export const runtime = "nodejs";
const failed = (status = 400) => NextResponse.json({ error: "Recovery link is invalid or expired." }, { status });
export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  let body: { token?: unknown }; try { body = await request.json(); } catch { return failed(); }
  const token = typeof body.token === "string" ? body.token : "", ip = requestIp(request);
  if (consumeRateLimit([`mfa-email-recovery:complete:ip:${ip}`], 8, 15 * 60_000)) return failed(429);
  const userId = mfaEmailRecoveryTokenCandidate(token);
  if (!userId || consumeRateLimit([`mfa-email-recovery:complete:user:${userId}`], 5, 15 * 60_000)) return failed();
  return completeMfaEmailRecovery(token) ? NextResponse.json({ recovered: true }) : failed();
}
