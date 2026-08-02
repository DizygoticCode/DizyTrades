import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/auth";
import { appendAudit, readUserRecord, saveSettings } from "../../lib/store";
import { DEFAULT_TERMINAL_SETTINGS } from "../../lib/config";
import { applyMarketSettingsPatch } from "../../lib/profile-market-patch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ user, settings: DEFAULT_TERMINAL_SETTINGS, paperRuns: [], updatedAt: new Date(0).toISOString() });
  const record = await readUserRecord(user.id);
  return NextResponse.json({ user, ...record });
}

export async function PUT(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "Viewer sessions are read-only." }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 50_000) {
    return NextResponse.json({ error: "Settings payload is too large." }, { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const record = await saveSettings(user.id, payload);
  await appendAudit(user.id, "settings.saved");
  return NextResponse.json({
    ok: true,
    updatedAt: record.updatedAt,
    settings: record.settings,
  });
}

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "Viewer sessions are read-only." }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 10_000) return NextResponse.json({ error: "Market settings patch is too large." }, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const current = await readUserRecord(user.id);
  const merged = applyMarketSettingsPatch(current.settings, payload);
  if (!merged.ok) return NextResponse.json({ error: merged.error }, { status: 400 });
  const record = await saveSettings(user.id, merged.settings);
  await appendAudit(user.id, "settings.market-patched");
  return NextResponse.json({ ok: true, updatedAt: record.updatedAt, settings: record.settings });
}
