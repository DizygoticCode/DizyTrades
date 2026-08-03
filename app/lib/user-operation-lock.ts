import "server-only";

const queues = new Map<string, Promise<unknown>>();

const safeKey = (value: string) => {
  if (!/^[a-z0-9_-]{1,120}$/i.test(value)) {
    throw new Error("Invalid user operation identifier.");
  }
  return value;
};

export async function serialUserOperation<T>(
  userId: string,
  operation: () => Promise<T>,
) {
  const key = safeKey(userId);
  const prior = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = prior.then(() => gate);
  queues.set(key, current);
  await prior;
  try {
    return await operation();
  } finally {
    release();
    if (queues.get(key) === current) queues.delete(key);
  }
}
