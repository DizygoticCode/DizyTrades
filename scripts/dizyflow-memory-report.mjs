#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

export async function readMemorySamples(lines, maxSamples = 1000) {
  if (!Number.isSafeInteger(maxSamples) || maxSamples < 1 || maxSamples > 100_000) {
    throw new Error('Invalid memory sample cap');
  }
  const samples = [];
  let current = null;
  for await (const line of lines) {
    if (line.includes('DizyFlow memory {')) {
      current = {};
      continue;
    }
    if (!current) continue;
    const match = line.match(/\b(rssMb|heapMb|externalMb|collectors|subscribers|heatmapRecords):\s*(\d+(?:\.\d+)?)/);
    if (match) current[match[1]] = Number(match[2]);
    if (line.includes('}')) {
      if (Number.isFinite(current.rssMb) && Number.isFinite(current.heapMb)) {
        samples.push(current);
        if (samples.length > maxSamples) samples.shift();
      }
      current = null;
    }
  }
  return samples;
}

export function summarizeMemorySamples(samples) {
  if (!samples.length) return { samples: 0, message: 'No complete DizyFlow memory snapshots in this file' };
  const values = (key) => samples.map((x) => x[key]).filter(Number.isFinite);
  const summary = (key) => {
    const n = values(key);
    return n.length ? { first: n[0], last: n.at(-1), min: Math.min(...n), max: Math.max(...n) } : null;
  };
  const rss = summary('rssMb');
  return {
    samples: samples.length,
    rssMb: rss,
    rssDeltaMb: Number((rss.last - rss.first).toFixed(1)),
    heapMb: summary('heapMb'),
    collectors: summary('collectors'),
    subscribers: summary('subscribers'),
    heatmapRecords: summary('heatmapRecords'),
    interpretation: 'A trend is not proof of a leak; compare equal loads and idle recovery across several windows.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filename = process.argv[2] || '/home/dizy/dizy-live-monitor.log';
  try {
    const lines = createInterface({ input: createReadStream(filename), crlfDelay: Infinity });
    const samples = await readMemorySamples(lines);
    console.log(JSON.stringify(summarizeMemorySamples(samples), null, 2));
  } catch (err) {
    console.error('DizyFlow memory report:', err.message);
    process.exitCode = 1;
  }
}
