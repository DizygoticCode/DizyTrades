type ShutdownCleanup = () => void;

type ShutdownState = {
  cleanups: Set<ShutdownCleanup>;
  listenersInstalled: boolean;
  shuttingDown: boolean;
};

const stateHost = globalThis as typeof globalThis & {
  __dizyTradesServerShutdownStateV1?: ShutdownState;
};

const state =
  stateHost.__dizyTradesServerShutdownStateV1 ??=
    {
      cleanups: new Set<ShutdownCleanup>(),
      listenersInstalled: false,
      shuttingDown: false,
    };

function drainServerShutdownCleanups() {
  if (state.shuttingDown) return;
  state.shuttingDown = true;

  const cleanups = [...state.cleanups];
  state.cleanups.clear();
  console.info("DizyTrades server shutdown drain", { cleanupCount: cleanups.length });
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      console.error("DizyTrades server shutdown cleanup failed", error);
    }
  }
}

function ensureSignalListeners() {
  if (state.listenersInstalled) return;
  state.listenersInstalled = true;
  process.on("SIGTERM", drainServerShutdownCleanups);
  process.on("SIGINT", drainServerShutdownCleanups);
}

export function isServerShuttingDown() {
  return state.shuttingDown;
}

export function registerServerShutdownCleanup(cleanup: ShutdownCleanup) {
  ensureSignalListeners();

  if (state.shuttingDown) {
    cleanup();
    return () => {};
  }

  state.cleanups.add(cleanup);
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    state.cleanups.delete(cleanup);
  };
}
