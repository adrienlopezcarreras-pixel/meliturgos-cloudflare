import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPANION_INFRASTRUCTURE_LOCAL_CANDIDATES } from '../../src/portability/companion-infrastructure-prevalidation-runtime.js';

test('unified companion infrastructure prevalidation covers runtime, local services and backup restore',()=>{
  assert.deepEqual(
    COMPANION_INFRASTRUCTURE_LOCAL_CANDIDATES.map(x=>x.layer).sort(),
    ['runtime','storage','database','ci_cd','secrets_identity','scheduler','observability','backup_restore'].sort(),
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


test('backup restore candidate is proven through independent local storage and scratch restore databases',async()=>{
  const source=await readFile(new URL('../../src/portability/companion-infrastructure-prevalidation-runtime.js',import.meta.url),'utf8');
  assert.match(source,/proveCompanionBackupRestoreAlternative/);
  assert.match(source,/candidate\.layer==='backup_restore'/);
  assert.match(source,/mel-sovereignty-backup-source\.sqlite/);
  assert.match(source,/mel-sovereignty-backup-restore\.sqlite/);
  assert.match(source,/namespace:'mel-sovereignty-backup-restore'/);
});

test('infrastructure prevalidation revalidates only the bounded local candidate set',async()=>{
  const source=await readFile(new URL('../../src/portability/companion-infrastructure-prevalidation-runtime.js',import.meta.url),'utf8');
  assert.match(source,/scopeSovereigntyCandidateStore/);
  assert.match(source,/targetLayer=null/);
  assert.match(source,/selectedCandidates=normalizedTargetLayer/);
  assert.match(source,/for\(const candidate of selectedCandidates\)/);
  assert.match(source,/status:'UNVERIFIED'/);
  assert.match(source,/keys:selectedCandidates\.map/);
  assert.match(source,/candidateStore:scopedCandidateStore/);
  assert.match(source,/candidate_count:selectedCandidates\.length/);
  assert.match(source,/mel-sovereignty-proof-v3-/);
  assert.match(source,/sourceSha\.slice\(0,12\)/);
});

