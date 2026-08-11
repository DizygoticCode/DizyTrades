import { requireApiUser } from "../../../../lib/auth";
import { buildDizyQuantCampaignStudyExport } from "../../../../lib/dizyquant/campaign-study-export";
import { readDizyQuantCampaignRecorderState } from "../../../../lib/dizyquant/campaign-recorder-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await requireApiUser();
  if (!user) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (user.role !== "owner") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const state = await readDizyQuantCampaignRecorderState();
    const study = buildDizyQuantCampaignStudyExport(state);
    return new Response(`${JSON.stringify(study, null, 2)}\n`, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": "attachment; filename=\"dizyquant-representative-v1-study.json\"",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "DizyQuant campaign evidence is unavailable" },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  }
}
