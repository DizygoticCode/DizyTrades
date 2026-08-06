import { cp, mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const copies = [
  ["public", ".next/standalone/public"],
  [".next/static", ".next/standalone/.next/static"],
];

const maxAttempts = 4;

for (const [source] of copies) {
  try {
    const sourceStat = await stat(source);
    if (!sourceStat.isDirectory()) {
      throw new Error("path is not a directory");
    }
  } catch (error) {
    throw new Error(`Required source directory is missing or invalid: ${source}`, {
      cause: error,
    });
  }
}

async function copyDirectoryAtomically(source, destination) {
  await mkdir(dirname(destination), { recursive: true });

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const staging = `${destination}.copying-${process.pid}-${attempt}`;
    await rm(staging, { recursive: true, force: true });

    try {
      await cp(source, staging, { recursive: true, force: true });
      await rm(destination, { recursive: true, force: true });
      await rename(staging, destination);
      return;
    } catch (error) {
      await rm(staging, { recursive: true, force: true });

      if (error?.code !== "ENOENT" || attempt === maxAttempts) {
        throw new Error(
          `Failed to package ${source} after ${attempt} attempt${attempt === 1 ? "" : "s"}`,
          { cause: error },
        );
      }

      console.warn(
        `Generated files changed while packaging ${source}; retrying (${attempt}/${maxAttempts})`,
      );
      await delay(250 * attempt);
    }
  }
}

for (const [source, destination] of copies) {
  await copyDirectoryAtomically(source, destination);
}
