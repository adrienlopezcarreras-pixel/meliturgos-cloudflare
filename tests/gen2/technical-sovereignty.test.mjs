import test from 'node:test';
import assert from 'node:assert/strict';
import { SOVEREIGNTY_LAYERS, evaluateTechnicalSovereignty, assertTechnicalSovereigntyReady } from '../../src/portability/technical-sovereignty.js';

function fullyPortable(){
  return Object.fromEntries(SOVEREIGNTY_LAYERS.map((id)=>[id,{
    current_adapter:`${id}.current`,
    alternative_adapters:[`${id}.alt`],
    export:true,
    import:true,
    isolated_test:true,
    activate:true,
    smoke:true,
    rollback:true,
  }]));
}

test('full technical sovereignty requires every architecture layer to be replaceable',()=>{
  const report=evaluateTechnicalSovereignty({layers:fullyPortable(),maxAutonomy:true});
  assert.equal(report.fully_sovereign,true);
  assert.equal(report.ready_layer_count,SOVEREIGNTY_LAYERS.length);
  assert.equal(report.policy.autonomous_switch_allowed_only_in_max,true);
  assert.equal(report.policy.provider_lock_forbidden,true);
});

test('a single provider-locked layer prevents full-sovereignty claim',()=>{
  const layers=fullyPortable();
  layers.source_control.alternative_adapters=[];
  const report=evaluateTechnicalSovereignty({layers,maxAutonomy:true});
  assert.equal(report.fully_sovereign,false);
  assert.ok(report.blocked_layers.some(row=>row.id==='source_control'&&row.blockers.includes('ALTERNATIVE_ADAPTER_MISSING')));
  assert.throws(()=>assertTechnicalSovereigntyReady({layers,maxAutonomy:true}),error=>error?.code==='TECHNICAL_SOVEREIGNTY_INCOMPLETE');
});

test('backup, smoke and rollback are mandatory even when an alternative provider exists',()=>{
  const layers=fullyPortable();
  layers.runtime.rollback=false;
  layers.database.export=false;
  layers.ci_cd.smoke=false;
  const report=evaluateTechnicalSovereignty({layers});
  assert.equal(report.fully_sovereign,false);
  assert.ok(report.layers.runtime.blockers.includes('CAPABILITY_ROLLBACK_MISSING'));
  assert.ok(report.layers.database.blockers.includes('CAPABILITY_EXPORT_MISSING'));
  assert.ok(report.layers.ci_cd.blockers.includes('CAPABILITY_SMOKE_MISSING'));
});
