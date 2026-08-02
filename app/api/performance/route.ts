import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/auth";
import { aggregatePerformanceDashboard } from "../../lib/performance-dashboard";
import { readJournal } from "../../lib/journal-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHORISED", message: "Unauthorised" } }, { status: 401 });
  const value = new URL(request.url).searchParams.get("archived");
  if (value !== null && value !== "true" && value !== "false") {
    return NextResponse.json({ error: { code: "INVALID_QUERY", message: "archived must be true or false." } }, { status: 400 });
  }
  const record = await readJournal(user.id);
  return NextResponse.json({
    performance: aggregatePerformanceDashboard(record.entries, { includeArchived: value === "true", generatedAt: new Date().toISOString() }),
    readOnly: user.role === "viewer",
  }, { headers: { "cache-control": "private, no-store" } });
}
