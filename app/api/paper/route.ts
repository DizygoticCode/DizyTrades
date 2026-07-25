import { NextResponse } from "next/server";
import type { BacktestSummary } from "../../lib/backtest";
import { requireApiUser } from "../../lib/auth";
import { appendAudit, savePaperRun } from "../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validSummary = (value: unknown): value is BacktestSummary => {
  if (!value || typeof value !== "object") return false;
  const summary = value as Record<string, unknown>;
  return [
    "initialEquity",
    "endingEquity",
    "returnPct",
    "maxDrawdownPct",
    "trades",
    "wins",
    "winRatePct",
  ].every((key) => typeof summary[key] === "number" && Number.isFinite(summary[key]));
};

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const payload = await request.json() as {
    symbol?: string;
    timeframe?: string;
    summary?: unknown;
  };
  if (!payload.symbol || !payload.timeframe || !validSummary(payload.summary)) {
    return NextResponse.json({ error: "Invalid paper-run payload." }, { status: 400 });
  }
  const run = await savePaperRun(user.id, {
    symbol: payload.symbol,
    timeframe: payload.timeframe,
    summary: payload.summary,
  });
  await appendAudit(user.id, "paper.snapshot", {
    symbol: payload.symbol,
    timeframe: payload.timeframe,
    returnPct: payload.summary.returnPct,
    trades: payload.summary.trades,
  });
  return NextResponse.json({ ok: true, run });
}
