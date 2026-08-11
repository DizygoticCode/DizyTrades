import { NextResponse } from "next/server";
import { consumeRateLimit, getAccountProfile, updateAccountProfile } from "../../../lib/auth-db";
import { requireApiUser } from "../../../lib/auth";
import { requestIp, validRequestOrigin } from "../../../lib/request-security";
import { appendAudit } from "../../../lib/store";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireApiUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json({ profile: getAccountProfile(user) });
}

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!validRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const ip = requestIp(request);
  if (consumeRateLimit([`profile:update:${user.id}`, `profile:update:ip:${ip}`], 20, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many profile changes. Try again later." }, { status: 429 });
  }
  let body: { displayName?: unknown; bio?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid profile." }, { status: 400 }); }
  const displayName = typeof body.displayName === "string" ? body.displayName : "";
  const bio = typeof body.bio === "string" ? body.bio : "";
  try {
    const profile = updateAccountProfile(user, { displayName, bio });
    await appendAudit(user.id, "auth.profile-updated", { ip });
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: String(error).includes("AUTH_UNAVAILABLE") ? "Profile storage is unavailable." : "Check your display name and profile details." }, { status: String(error).includes("AUTH_UNAVAILABLE") ? 503 : 400 });
  }
}
