import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { validRequestOrigin } from "../../../lib/request-security";
import { appendAudit } from "../../../lib/store";
import { MAX_USER_BACKUP_BYTES } from "../../../lib/user-backup-model";
import {
  applyUserBackupRestore,
  planUserBackupRestore,
} from "../../../lib/user-backup-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role === "viewer") {
    return NextResponse.json(
      { error: "Viewer sessions cannot restore account data." },
      { status: 403 },
    );
  }
  if (!validRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_USER_BACKUP_BYTES + 1_000_000) {
    return NextResponse.json({ error: "Backup request is too large." }, { status: 413 });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_USER_BACKUP_BYTES + 1_000_000) {
    return NextResponse.json({ error: "Backup request is too large." }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Backup request is not valid JSON." }, { status: 400 });
  }

  try {
    const dryRun = body.dryRun === true;
    if (dryRun) {
      const plan = await planUserBackupRestore(user.id, body.backup);
      await appendAudit(user.id, "backup.restore-dry-run", {
        safeToApply: plan.safeToApply,
        conflicts: plan.conflicts.length,
        warnings: plan.warnings.length,
        journalEntriesToAdd: plan.journal.entriesToAdd,
      });
      return NextResponse.json({ dryRun: true, plan }, {
        headers: { "cache-control": "private, no-store, max-age=0" },
      });
    }

    if (body.confirmation !== "RESTORE") {
      return NextResponse.json(
        { error: "Type RESTORE to apply the validated recovery plan." },
        { status: 400 },
      );
    }
    if (typeof body.expectedBackupHash !== "string") {
      return NextResponse.json(
        { error: "Run a dry-run before applying this backup." },
        { status: 400 },
      );
    }
    const result = await applyUserBackupRestore(
      user.id,
      body.backup,
      body.expectedBackupHash,
    );
    await appendAudit(user.id, "backup.restored", {
      backupHash: result.plan.backupHash,
      journalEntries: result.created.journalEntries,
      replayMemories: result.created.replayMemories,
      historicalDizyFlow: result.created.historicalDizyFlow,
      dizyBrainReviews: result.created.dizyBrainReviews,
      profileUpdated: result.profileUpdated,
      manualPaperRestored: result.manualPaperRestored,
    });
    return NextResponse.json(result, {
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Backup restore failed.";
    const conflict = /conflict|already exists|different content|exceed/i.test(message);
    await appendAudit(user.id, "backup.restore-rejected", {
      reason: message.slice(0, 160),
    });
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 400 });
  }
}
