import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('portable installer and publication privacy checks', () => {
  const python = process.env.GRILL_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const result = spawnSync(python, ['-X', 'utf8', fileURLToPath(new URL('../scripts/test_tools.py', import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.error, undefined, 'Python 3.11+ is required for installer tests.');
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
