import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ecosystem watch is wired once into schedule, API and full-mode activity', async () => {
  const index = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../src/ui-entry.js', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../src/pages/full-mode-control-enhancer.js', import.meta.url), 'utf8');

  assert.match(index, /runEcosystemCapabilityWatch/);
  assert.match(ui, /\/api\/mel\/capability-watch/);
  assert.match(panel, /Veille IA, plugins & arts/);
  assert.equal((index.match(/runEcosystemCapabilityWatch\(env\)/g) || []).length, 1);
});
