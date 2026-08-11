import { NextResponse } from "next/server";
import { consumeRateLimit, verifyEmailToken } from "../../../lib/auth-db";
import { requestIp, validRequestOrigin } from "../../../lib/request-security";
import { appendAudit } from "../../../lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  let body: { token?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Verification link is invalid or expired." }, { status: 400 }); }
  const token = typeof body.token === "string" ? body.token : "";
  const ip = requestIp(request);
  if (consumeRateLimit([`verify-email:ip:${ip}`], 12, 15 * 60_000)) return NextResponse.json({ error: "Verification link is invalid or expired." }, { status: 429 });
  const user = verifyEmailToken(token);
  if (!user) return NextResponse.json({ error: "Verification link is invalid or expired." }, { status: 400 });
  await appendAudit(user.id, "auth.email-verified", { ip });
  return NextResponse.json({ verified: true });
}
