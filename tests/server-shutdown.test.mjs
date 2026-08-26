import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const helperPath = path.join(root, 'app/lib/server-shutdown.ts');
const launcherPath = path.join(root, 'scripts/server-launch.cjs');

async function optionalImport(filePath) {
  try {
    return await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);
  } catch {
    return null;
  }
}

test('server shutdown registry drains registered cleanup callbacks once on duplicate SIGTERM', async () => {
  const helper = await optionalImport(helperPath);
  assert.equal(typeof helper?.registerServerShutdownCleanup, 'function');

  const probe = `
    import { registerServerShutdownCleanup } from ${JSON.stringify(pathToFileURL(helperPath).href)};
    let count = 0;
    registerServerShutdownCleanup(() => { count += 1; console.log('cleanup:' + count); });
    process.kill(process.pid, 'SIGTERM');
    process.kill(process.pid, 'SIGTERM');
    setTimeout(() => process.exit(count === 1 ? 0 : 2), 25);
  `;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', probe], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /cleanup:1/);
  assert.doesNotMatch(result.stdout, /cleanup:2/);
});

test('all long-lived SSE routes register and unregister shutdown cleanup', async () => {
  for (const relative of [
    'app/api/dizyflow/dom/stream/route.ts',
    'app/api/dizyflow/heatmap/stream/route.ts',
    'app/api/dizyquant/evidence/stream/route.ts',
  ]) {
    const source = await readFile(path.join(root, relative), 'utf8');
    assert.match(source, /registerServerShutdownCleanup/);
    assert.match(source, /unregisterShutdownCleanup\(\)/);
  }
});

test('tracked launcher normalizes only expected signal-driven Next exit codes', async () => {
  const launcher = await optionalImport(launcherPath);
  assert.equal(typeof launcher?.normaliseChildExitCode, 'function');
  assert.equal(launcher.normaliseChildExitCode(143, null, 'SIGTERM'), 0);
  assert.equal(launcher.normaliseChildExitCode(130, null, 'SIGINT'), 0);
  assert.equal(launcher.normaliseChildExitCode(143, null, null), 143);
  assert.equal(launcher.normaliseChildExitCode(1, null, 'SIGTERM'), 1);
});
