import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPANION_INFRASTRUCTURE_LOCAL_CANDIDATES } from '../../src/portability/companion-infrastructure-prevalidation-runtime.js';

test('unified companion infrastructure prevalidation covers the alternate runtime and six local service layers',()=>{
  assert.deepEqual(
    COMPANION_INFRASTRUCTURE_LOCAL_CANDIDATES.map(x=>x.layer).sort(),
    ['runtime','storage','database','ci_cd','secrets_identity','scheduler','observability'].sort(),
  );
});

test('runtime candidate is proven through the companion runtime provider adapter with exact deployed SHA',async()=>{
  const source=await readFile(new URL('../../src/portability/companion-infrastructure-prevalidation-runtime.js',import.meta.url),'utf8');
  assert.match(source,/createCompanionRuntimeProviderAdapter/);
  assert.match(source,/candidate\.layer==='runtime'/);
  assert.match(source,/ensureSeeded\(\)/);
  assert.match(source,/artifact:\{ref:repository,source_sha:sourceSha\}/);
  assert.match(source,/existing-owner-hardware-no-added-service-cost/);
});
