import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MEL scheduled maintenance includes alternate AI prevalidation runtime',async()=>{
  const source=await readFile(new URL('../../src/index.js',import.meta.url),'utf8');
  assert.match(source,/runAiAlternativePrevalidationRuntime/);
  const scheduled=source.slice(source.indexOf('async scheduled'));
  assert.match(scheduled,/runAiAlternativePrevalidationRuntime\(env\)/);
});

test('alternate AI runtime persists proofs instead of relying on process memory',async()=>{
  const source=await readFile(new URL('../../src/portability/ai-alternative-prevalidation-runtime.js',import.meta.url),'utf8');
  assert.match(source,/D1AlternativeRegistryStore/);
  assert.match(source,/mel_sovereignty_runtime_state/);
  assert.match(source,/store\.save\(result\.registry\)/);
});

test('alternate AI runtime never runs when no provider is configured',async()=>{
  const source=await readFile(new URL('../../src/portability/ai-alternative-prevalidation-runtime.js',import.meta.url),'utf8');
  assert.match(source,/NO_ALTERNATE_AI_CONFIG/);
});
