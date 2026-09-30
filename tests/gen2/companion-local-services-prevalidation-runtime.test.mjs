import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPANION_LOCAL_SERVICE_SPECS } from '../../src/portability/companion-local-services-prevalidation-runtime.js';

test('local service sovereignty runtime covers scheduler observability and secrets',()=>{
  assert.deepEqual(
    COMPANION_LOCAL_SERVICE_SPECS.map(x=>x.layer).sort(),
    ['observability','scheduler','secrets_identity'].sort(),
  );
});

test('MEL scheduled maintenance delegates local service sovereignty proofs to the unified infrastructure authority',async()=>{
  const source=await readFile(new URL('../../src/index.js',import.meta.url),'utf8');
  const scheduled=source.slice(source.indexOf('async scheduled'));
  assert.match(scheduled,/runCompanionInfrastructurePrevalidationRuntime\(env\)/);
  assert.doesNotMatch(scheduled,/runCompanionLocalServicesPrevalidationRuntime\(env\)/);
});

test('Windows companion implements sandboxed scheduler observability and DPAPI refs',async()=>{
  const source=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  assert.match(source,/function Perform-SovereigntyScheduler/);
  assert.match(source,/windows-task-scheduler/);
  assert.match(source,/function Perform-SovereigntyObservability/);
  assert.match(source,/local-jsonl/);
  assert.match(source,/function Perform-SovereigntySecrets/);
  assert.match(source,/ProtectedData/);
  assert.match(source,/windows-dpapi-metadata-vault/);
});

test('local service proofs remain zero-added-provider-cost candidates only after live adapter proof',async()=>{
  const source=await readFile(new URL('../../src/portability/companion-local-services-prevalidation-runtime.js',import.meta.url),'utf8');
  assert.match(source,/prevalidateInfrastructureAlternative/);
  assert.match(source,/existing-owner-hardware-no-added-service-cost/);
  assert.match(source,/PREVALIDATED/);
  assert.match(source,/BLOCKED/);
});
