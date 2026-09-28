import test from 'node:test';
import assert from 'node:assert/strict';
import { executeProviderSwitch } from '../../src/portability/provider-switch-controller.js';

test('provider switch is forbidden outside MAX 100%', async () => {
  await assert.rejects(
    () => executeProviderSwitch({
      maxAutonomy:false,
      layer:'ai',
      currentAdapter:'workers-ai',
      candidateAdapter:'alt-ai',
      runIsolatedContractTests:async()=>({ok:true}),
      activateAdapter:async()=>({ok:true}),
      runPostSwitchSmoke:async()=>({ok:true}),
      rollbackAdapter:async()=>({ok:true}),
    }),
    error => error?.code === 'PROVIDER_SWITCH_MAX_AUTONOMY_REQUIRED',
  );
});

test('MAX 100% switches a verified AI provider and keeps it only after smoke passes', async () => {
  const calls=[];
  const result=await executeProviderSwitch({
    maxAutonomy:true,
    layer:'ai',
    currentAdapter:'workers-ai',
    candidateAdapter:'better-ai',
    runIsolatedContractTests:async input=>{calls.push(['test',input]);return {ok:true,score:0.94};},
    activateAdapter:async input=>{calls.push(['activate',input]);return {ok:true};},
    runPostSwitchSmoke:async input=>{calls.push(['smoke',input]);return {ok:true,latency_ms:120};},
    rollbackAdapter:async input=>{calls.push(['rollback',input]);return {ok:true};},
  });
  assert.equal(result.ok,true);
  assert.equal(result.status,'PROVIDER_SWITCH_VERIFIED');
  assert.equal(result.active_adapter,'better-ai');
  assert.deepEqual(calls.map(row=>row[0]),['test','activate','smoke']);
});

test('MAX 100% automatically rolls back a provider whose post-switch smoke fails', async () => {
  const calls=[];
  const result=await executeProviderSwitch({
    maxAutonomy:true,
    layer:'runtime',
    currentAdapter:'cloudflare-workers',
    candidateAdapter:'alternate-runtime',
    runIsolatedContractTests:async()=>({ok:true}),
    activateAdapter:async input=>{calls.push(['activate',input]);return {ok:true};},
    runPostSwitchSmoke:async input=>{calls.push(['smoke',input]);return {ok:false,code:'HTTP_500'};},
    rollbackAdapter:async input=>{calls.push(['rollback',input]);return {ok:true};},
  });
  assert.equal(result.ok,false);
  assert.equal(result.status,'PROVIDER_SWITCH_ROLLED_BACK');
  assert.equal(result.active_adapter,'cloudflare-workers');
  assert.equal(result.rollback_ok,true);
  assert.deepEqual(calls.map(row=>row[0]),['activate','smoke','rollback']);
});

test('source-control provider switching uses the same verified MAX contract', async () => {
  const result=await executeProviderSwitch({
    maxAutonomy:true,
    layer:'source_control',
    currentAdapter:'github',
    candidateAdapter:'alternate-git',
    runIsolatedContractTests:async()=>({ok:true,clone:true,push:true,fetch:true}),
    activateAdapter:async()=>({ok:true}),
    runPostSwitchSmoke:async()=>({ok:true,read:true,write:true}),
    rollbackAdapter:async()=>({ok:true}),
  });
  assert.equal(result.ok,true);
  assert.equal(result.status,'PROVIDER_SWITCH_VERIFIED');
  assert.equal(result.active_adapter,'alternate-git');
});

test('storage provider switching also fails closed without isolated contract proof', async () => {
  const result=await executeProviderSwitch({
    maxAutonomy:true,
    layer:'storage',
    currentAdapter:'d1-r2',
    candidateAdapter:'alternate-store',
    runIsolatedContractTests:async()=>({ok:false,code:'CHECKSUM_MISMATCH'}),
    activateAdapter:async()=>({ok:true}),
    runPostSwitchSmoke:async()=>({ok:true}),
    rollbackAdapter:async()=>({ok:true}),
  });
  assert.equal(result.ok,false);
  assert.equal(result.status,'CANDIDATE_PROVIDER_REJECTED');
  assert.equal(result.activation_attempted,false);
});
