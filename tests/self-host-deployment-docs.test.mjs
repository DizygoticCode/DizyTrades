import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const agentsSource = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');

test('agent deployment guidance reflects the self-hosted production contract', () => {
  assert.doesNotMatch(agentsSource, /\bRender\b/i);
  assert.doesNotMatch(agentsSource, /render\.ya?ml/i);
  assert.match(agentsSource, /self-hosted/i);
  assert.match(agentsSource, /exact green SHA/i);
  assert.match(agentsSource, /systemd/i);
  assert.match(agentsSource, /Caddy/i);
});
