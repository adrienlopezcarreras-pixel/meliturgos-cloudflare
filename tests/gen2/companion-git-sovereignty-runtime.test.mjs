import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MEL scheduled maintenance runs local Git sovereignty validation',async()=>{
  const source=await readFile(new URL('../../src/index.js',import.meta.url),'utf8');
  assert.match(source,/runCompanionGitSovereigntyRuntime/);
  const scheduled=source.slice(source.indexOf('async scheduled'));
  assert.match(scheduled,/runCompanionGitSovereigntyRuntime\(env\)/);
});

test('local Git runtime requires ShardVault seed provenance before prevalidation',async()=>{
  const source=await readFile(new URL('../../src/portability/companion-git-sovereignty-runtime.js',import.meta.url),'utf8');
  assert.match(source,/action:'seed'/);
  assert.match(source,/external_reconstruction_verified/);
  assert.match(source,/LOCAL_GIT_SEED_PROVENANCE_INVALID/);
  assert.match(source,/prevalidateInfrastructureAlternative/);
});

test('sovereignty Git command bridge is separate from generic computer.use policy',async()=>{
  const bridge=await readFile(new URL('../../src/portability/companion-sovereignty-command-bridge.js',import.meta.url),'utf8');
  const computer=await readFile(new URL('../../src/devices/computer-use.js',import.meta.url),'utf8');
  assert.match(bridge,/mel\.sovereignty\.local-command\/v1/);
  assert.match(bridge,/source_control/);
  assert.doesNotMatch(bridge,/evaluateComputerUsePlan/);
  assert.match(computer,/ACTION_NOT_ALLOWED/);
  assert.doesNotMatch(computer,/sovereignty\.source_control/);
});

test('Windows companion only accepts sovereignty Git operations under sovereignty schema',async()=>{
  const source=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  assert.match(source,/SOVEREIGNTY_COMMAND_SCHEMA_REQUIRED/);
  assert.match(source,/mel\.sovereignty\.local-command\/v1/);
  assert.match(source,/SOVEREIGNTY_GIT_REPO_NOT_SEEDED/);
  assert.match(source,/SOVEREIGNTY_SEED_EXTERNAL_RECONSTRUCTION_REQUIRED/);
  assert.match(source,/\.mel-source-provenance\.json/);
});
