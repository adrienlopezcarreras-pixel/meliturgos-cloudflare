import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyEmergencySovereigntyTrigger,
  executeEmergencySovereigntyFailover,
} from '../../src/portability/emergency-sovereignty-failover.js';

test('24h migration deadline is classified as absolute emergency',()=>{
  const now=Date.UTC(2026,8,28,18,0,0);
  const report=classifyEmergencySovereigntyTrigger({
    code:'MIGRATION_DEADLINE_IMMINENT',
    deadlineAt:new Date(now+12*3600000).toISOString(),
    now,
    ownerReachable:false,
  });
  assert.equal(report.emergency,true);
  assert.equal(report.owner_unavailable,true);
  assert.equal(report.hours_left,12);
});

test('MAX 100% can perform unattended verified emergency failover',async()=>{
  const calls=[];
  const result=await executeEmergencySovereigntyFailover({
    maxAutonomy:true,
    trigger:{code:'SERVICE_EOL_IMMINENT',ownerReachable:false,serviceReachable:true},
    layer:'runtime',
    currentAdapter:'cloudflare-workers',
    approvedAlternatives:[{id:'alternate-runtime',prevalidated:true}],
    createVerifiedBackup:async()=>({ok:true,verified:true,id:'backup-1'}),
    testAlternative:async()=>({ok:true}),
    activateAlternative:async input=>{calls.push(['activate',input]);return{ok:true};},
    smokeAlternative:async input=>{calls.push(['smoke',input]);return{ok:true};},
    rollbackCurrent:async input=>{calls.push(['rollback',input]);return{ok:true};},
    enterSurvivalMode:async input=>({ok:true,input}),
  });
  assert.equal(result.ok,true);
  assert.equal(result.status,'EMERGENCY_FAILOVER_VERIFIED');
  assert.equal(result.owner_presence_required,false);
  assert.equal(result.active_adapter,'alternate-runtime');
  assert.deepEqual(calls.map(x=>x[0]),['activate','smoke']);
});

test('failed emergency smoke rolls back when old provider is still reachable',async()=>{
  const result=await executeEmergencySovereigntyFailover({
    maxAutonomy:true,
    trigger:{code:'SERVICE_SHUTDOWN_ANNOUNCED',ownerReachable:false,serviceReachable:true},
    layer:'source_control',
    currentAdapter:'github',
    approvedAlternatives:[{id:'alternate-git',prevalidated:true}],
    createVerifiedBackup:async()=>({ok:true,verified:true,id:'backup-2'}),
    testAlternative:async()=>({ok:true}),
    activateAlternative:async()=>({ok:true}),
    smokeAlternative:async()=>({ok:false,code:'WRITE_FAILED'}),
    rollbackCurrent:async()=>({ok:true}),
    enterSurvivalMode:async()=>({ok:true}),
  });
  assert.equal(result.status,'EMERGENCY_FAILOVER_ROLLED_BACK');
  assert.equal(result.rollback_ok,true);
  assert.equal(result.active_adapter,'github');
});

test('no prevalidated alternative enters survival mode instead of blind migration',async()=>{
  const result=await executeEmergencySovereigntyFailover({
    maxAutonomy:true,
    trigger:{code:'SERVICE_UNREACHABLE_CRITICAL',ownerReachable:false,serviceReachable:false},
    layer:'database',
    currentAdapter:'cloudflare-d1',
    approvedAlternatives:[],
    enterSurvivalMode:async()=>({ok:true,mode:'RECOVERY'}),
  });
  assert.equal(result.status,'EMERGENCY_SURVIVAL_MODE');
  assert.equal(result.migrated,false);
  assert.equal(result.survival.mode,'RECOVERY');
});

test('unattended emergency failover remains forbidden outside MAX 100%',async()=>{
  await assert.rejects(
    ()=>executeEmergencySovereigntyFailover({
      maxAutonomy:false,
      trigger:{code:'SERVICE_EOL_IMMINENT',ownerReachable:false},
      approvedAlternatives:[{id:'alt',prevalidated:true}],
    }),
    error=>error?.code==='EMERGENCY_FAILOVER_MAX_AUTONOMY_REQUIRED',
  );
});
