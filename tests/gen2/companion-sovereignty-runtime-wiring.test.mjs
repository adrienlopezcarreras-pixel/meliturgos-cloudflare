import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LOCAL_SOVEREIGNTY_ACTIONS, isLocalSovereigntyAction } from '../../src/portability/local-sovereignty-actions.js';

test('local sovereignty whitelist includes verified Git seeding but no generic shell',()=>{
  assert.equal(isLocalSovereigntyAction('sovereignty.source_control.seed'),true);
  assert.equal(isLocalSovereigntyAction('sovereignty.source_control.write_file'),true);
  assert.equal(isLocalSovereigntyAction('shell.exec'),false);
  assert.equal(isLocalSovereigntyAction('sovereignty.shell.exec'),false);
  assert.equal(LOCAL_SOVEREIGNTY_ACTIONS.some(x=>/shell|powershell|cmd\.exe/i.test(x)),false);
});

test('paired-companion executor queues only sovereignty schema commands and waits bounded result',async()=>{
  const source=await readFile(new URL('../../src/portability/companion-sovereignty-executor.js',import.meta.url),'utf8');
  assert.match(source,/isLocalSovereigntyAction/);
  assert.match(source,/mel\.sovereignty\.local-command\/v1/);
  assert.match(source,/COMPANION_SOVEREIGNTY_TIMEOUT/);
  assert.match(source,/computer_commands/);
  assert.match(source,/OWNER_HALT_ACTIVE/);
  assert.match(source,/COMPUTER_OFFLINE/);
});

test('local AI fails closed until the stage-aware Companion engine is active',async()=>{
  const source=await readFile(new URL('../../src/portability/companion-sovereignty-executor.js',import.meta.url),'utf8');
  assert.match(source,/MIN_LOCAL_AI_ENGINE_VERSION='1\.3\.2'/);
  assert.match(source,/COMPANION_ENGINE_UPDATE_REQUIRED:/);
  assert.match(source,/capabilityId==='sovereignty\.ai'/);
  assert.match(source,/metadata\.engine_version/);
  assert.match(source,/native_version/);
  assert.match(source,/refresh_status/);
  assert.match(source,/refresh_error/);

  const aiRuntime=await readFile(new URL('../../src/portability/companion-ai-prevalidation-runtime.js',import.meta.url),'utf8');
  assert.match(aiRuntime,/native_version/);
  assert.match(aiRuntime,/required_engine_version/);
  assert.match(aiRuntime,/refresh_error/);

  const api=await readFile(new URL('../../src/devices/computer-companion-api.js',import.meta.url),'utf8');
  assert.match(api,/MIN_SOVEREIGN_AI_ENGINE_VERSION="1\.4\.1"/);
  assert.match(api,/engine_update_required/);
  assert.match(api,/engine_refresh_status/);
  assert.match(api,/required_engine_version/);
});

test('local Git runtime seeds from ShardVault before provider proof',async()=>{
  const source=await readFile(new URL('../../src/portability/companion-source-control-prevalidation-runtime.js',import.meta.url),'utf8');
  const seed=source.indexOf("action:'sovereignty.source_control.seed'");
  const adapter=source.indexOf('createCompanionSourceControlAdapter');
  const validate=source.indexOf('validateSovereigntyCandidates');
  assert.ok(seed>0);
  assert.ok(adapter>0);
  assert.ok(validate>0);
  assert.match(source,/expected_sha:sourceSha/);
  assert.match(source,/COMPANION_OFFLINE/);
  assert.match(source,/SOURCE_SHA_UNAVAILABLE/);
});

test('MEL scheduled maintenance runs companion Git prevalidation internally',async()=>{
  const source=await readFile(new URL('../../src/index.js',import.meta.url),'utf8');
  assert.match(source,/runCompanionSourceControlPrevalidationRuntime/);
  const scheduled=source.slice(source.indexOf('async scheduled'));
  assert.match(scheduled,/runCompanionSourceControlPrevalidationRuntime\(env\)/);
});

test('PowerShell engine contains verified ShardVault seed path and passes command schema',async()=>{
  const source=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  assert.match(source,/function Seed-SovereigntyGitRepo/);
  assert.match(source,/sovereignty-code-archive\?sha=/);
  assert.match(source,/SOVEREIGNTY_SEED_SOURCE_SHA_MISMATCH/);
  assert.match(source,/X-MEL-Archive-Sha256/);
  assert.match(source,/external_reconstruction_verified=\$true/);
  assert.match(source,/Perform-Step \$step \(\[string\]\$command\.id\) \(\[string\]\$command\.plan\.schema\)/);
});


test('shared companion executor qualifies short adapter actions before whitelist',async()=>{
  const source=await readFile(new URL('../../src/portability/companion-sovereignty-executor.js',import.meta.url),'utf8');
  assert.match(source,/rawAction\.startsWith\('sovereignty\.'\)/);
  assert.match(source,/capabilityId\+'\.'\+rawAction/);
  assert.match(source,/isLocalSovereigntyAction\(qualifiedAction\)/);
  assert.match(source,/action:qualifiedAction/);
});


test('scheduled sovereignty maintenance has one authority per local infrastructure layer',async()=>{
  const source=await readFile(new URL('../../src/index.js',import.meta.url),'utf8');
  const scheduled=source.slice(source.indexOf('async scheduled'));
  assert.match(scheduled,/runCompanionInfrastructurePrevalidationRuntime\(env\)/);
  assert.doesNotMatch(scheduled,/runCompanionStoragePrevalidationRuntime\(env\)/);
  assert.doesNotMatch(scheduled,/runCompanionLocalServicesPrevalidationRuntime\(env\)/);

  const authority=await readFile(new URL('../../src/portability/companion-infrastructure-prevalidation-runtime.js',import.meta.url),'utf8');
  for(const layer of ['storage','database','ci_cd','secrets_identity','scheduler','observability']){
    assert.match(authority,new RegExp(`layer:['"]${layer}['"]`));
  }
});
