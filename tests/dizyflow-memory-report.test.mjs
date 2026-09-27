import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readMemorySamples, summarizeMemorySamples } from '../scripts/dizyflow-memory-report.mjs';

const lines = (s) => s.trim().split('\n');
test('parses bounded numeric memory snapshots from the production log shape', async () => {
  const snapshots = await readMemorySamples(lines(`
[DIZYTRADES] DizyFlow memory {
[DIZYTRADES]   rssMb: 763,
[DIZYTRADES]   heapMb: 413,
[DIZYTRADES]   collectors: 2,
[DIZYTRADES]   subscribers: 1,
[DIZYTRADES] }
[DIZYTRADES] Error: noise
[DIZYTRADES] DizyFlow memory {
[DIZYTRADES]   rssMb: 740,
[DIZYTRADES]   heapMb: 388,
[DIZYTRADES]   collectors: 1,
[DIZYTRADES]   subscribers: 0,
[DIZYTRADES] }
`), 1);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].rssMb, 740);
  const all = await readMemorySamples(lines(`
[DIZYTRADES] DizyFlow memory {
[DIZYTRADES]   rssMb: 763,
[DIZYTRADES]   heapMb: 413,
[DIZYTRADES] }
[DIZYTRADES] DizyFlow memory {
[DIZYTRADES]   rssMb: 740,
[DIZYTRADES]   heapMb: 388,
[DIZYTRADES] }
`));
  assert.deepEqual(summarizeMemorySamples(all).rssMb, { first: 763, last: 740, min: 740, max: 763 });
  assert.equal(summarizeMemorySamples(all).rssDeltaMb, -23);
  assert.equal(summarizeMemorySamples([]).samples, 0);
  await assert.rejects(readMemorySamples([], 0), /sample cap/);
});

test('edge example is scoped and omits request headers/query', async () => {
  const caddy = await readFile(new URL('../deploy/caddy/dizytrades-public.Caddyfile', import.meta.url), 'utf8');
  assert.match(caddy, /request>headers delete/);
  assert.match(caddy, /request>uri delete/);
  assert.match(caddy, /header_regexp Next-Action/);
  assert.match(caddy, /respond @short_action 400/);
  assert.doesNotMatch(caddy, /dizychat\.com/);
});
