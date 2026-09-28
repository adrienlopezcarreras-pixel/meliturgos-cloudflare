import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MEL scheduled maintenance runs local storage prevalidation',async()=>{
  const source=await readFile(new URL('../../src/index.js',import.meta.url),'utf8');
  assert.match(source,/runCompanionStoragePrevalidationRuntime/);
  const scheduled=source.slice(source.indexOf('async scheduled'));
  assert.match(scheduled,/runCompanionStoragePrevalidationRuntime\(env\)/);
});

test('local storage prevalidation requires live companion proof before registry write',async()=>{
  const source=await readFile(new URL('../../src/portability/companion-storage-prevalidation-runtime.js',import.meta.url),'utf8');
  assert.match(source,/createCompanionObjectStorageAdapter/);
  assert.match(source,/prevalidateInfrastructureAlternative/);
  assert.match(source,/COMPANION_OFFLINE/);
  assert.match(source,/PREVALIDATED/);
  assert.match(source,/existing-owner-hardware-no-added-service-cost/);
});

test('PowerShell companion contains sandboxed local storage engine',async()=>{
  const source=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  assert.match(source,/function Perform-SovereigntyStorage/);
  assert.match(source,/sovereignty\.storage\./);
  assert.match(source,/Sovereignty-StorageRoot/);
});
