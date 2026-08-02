import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { collectOperationalDiagnostics } from "../../../lib/operational-diagnostics";
import { canAccessOperations } from "../../../lib/operations-access";
import { appendAudit } from "../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!canAccessOperations(user.role)) {
    return NextResponse.json(
      { error: "Production diagnostics require an owner or admin account." },
      { status: 403 },
    );
  }

  const diagnostics = await collectOperationalDiagnostics();
  await appendAudit(user.id, "diagnostics.viewed", {
    overall: diagnostics.overall,
    storage: diagnostics.storage.state,
  });
  return NextResponse.json(diagnostics, {
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
