import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MEL scheduled maintenance runs dependency longevity watch inside the Worker runtime', async()=>{
  const source=await readFile(new URL('../../src/index.js',import.meta.url),'utf8');
  assert.match(source,/runDependencyLongevityWatchRuntime/);
  const scheduled=source.slice(source.indexOf('async scheduled'));
  assert.match(scheduled,/runDependencyLongevityWatchRuntime\(env\)/);
  assert.match(scheduled,/runShardVaultCycle\(env\)/);
});

test('longevity watch is not dependent on GitHub Actions for execution', async()=>{
  const source=await readFile(new URL('../../src/evaluation/dependency-longevity-watch-runtime.js',import.meta.url),'utf8');
  assert.match(source,/createGen2Runtime/);
  assert.match(source,/web\.research/);
  assert.match(source,/capability_watch_state/);
  assert.doesNotMatch(source,/github\.com\/actions/);
});

test('default longevity interval is six hours', async()=>{
  const source=await readFile(new URL('../../src/evaluation/dependency-longevity-watch-runtime.js',import.meta.url),'utf8');
  assert.match(source,/DEFAULT_INTERVAL_MS=6\*60\*60\*1000/);
});
