import test from 'node:test';
import assert from 'node:assert/strict';
import { executeProviderSwitch } from '../../src/portability/provider-switch-controller.js';
import { executeEmergencySovereigntyFailover } from '../../src/portability/emergency-sovereignty-failover.js';
import { classifyDependencyLongevity, emergencyFailoverRequestFromLongevity } from '../../src/evaluation/dependency-longevity-watch.js';

function prng(seed=0x5eed1234){
  let s=seed>>>0;
  return ()=>{
    s=(1664525*s+1013904223)>>>0;
    return s/0x100000000;
  };
}

const layers=['ai','runtime','storage','source_control'];

test('stress: 250 provider switches never keep a failed candidate active', async()=>{
  const rnd=prng();
  for(let i=0;i<250;i++){
    const smokeOk=rnd()>0.35;
    const testedOk=rnd()>0.15;
    let active='current';
    const result=await executeProviderSwitch({
      maxAutonomy:true,
      layer:layers[i%layers.length],
      currentAdapter:'current',
      candidateAdapter:'candidate-'+i,
      runIsolatedContractTests:async()=>({ok:testedOk}),
      activateAdapter:async({to})=>{active=to;return{ok:true};},
      runPostSwitchSmoke:async()=>({ok:smokeOk}),
      rollbackAdapter:async({to})=>{active=to;return{ok:true};},
    });

    if(testedOk&&smokeOk){
      assert.equal(result.ok,true);
      assert.equal(active,'candidate-'+i);
    }else{
      assert.equal(result.ok,false);
      assert.equal(active,'current');
    }
  }
});

test('stress: emergency failover with absent owner never selects an unvalidated provider', async()=>{
  const rnd=prng(0xabc123);
  for(let i=0;i<150;i++){
    const candidates=Array.from({length:5},(_,j)=>({
      id:`alt-${i}-${j}`,
      prevalidated:rnd()>0.45,
      score:rnd(),
    }));
    const validated=candidates.filter(x=>x.prevalidated);
    const result=await executeEmergencySovereigntyFailover({
      maxAutonomy:true,
      trigger:{code:'SERVICE_EOL_IMMINENT',ownerReachable:false,serviceReachable:true},
      layer:'runtime',
      currentAdapter:'primary',
      approvedAlternatives:candidates,
      selectAlternative:async({alternatives})=>alternatives.sort((a,b)=>(b.score||0)-(a.score||0))[0],
      createVerifiedBackup:async()=>({ok:true,verified:true,id:'b-'+i}),
      testAlternative:async()=>({ok:true}),
      activateAlternative:async()=>({ok:true}),
      smokeAlternative:async()=>({ok:true}),
      rollbackCurrent:async()=>({ok:true}),
      enterSurvivalMode:async()=>({ok:true,mode:'RECOVERY'}),
    });

    if(!validated.length){
      assert.equal(result.status,'EMERGENCY_SURVIVAL_MODE');
      assert.equal(result.migrated,false);
    }else{
      assert.equal(result.status,'EMERGENCY_FAILOVER_VERIFIED');
      assert.ok(validated.some(x=>x.id===result.active_adapter));
      assert.equal(result.owner_presence_required,false);
    }
  }
});

test('stress: failed emergency smoke either rolls back or enters survival mode, never false success', async()=>{
  for(let i=0;i<120;i++){
    const oldReachable=i%3!==0;
    const result=await executeEmergencySovereigntyFailover({
      maxAutonomy:true,
      trigger:{code:'SERVICE_SHUTDOWN_ANNOUNCED',ownerReachable:false,serviceReachable:oldReachable},
      layer:'source_control',
      currentAdapter:'github',
      approvedAlternatives:[{id:'alt-git',prevalidated:true}],
      createVerifiedBackup:async()=>({ok:true,verified:true,id:'b'}),
      testAlternative:async()=>({ok:true}),
      activateAlternative:async()=>({ok:true}),
      smokeAlternative:async()=>({ok:false,code:'WRITE_FAILED'}),
      rollbackCurrent:async()=>({ok:true}),
      enterSurvivalMode:async()=>({ok:true,mode:'RECOVERY'}),
    });
    assert.equal(result.ok,false);
    if(oldReachable){
      assert.equal(result.status,'EMERGENCY_FAILOVER_ROLLED_BACK');
      assert.equal(result.active_adapter,'github');
    }else{
      assert.equal(result.status,'EMERGENCY_SURVIVAL_MODE');
    }
  }
});

test('stress: longevity classification deterministically escalates approaching EOL',()=>{
  const dep={id:'runtime.primary',layer:'runtime',provider:'primary',criticality:'CRITICAL'};
  const now=Date.UTC(2026,8,28,18,0,0);
  const horizons=[720,360,168,72,25,24,12,1,0.1];
  let emergencySeen=false;
  for(const hours of horizons){
    const result=classifyDependencyLongevity(dep,{
      reachable:true,
      eol_at:new Date(now+hours*3600000).toISOString(),
      replacement_candidates:[{id:'alt',prevalidated:true}],
    },{now});
    if(hours<=24){
      assert.equal(result.severity,'EMERGENCY');
      emergencySeen=true;
      const req=emergencyFailoverRequestFromLongevity(result,{ownerReachable:false});
      assert.equal(req.trigger.ownerReachable,false);
      assert.equal(req.approvedAlternatives[0].id,'alt');
    }else{
      assert.notEqual(result.severity,'EMERGENCY');
    }
  }
  assert.equal(emergencySeen,true);
});

test('stress: no migration happens without a verified backup in 100 emergency attempts', async()=>{
  for(let i=0;i<100;i++){
    await assert.rejects(
      ()=>executeEmergencySovereigntyFailover({
        maxAutonomy:true,
        trigger:{code:'SERVICE_EOL_IMMINENT',ownerReachable:false,serviceReachable:true},
        layer:'database',
        currentAdapter:'d1',
        approvedAlternatives:[{id:'alt-db',prevalidated:true}],
        createVerifiedBackup:async()=>({ok:true,verified:false}),
        testAlternative:async()=>({ok:true}),
        activateAlternative:async()=>({ok:true}),
        smokeAlternative:async()=>({ok:true}),
        rollbackCurrent:async()=>({ok:true}),
      }),
      error=>error?.code==='EMERGENCY_BACKUP_VERIFICATION_FAILED',
    );
  }
});
