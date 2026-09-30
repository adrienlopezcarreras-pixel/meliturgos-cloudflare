import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getSovereigntyWatchCatalog } from '../../src/evaluation/sovereignty-watch-catalog.js';

test('sovereignty watch catalog covers all ten architecture layers',()=>{
  const catalog=getSovereigntyWatchCatalog();
  const layers=catalog.targets.map(x=>x.layer).sort();
  assert.deepEqual(layers,[
    'ai','backup_restore','ci_cd','database','observability',
    'runtime','scheduler','secrets_identity','source_control','storage',
  ]);
  assert.equal(catalog.interval_ms,24*60*60*1000);
});

test('MEL scheduled maintenance runs sovereignty replacement watch internally',async()=>{
  const source=await readFile(new URL('../../src/index.js',import.meta.url),'utf8');
  assert.match(source,/runSovereigntyReplacementWatchRuntime/);
  const scheduled=source.slice(source.indexOf('async scheduled'));
  assert.match(scheduled,/runSovereigntyReplacementWatchRuntime\(env\)/);
});

test('replacement discoveries can never activate directly',async()=>{
  const source=await readFile(new URL('../../src/evaluation/sovereignty-watch-runtime.js',import.meta.url),'utf8');
  assert.match(source,/activation_allowed:false/);
  assert.match(source,/prevalidated:false/);
  assert.match(source,/DISCOVERY_ONLY/);
});
