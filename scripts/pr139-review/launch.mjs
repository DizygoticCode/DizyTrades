import { readFile, writeFile } from "node:fs/promises";

const source = await readFile(new URL("./apply.mjs", import.meta.url), "utf8");
const fixed = source
  .replace(
    "/export async function partialCloseManualPosition\\(.*?\\}\\)\\nexport async function reverseManualPosition/s,",
    "/export async function partialCloseManualPosition.*?\\nexport async function reverseManualPosition/s,",
  )
  .replace(
    "/export async function reverseManualPosition\\(.*?\\}\\)\\n\\nexport async function attachManualHistoricalDizyFlow/s,",
    "/export async function reverseManualPosition.*?\\n\\nexport async function attachManualHistoricalDizyFlow/s,",
  );
if (fixed === source) throw new Error("Funding review function anchors were not updated.");
await writeFile(new URL("./apply-runtime.mjs", import.meta.url), fixed);
await import("./apply-runtime.mjs");
