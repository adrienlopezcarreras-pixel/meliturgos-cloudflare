import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the MAX button waits for the launch preparation instead of aborting at 45 s', async () => {
  const page = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  const fn = page.slice(page.indexOf('function requestTimeoutMs'), page.indexOf('function apiErrorMessage'));
  const requestTimeoutMs = new Function(fn + '\nreturn requestTimeoutMs;')();
  assert.equal(requestTimeoutMs('/api/gen2/autonomy/max', 'POST'), 240000);
  assert.equal(requestTimeoutMs('/api/gen2/autonomy/pause', 'POST'), 45000);
  assert.match(page, /préparation du lancement \(sauvegarde et synchronisation, jusqu’à 4 min\)/);
});
