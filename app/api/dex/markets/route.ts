import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/auth";
import { mergeCanonicalDizyMarkets } from "../../../lib/dex/dizy";
import { documentedDexProvider } from "../../../lib/dex/providers";
import type { DexChain } from "../../../lib/dex/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await requireApiUser()) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const p = new URL(request.url).searchParams;
  const query = (p.get("query") ?? "").trim();
  const chain = (p.get("chain") || undefined) as DexChain | undefined;
  if (query.length > 100 || !(!chain || chain === "solana" || chain === "bsc")) {
    return NextResponse.json({ error: "Invalid DEX discovery query." }, { status: 400 });
  }
  try {
    const page = await documentedDexProvider.discover({ query, chain, cursor: p.get("cursor") ?? undefined }, AbortSignal.timeout(6500));
    return NextResponse.json({ ...page, markets: mergeCanonicalDizyMarkets(page.markets, query, chain) });
  } catch (error) {
    const markets = mergeCanonicalDizyMarkets([], query, chain);
    return NextResponse.json({
      markets,
      provider: documentedDexProvider.id,
      degraded: error instanceof Error ? error.message : "Provider unavailable",
      receivedAt: 0,
    }, { status: markets.length ? 200 : 503 });
  }
}
