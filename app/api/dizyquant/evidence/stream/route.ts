import { requireApiUser } from "../../../../lib/auth";
import {
  acquireDepthCollector,
  normalizeDepthSymbol,
  releaseDepthCollector,
} from "../../../../lib/order-flow/depth-collector";
import { getMexcMarkets } from "../../../../lib/market/mexc";
import { DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS } from "../../../../lib/dizyquant/evidence-campaign";
import {
  DizyQuantCampaignDepthRuntime,
  inferDizyQuantCampaignPriceStep,
} from "../../../../lib/dizyquant/campaign-depth-runtime";
import type { DepthEnvelope } from "../../../../lib/order-flow/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encode = (event: string, value: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
const initialCampaignSymbol = (value: string) =>
  DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS.some((symbol) => symbol === value);

export async function GET(request: Request) {
  if (!(await requireApiUser())) return new Response("Unauthorised", { status: 401 });
  const symbol = normalizeDepthSymbol(new URL(request.url).searchParams.get("symbol") ?? "");
  if (!symbol || !initialCampaignSymbol(symbol)) {
    return new Response("Symbol is outside the initial DizyQuant campaign", { status: 400 });
  }

  const markets = await getMexcMarkets(request.signal).catch(() => []);
  const market = markets.find(
    (value) => value.marketType === "futures" && value.sourceSymbol === symbol,
  );
  if (!market || !Number.isFinite(market.contractSize) || (market.contractSize ?? 0) <= 0) {
    return new Response("DizyQuant campaign market metadata unavailable", { status: 503 });
  }

  let collector;
  try {
    collector = acquireDepthCollector(symbol);
  } catch {
    return new Response("Depth collector capacity reached", { status: 503 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  let flush = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let pending: string | null = null;
      let flushing = false;
      let campaign: DizyQuantCampaignDepthRuntime | null = null;

      flush = () => {
        flushing = false;
        if (
          closed ||
          !pending ||
          (controller.desiredSize !== null && controller.desiredSize <= 0)
        ) return;
        const value = pending;
        pending = null;
        controller.enqueue(encoder.encode(value));
      };
      const send = (event: string, value: unknown) => {
        if (closed) return;
        pending = encode(event, value);
        if (!flushing) {
          flushing = true;
          queueMicrotask(flush);
        }
      };
      const processEnvelope = (envelope: DepthEnvelope) => {
        if (closed || envelope.snapshot.symbol !== symbol) return;
        try {
          if (!campaign) {
            const priceStep = inferDizyQuantCampaignPriceStep(
              envelope.snapshot,
              market.priceUnit,
            );
            if (priceStep === null) return;
            campaign = new DizyQuantCampaignDepthRuntime({
              symbol,
              contractSize: market.contractSize!,
              priceStep,
            });
            send("metadata", {
              symbol,
              contractSize: market.contractSize,
              priceStep,
              researchOnly: true,
              campaignSymbols: DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS,
            });
          }
          const publication = campaign.push(envelope);
          if (publication) send("evidence", publication);
        } catch {
          campaign?.clear();
          send("resync", { symbol, reason: "research-window-reset" });
        }
      };

      const latest = collector.getLatest();
      if (latest) processEnvelope(latest);
      const unsubscribe = collector.subscribe(processEnvelope);
      const keepalive = setInterval(() => send("keepalive", { symbol }), 15_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        pending = null;
        flush = () => {};
        clearInterval(keepalive);
        unsubscribe();
        releaseDepthCollector(symbol);
        request.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    pull() {
      flush();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
