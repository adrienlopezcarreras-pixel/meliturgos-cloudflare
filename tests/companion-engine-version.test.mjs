import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CURRENT_COMPANION_ENGINE_VERSION } from '../src/devices/computer-companion-api.js';

test('the served Companion engine announces the version the server expects', async () => {
  for (const file of ['assets/MEL-Computer-Companion.ps1', 'dist/MEL-Computer-Companion.ps1']) {
    const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    const version = source.match(/^\$Version = "([^"]+)"/m)?.[1];
    assert.equal(version, CURRENT_COMPANION_ENGINE_VERSION, file + ' must match CURRENT_COMPANION_ENGINE_VERSION, or installed PCs never refresh');
  }
});

test('an installed engine older than the served one is told to refresh itself', async () => {
  const source = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.match(source, /engineUpdateRequired=!versionAtLeast\(engineVersion,CURRENT_COMPANION_ENGINE_VERSION\)/);
});
