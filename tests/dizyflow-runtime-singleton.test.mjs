import assert from "node:assert/strict";
import { test } from "node:test";

const DEPTH_RUNTIME = Symbol.for("dizyflow.depth-collector.runtime.v1");
const TAPE_RUNTIME = Symbol.for("dizyflow.liquidity-tape.runtime.v1");

test("DizyFlow duplicate module evaluations share one process runtime", async () => {
  const priorDepth = globalThis[DEPTH_RUNTIME];
  const priorTape = globalThis[TAPE_RUNTIME];
  const realSetInterval = globalThis.setInterval;
  let diagnosticIntervals = 0;

  delete globalThis[DEPTH_RUNTIME];
  delete globalThis[TAPE_RUNTIME];
  globalThis.setInterval = ((callback, delay, ...args) => {
    if (delay === 30_000) diagnosticIntervals += 1;
    return realSetInterval(callback, delay, ...args);
  });

  try {
    const nonce = `${Date.now()}-${Math.random()}`;
    const depthA = await import(`../app/lib/order-flow/depth-collector.ts?singleton-a=${nonce}`);
    const firstDepthRuntime = globalThis[DEPTH_RUNTIME];
    assert.ok(firstDepthRuntime, "first depth module evaluation must install the process runtime");

    const depthB = await import(`../app/lib/order-flow/depth-collector.ts?singleton-b=${nonce}`);
    assert.equal(
      globalThis[DEPTH_RUNTIME],
      firstDepthRuntime,
      "duplicate depth modules must reuse the same process runtime",
    );
    assert.equal(
      depthA.depthRequestLimiter,
      depthB.depthRequestLimiter,
      "duplicate depth modules must share one REST request limiter",
    );
    assert.equal(diagnosticIntervals, 1, "only one DizyFlow memory diagnostics interval may exist");

    const tapeA = await import(`../app/lib/order-flow/liquidity-tape.ts?singleton-a=${nonce}`);
    const firstTapeRuntime = globalThis[TAPE_RUNTIME];
    assert.ok(firstTapeRuntime, "first liquidity-tape module evaluation must install the process runtime");
    const tapeB = await import(`../app/lib/order-flow/liquidity-tape.ts?singleton-b=${nonce}`);
    assert.equal(
      globalThis[TAPE_RUNTIME],
      firstTapeRuntime,
      "duplicate liquidity-tape modules must reuse the same process runtime",
    );
    assert.equal(typeof tapeA.liquidityTapeDiagnostics, "function");
    assert.equal(typeof tapeB.liquidityTapeDiagnostics, "function");
  } finally {
    const depthRuntime = globalThis[DEPTH_RUNTIME];
    if (depthRuntime?.diagnostics) clearInterval(depthRuntime.diagnostics);
    delete globalThis[DEPTH_RUNTIME];
    delete globalThis[TAPE_RUNTIME];
    if (priorDepth !== undefined) globalThis[DEPTH_RUNTIME] = priorDepth;
    if (priorTape !== undefined) globalThis[TAPE_RUNTIME] = priorTape;
    globalThis.setInterval = realSetInterval;
  }
});
