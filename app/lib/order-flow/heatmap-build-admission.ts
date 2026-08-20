type HeatmapTileBuildRelease = () => void;

type HeatmapTileBuildWaiter = {
  resolve: (release: HeatmapTileBuildRelease) => void;
  reject: (reason: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

const admission = {
  active: false,
  queue: [] as HeatmapTileBuildWaiter[],
};

function requestAbortError(signal: AbortSignal) {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("Heatmap tile build request aborted");
  error.name = "AbortError";
  return error;
}

function removeAbortListener(waiter: HeatmapTileBuildWaiter) {
  if (waiter.signal && waiter.onAbort) {
    waiter.signal.removeEventListener("abort", waiter.onAbort);
  }
}

function createRelease(): HeatmapTileBuildRelease {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    admission.active = false;
    admitNext();
  };
}

function admitNext() {
  while (!admission.active) {
    const waiter = admission.queue.shift();
    if (!waiter) return;
    removeAbortListener(waiter);
    if (waiter.signal?.aborted) {
      waiter.reject(requestAbortError(waiter.signal));
      continue;
    }
    admission.active = true;
    waiter.resolve(createRelease());
    return;
  }
}

export function acquireHeatmapTileBuild(
  signal?: AbortSignal,
): Promise<HeatmapTileBuildRelease> {
  if (signal?.aborted) return Promise.reject(requestAbortError(signal));
  if (!admission.active && admission.queue.length === 0) {
    admission.active = true;
    return Promise.resolve(createRelease());
  }

  return new Promise((resolve, reject) => {
    const waiter: HeatmapTileBuildWaiter = { resolve, reject, signal };
    const onAbort = () => {
      const index = admission.queue.indexOf(waiter);
      if (index < 0) return;
      admission.queue.splice(index, 1);
      removeAbortListener(waiter);
      reject(requestAbortError(signal!));
      admitNext();
    };
    waiter.onAbort = onAbort;
    signal?.addEventListener("abort", onAbort, { once: true });
    admission.queue.push(waiter);
    if (signal?.aborted) onAbort();
    admitNext();
  });
}

export function throwIfHeatmapTileBuildAborted(signal: AbortSignal) {
  if (signal.aborted) throw requestAbortError(signal);
}
