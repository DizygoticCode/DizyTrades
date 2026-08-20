import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireHeatmapTileBuild,
  throwIfHeatmapTileBuildAborted,
} from "../app/lib/order-flow/heatmap-build-admission.ts";

test("heatmap tile build admission serializes uncached work and withdraws queued aborts", async () => {
  const runningController = new AbortController();
  const releaseRunning = await acquireHeatmapTileBuild(runningController.signal);

  let replacementAdmitted = false;
  const replacement = acquireHeatmapTileBuild().then((release) => {
    replacementAdmitted = true;
    return release;
  });
  await Promise.resolve();
  assert.equal(replacementAdmitted, false);

  runningController.abort();
  assert.throws(
    () => throwIfHeatmapTileBuildAborted(runningController.signal),
    { name: "AbortError" },
  );
  await Promise.resolve();
  assert.equal(
    replacementAdmitted,
    false,
    "aborting running work must not release its memory admission early",
  );

  releaseRunning();
  const releaseReplacement = await replacement;
  assert.equal(replacementAdmitted, true);

  const queuedController = new AbortController();
  const queued = acquireHeatmapTileBuild(queuedController.signal);
  queuedController.abort();
  await assert.rejects(queued, { name: "AbortError" });

  releaseReplacement();
  const releaseFinal = await acquireHeatmapTileBuild();
  releaseFinal();
});
