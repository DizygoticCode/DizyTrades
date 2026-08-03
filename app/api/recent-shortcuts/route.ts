import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/auth";
import { readRecentMarketShortcuts } from "../../lib/recent-shortcuts-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (user.role === "viewer") {
    return NextResponse.json({ readOnly: true, markets: [] }, {
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  }
  return NextResponse.json(
    {
      readOnly: false,
      markets: await readRecentMarketShortcuts(user.id),
    },
    { headers: { "cache-control": "private, no-store, max-age=0" } },
  );
}
