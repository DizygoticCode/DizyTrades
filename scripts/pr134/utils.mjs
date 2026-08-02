import { readFile, writeFile, mkdir } from 'node:fs/promises';

export const root = process.cwd();
export const path = (value) => `${root}/${value}`;

export async function replace(file, before, after) {
  const target = path(file);
  const current = await readFile(target, 'utf8');
  if (!current.includes(before)) {
    throw new Error(`Expected source block not found in ${file}: ${before.slice(0, 100)}`);
  }
  await writeFile(target, current.replace(before, after), 'utf8');
}

export async function replaceAllChecked(file, before, after, expectedCount) {
  const target = path(file);
  const current = await readFile(target, 'utf8');
  const count = current.split(before).length - 1;
  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} occurrences in ${file}, found ${count}`);
  }
  await writeFile(target, current.split(before).join(after), 'utf8');
}

export async function write(relativePath, content) {
  const target = path(relativePath);
  await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
  await writeFile(target, content, 'utf8');
}
