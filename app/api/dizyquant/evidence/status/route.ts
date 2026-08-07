import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../../lib/auth";
import { readDizyQuantCampaignRecorderServiceStatus } from "../../../../../lib/dizyquant/campaign-recorder-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!(await requireApiUser())) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(readDizyQuantCampaignRecorderServiceStatus(), {
    headers: { "cache-control": "private, no-store" },
  });
}
