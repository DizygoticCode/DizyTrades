import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/auth";
import { consumeRateLimit, disableMfa, verifyAccountPassword, verifyCurrentMfa } from "../../../../lib/auth-db";
import { requestIp, validRequestOrigin } from "../../../../lib/request-security";
import { appendAudit } from "../../../../lib/store";

export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const user = await requireApiUser(); if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (consumeRateLimit([`mfa:disable:user:${user.id}`, `mfa:disable:ip:${requestIp(request)}`], 5, 15 * 60_000)) return NextResponse.json({ error: "Too many re-authentication attempts." }, { status: 429 });
  let body: { password?: unknown; proof?: unknown }; try { body = await request.json(); } catch { return NextResponse.json({ error: "Strong re-authentication required." }, { status: 400 }); }
  if (typeof body.password !== "string" || typeof body.proof !== "string" || !await verifyAccountPassword(user.id, body.password) || !verifyCurrentMfa(user.id, body.proof)) return NextResponse.json({ error: "Strong re-authentication failed." }, { status: 403 });
  disableMfa(user.id); await appendAudit(user.id, "auth.mfa-disabled", { sessionsRevoked: true }); return NextResponse.json({ ok: true });
}
