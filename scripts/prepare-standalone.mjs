import { cp, mkdir, stat } from "node:fs/promises";

const copies = [
  ["public", ".next/standalone/public"],
  [".next/static", ".next/standalone/.next/static"],
];

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

await mkdir(".next/standalone/.next", { recursive: true });

for (const [source, destination] of copies) {
  await cp(source, destination, { recursive: true, force: true });
}
