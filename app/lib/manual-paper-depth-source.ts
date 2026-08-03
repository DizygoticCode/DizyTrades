import "server-only";

import {
  DEPTH_STALE_MS,
  acquireDepthCollector,
  releaseDepthCollector,
} from "./order-flow/depth-collector";
import type { DepthEnvelope } from "./order-flow/types";

const usable = (symbol: string, envelope: DepthEnvelope | null, now = Date.now()) =>
  Boolean(
    envelope &&
      envelope.snapshot.symbol === symbol &&
      envelope.snapshot.bids.length &&
      envelope.snapshot.asks.length &&
      now - envelope.receivedAt >= 0 &&
      now - envelope.receivedAt <= DEPTH_STALE_MS,
  );

export async function latestManualPaperDepth(
  symbol: string,
  timeoutMs = 5_500,
): Promise<DepthEnvelope> {
  const collector = acquireDepthCollector(symbol);
  try {
    const current = collector.getLatest();
    if (usable(symbol, current)) return current!;
    return await new Promise<DepthEnvelope>((resolve, reject) => {
      let settled = false;
      const finish = (error: Error | null, value?: DepthEnvelope) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        if (error) reject(error);
        else resolve(value!);
      };
      const unsubscribe = collector.subscribe((envelope) => {
        if (usable(symbol, envelope)) finish(null, envelope);
      });
      const timer = setTimeout(
        () => finish(new Error("Fresh public DizyFlow depth is unavailable.")),
        timeoutMs,
      );
      void collector.poll(false).catch(() => undefined);
    });
  } finally {
    releaseDepthCollector(symbol);
  }
}
