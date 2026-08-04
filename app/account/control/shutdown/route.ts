import { NextRequest, NextResponse } from "next/server";

import { requireApiUser } from "../../../lib/auth";
import { sealOwnerMexcConnection } from "../../../lib/mexc-owner-connection-control";

export const dynamic = "force-dynamic";

function redirectResult(request: NextRequest, result: string, audit?: string) {
  const target = new URL("/account/control", request.url);
  target.searchParams.set("result", result);
  if (audit) target.searchParams.set("audit", audit);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "Owner access required." }, { status: 403 });

  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const confirmation = String(form.get("confirmation") ?? "");
    const operatorReason = String(form.get("operatorReason") ?? "");
    const shutdown = await sealOwnerMexcConnection({
      userId: user.id,
      confirmation,
      operatorReason,
    });
    return redirectResult(
      request,
      "sealed",
      shutdown.audit && !shutdown.auditFailure ? "recorded" : "failed",
    );
  } catch {
    return redirectResult(request, "error");
  }
}
