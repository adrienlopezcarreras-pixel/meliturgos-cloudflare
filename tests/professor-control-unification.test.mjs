import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Professor exposes one canonical manual cycle control', async () => {
  const [controls, learning, ui] = await Promise.all([
    read('src/pages/full-mode-control-enhancer.js'),
    read('src/learning-entry.js'),
    read('src/ui-entry.js'),
  ]);
  assert.match(controls, /id="melFullCycle"/);
  assert.match(controls, /\/api\/gen2\/autonomy\/tick/);
  assert.match(controls, /MAX 100%[\s\S]*melFullCycle[\s\S]*STOP[\s\S]*Activité/);
  const page = await read('src/pages/full-interface-v2.js');
  assert.doesNotMatch(page, /id="melStartCycleTop"/);
  assert.doesNotMatch(page, /id="autonomyTick"/);
  assert.doesNotMatch(page, /id="autonomyToggle"/);
  assert.doesNotMatch(learning, /id="melLiveTick"/);
  assert.doesNotMatch(ui, /id="melResolvePassive"/);
  assert.doesNotMatch(learning, /melRecallMvp|Rappeler la dernière conversation/);
  assert.doesNotMatch(learning, /melLiveNav|Visualisation live|melLiveLog/);
  assert.doesNotMatch(learning, /setInterval\([^\n]*4000/);
});

test('IA and Development unification preserves the Work panel runtime', async () => {
  const learning = await read('src/learning-entry.js');
  assert.match(learning, /dev\.appendChild\(work\)/);
  assert.doesNotMatch(learning, /work\.remove\(\)/);
  assert.match(learning, /work\.style\.display='block'/);
});

test('Professor visible controls are wired to real route implementations', async () => {
  const [page, controls, autonomy, dev, index] = await Promise.all([
    read('src/pages/full-interface-v2.js'),
    read('src/pages/full-mode-control-enhancer.js'),
    read('src/evolution/autonomy-api.js'),
    read('src/dev/runtime-api.js'),
    read('src/index.js'),
  ]);
  for (const id of ['chatSend','refreshSkills','multiRun','workCreate','workRefresh','memoryRefresh','chatgptImport','codeSelfCheck','diagCaps','diagRoadmap','diagAug']) {
    assert.match(page, new RegExp("(?:qs\\('#"+id+"'\\)|getElementById\\('"+id+"'\\))\\.onclick"));
  }
  for (const id of ['melFullMax','melFullCycle','melFullStop','melFullActivity','melFullActivityClose','melFullActivityRefresh']) {
    assert.match(controls, new RegExp("getElementById\\('"+id+"'\\)\\.onclick"));
  }
  for (const route of ['/api/gen2/autonomy/state','/api/gen2/autonomy/tick','/api/gen2/autonomy/max','/api/gen2/autonomy/pause','/api/gen2/autonomy/resume']) assert.ok(autonomy.includes(route), route);
  for (const route of ['/api/professor/dev/status','/api/professor/dev/jobs']) assert.ok(dev.includes(route), route);
  for (const route of ['/api/dev-bridge/health','/api/dev-bridge/jobs','/api/memory/status','/api/import/chatgpt-context']) assert.ok(index.includes(route), route);
});
