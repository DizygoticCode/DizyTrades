import { readFile, writeFile } from "node:fs/promises";

export async function replaceExact(path, from, to) {
  const source = await readFile(path, "utf8");
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing replacement target in ${path}: ${from.slice(0, 180)}`);
  if (source.indexOf(from, first + from.length) >= 0)
    throw new Error(`Replacement target is not unique in ${path}: ${from.slice(0, 180)}`);
  await writeFile(path, source.slice(0, first) + to + source.slice(first + from.length));
}

export async function append(path, content) {
  const source = await readFile(path, "utf8");
  await writeFile(path, `${source.trimEnd()}\n\n${content.trim()}\n`);
}
