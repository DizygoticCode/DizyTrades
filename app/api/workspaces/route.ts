import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/auth";
import { appendAudit, readUserRecord, saveSettings } from "../../lib/store";
import { recordRecentMarketShortcut } from "../../lib/recent-shortcuts-store";
import {
  deleteWorkspaceLayout,
  findWorkspaceLayout,
  readWorkspaceLayouts,
  saveWorkspaceLayout,
} from "../../lib/workspace-layout-store";
import { workspaceLayoutSummary } from "../../lib/workspace-layout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function payload(request: Request) {
  const raw = await request.text();
  if (raw.length > 2_000) throw new Error("Workspace request is too large.");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON.");
  }
}

export async function GET() {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role === "viewer") {
    return NextResponse.json({ readOnly: true, layouts: [] });
  }
  const layouts = await readWorkspaceLayouts(user.id);
  return NextResponse.json({
    readOnly: false,
    layouts: layouts.map(workspaceLayoutSummary),
  });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "Viewer sessions are read-only." }, { status: 403 });
  try {
    const body = await payload(request);
    const current = await readUserRecord(user.id);
    const result = await saveWorkspaceLayout(user.id, body.name, current.settings);
    await appendAudit(user.id, result.created ? "workspace.created" : "workspace.updated", {
      workspaceId: result.layout.id,
      name: result.layout.name,
    });
    return NextResponse.json(
      { created: result.created, layout: workspaceLayoutSummary(result.layout) },
      { status: result.created ? 201 : 200 },
    );
  } catch (reason) {
    return NextResponse.json(
      { error: reason instanceof Error ? reason.message : "Workspace could not be saved." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "Viewer sessions are read-only." }, { status: 403 });
  try {
    const body = await payload(request);
    const id = typeof body.id === "string" ? body.id : "";
    const layout = await findWorkspaceLayout(user.id, id);
    if (!layout) return NextResponse.json({ error: "Saved workspace was not found." }, { status: 404 });
    const record = await saveSettings(user.id, layout.settings);
    try {
      await recordRecentMarketShortcut(user.id, record.settings.market);
    } catch {
      // Recent shortcuts are convenience state and do not invalidate layout apply.
    }
    await appendAudit(user.id, "workspace.applied", {
      workspaceId: layout.id,
      name: layout.name,
    });
    return NextResponse.json({
      applied: true,
      layout: workspaceLayoutSummary(layout),
      settings: record.settings,
    });
  } catch (reason) {
    return NextResponse.json(
      { error: reason instanceof Error ? reason.message : "Workspace could not be applied." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "Viewer sessions are read-only." }, { status: 403 });
  try {
    const body = await payload(request);
    const id = typeof body.id === "string" ? body.id : "";
    const deleted = await deleteWorkspaceLayout(user.id, id);
    if (!deleted) return NextResponse.json({ error: "Saved workspace was not found." }, { status: 404 });
    await appendAudit(user.id, "workspace.deleted", { workspaceId: id });
    return NextResponse.json({ deleted: true });
  } catch (reason) {
    return NextResponse.json(
      { error: reason instanceof Error ? reason.message : "Workspace could not be deleted." },
      { status: 400 },
    );
  }
}
