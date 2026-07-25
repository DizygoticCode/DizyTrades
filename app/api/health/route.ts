import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "dizytrades",
    mode: "test",
    liveTradingEnabled: false,
    checkedAt: new Date().toISOString(),
  });
}
