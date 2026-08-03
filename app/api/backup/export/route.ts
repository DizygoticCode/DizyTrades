import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { appendAudit } from "../../../lib/store";
import {
  buildUserBackupWithWorkspaces,
  workspaceBackupEncodedBytes,
  workspaceBackupFilename,
} from "../../../lib/user-backup-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role === "viewer") {
    return NextResponse.json(
      { error: "Viewer sessions do not own exportable account data." },
      { status: 403 },
    );
  }

  const backup = await buildUserBackupWithWorkspaces(user.id);
  const encoded = `${JSON.stringify(backup, null, 2)}\n`;
  await appendAudit(user.id, "backup.exported", {
    version: backup.version,
    bytes: workspaceBackupEncodedBytes(backup),
    journalEntries: backup.data.journal.length,
    replayMemories: backup.data.replayMemories.length,
    historicalDizyFlow: backup.data.historicalDizyFlow.length,
    dizyBrainReviews: backup.data.dizyBrainReviews.length,
    workspaceLayouts: backup.data.workspaceLayouts.length,
    warnings: backup.warnings.length,
  });
  return new NextResponse(encoded, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${workspaceBackupFilename(backup)}"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
