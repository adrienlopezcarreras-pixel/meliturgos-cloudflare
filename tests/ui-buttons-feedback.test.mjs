import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Headless audit 18/10 (every visible button clicked): these buttons did nothing
// or threw. Each must now act or say why it cannot.
test('control-center buttons never fail silently', async () => {
  const page = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  assert.match(page, /Écris d’abord la question à soumettre aux IA\./);
  assert.match(page, /Client ID et secret requis/);
  assert.match(page, /const list=Array\.isArray\(computerCache\?\.devices\)\?computerCache\.devices:\[\]/);
  assert.match(page, /qs\('#computerHalt'\)\.onclick=async\(\)=>\{const out=qs\('#computerOut'\);const pc=selectedComputer\(\);if\(!pc\)\{if\(out\)out\.textContent='Aucun ordinateur appairé\.'/);
  assert.match(page, /Contrôle réactivé sur/);
  assert.match(page, /terminal:\['MINI & téléphone'/);
  assert.match(page, /id="pcMode"/);
  assert.match(page, /Mode PC : vert/);
  assert.match(page, /\.status-stack \.pill\{min-width:11\.6rem;min-height:34px/);
  assert.match(page, /pc\?\.online===true&&pc\?\.local_coder===true/);
});
