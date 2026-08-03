import { readFile, writeFile } from "node:fs/promises";

export async function replaceExact(path, from, to) {
  const source = await readFile(path, "utf8");
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing replacement target in ${path}: ${from.slice(0, 180)}`);
  if (source.indexOf(from, first + from.length) >= 0)
    throw new Error(`Replacement target is not unique in ${path}: ${from.slice(0, 180)}`);
  await writeFile(path, source.slice(0, first) + to + source.slice(first + from.length));
}

export async function replaceRegex(path, pattern, replacement) {
  const source = await readFile(path, "utf8");
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1)
    throw new Error(`Expected one match in ${path}, found ${matches.length}: ${pattern}`);
  await writeFile(path, source.replace(pattern, replacement));
}

export async function append(path, content) {
  const source = await readFile(path, "utf8");
  await writeFile(path, `${source.trimEnd()}\n\n${content.trim()}\n`);
}
