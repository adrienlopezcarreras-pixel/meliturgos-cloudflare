import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');


test('IA and Development unification preserves the Work panel runtime', async () => {
  const page = await read('src/pages/full-interface-v2.js');
  assert.match(page, /id="melUnifiedTabs"/);
  assert.match(page, /data-mode-panel="development" hidden/);
  assert.doesNotMatch(page, /data-panel="work"/);
  assert.doesNotMatch(page, /mel-control-center-runtime|dev\.appendChild\(work\)/);
  assert.match(page, /if\(development\)\{await loadWork\(\)/);
});
