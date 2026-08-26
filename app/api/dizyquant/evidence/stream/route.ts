import { requireApiUser } from "../../../../lib/auth";
import {
  isServerShuttingDown,
  registerServerShutdownCleanup,
} from "../../../../lib/server-shutdown";
import {
  isDizyQuantRuntimeCampaignSymbol,
  readDizyQuantCampaignDepthPublication,
  subscribeDizyQuantCampaignDepthPublications,
} from "../../../../lib/dizyquant/campaign-runtime-feed";
import { readDizyQuantCampaignRecorderServiceStatus } from "../../../../lib/dizyquant/campaign-recorder-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encode = (event: string, value: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
const normalise = (value: string) => value.trim().toUpperCase().replace(/[-/]/g, "_");

export async function GET(request: Request) {
  if (isServerShuttingDown()) {
    return new Response("Service shutting down", { status: 503 });
  }
  if (!(await requireApiUser())) return new Response("Unauthorised", { status: 401 });
  if (isServerShuttingDown()) {
    return new Response("Service shutting down", { status: 503 });
  }
  const symbol = normalise(new URL(request.url).searchParams.get("symbol") ?? "");
  if (!isDizyQuantRuntimeCampaignSymbol(symbol)) {
    return new Response("Symbol is outside the initial DizyQuant campaign", { status: 400 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  let flush = () => {};
  let unregisterShutdownCleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let pending: string | null = null;
      let flushing = false;

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

      const service = readDizyQuantCampaignRecorderServiceStatus();
      send("metadata", {
        symbol,
        mode: "process-owned-rotating-campaign",
        activeSymbol: service.activeSymbol,
        residency: service.residency,
        phase: service.phase,
        researchOnly: true,
      });
      const existing = readDizyQuantCampaignDepthPublication(symbol);
      if (existing) send("evidence", existing);
      const unsubscribe = subscribeDizyQuantCampaignDepthPublications((publication) => {
        if (publication.symbol === symbol) send("evidence", publication);
      });
      const keepalive = setInterval(() => send("keepalive", { symbol }), 15_000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        unregisterShutdownCleanup();
        pending = null;
        flush = () => {};
        clearInterval(keepalive);
        unsubscribe();
        request.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {}
      };
      unregisterShutdownCleanup = registerServerShutdownCleanup(cleanup);
      if (!closed) request.signal.addEventListener("abort", cleanup, { once: true });
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
