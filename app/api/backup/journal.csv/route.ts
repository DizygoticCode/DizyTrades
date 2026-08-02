import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { readJournal } from "../../../lib/journal-store";
import { appendAudit } from "../../../lib/store";
import { journalTradesCsv } from "../../../lib/user-backup-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role === "viewer") {
    return NextResponse.json(
      { error: "Viewer sessions do not own exportable Journal data." },
      { status: 403 },
    );
  }
  const journal = await readJournal(user.id);
  const csv = journalTradesCsv(journal.entries);
  await appendAudit(user.id, "backup.journal-csv-exported", {
    tradeReviews: journal.entries.filter((entry) => entry.trade).length,
    bytes: Buffer.byteLength(csv),
  });
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="dizytrades-journal-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
