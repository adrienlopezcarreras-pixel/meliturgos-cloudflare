import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { flattenRoadmap } from '../src/roadmap/master-roadmap.js';
import { ROADMAP_PROOF_SOURCES, computeRoadmapTruth, ROADMAP_TRUTH_WINDOW_MS } from '../src/roadmap/roadmap-truth.js';
import { ROADMAP_RECERTIFICATION_PROFILES, withRuntimeRecertification, executeRuntimeRecertification, isAcceptedRuntimeRecertificationJob } from '../src/roadmap/runtime-recertification.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';
import { describeJob } from '../src/evolution/autonomy-activity.js';
import { runAutonomyRuntimeTick, autonomyWorkRemaining } from '../src/evolution/autonomy-runtime-core.js';
const sha = 'a'.repeat(40);
async function fixture(t, { enabled = true, id = 'GEN2-03' } = {}) {
  const db = sqliteD1({maintenanceFence:true});t.after(() => db.close());
  await db.prepare(`CREATE TABLE audit_logs(id INTEGER PRIMARY KEY, timestamp INTEGER, action TEXT, path TEXT, details_json TEXT,
    client_ip TEXT, user_agent TEXT, request_method TEXT, response_status INTEGER, error_message TEXT, duration_ms INTEGER, created_at INTEGER)`).run();
  await db.prepare('INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)')
    .bind('mel-autonomy-control', Date.now(), enabled?'MAX_AUTONOMY':'PAUSED', JSON.stringify({paused:!enabled,max_autonomy:enabled,owner_control_version:1})).run();
  const repository = new D1DevJobRepository(db);
  const job = await repository.create({ id:'recert-job', requested_by:'mel-autonomy', goal:'Recertify the existing software', optional_context:{roadmap_id:id,work_mode:'VERIFY_RUNTIME',source:'autonomy-supervisor'} });
  const claimed = await repository.update(job.id,{status:'PLANNING'});
  return { db, repository, job:claimed, env:{DB:db,MEL_DEPLOYED_GIT_SHA:sha} };
}
const historical = id => flattenRoadmap().find(row => row.id === id);
const stale = ids => ({available:true,items:Object.fromEntries(ids.map(id=>[id,{truth:'UNPROVEN'}]))});

test('an accepted runtime receipt unlocks its dependent in the same scheduler cycle',async t=>{
  const f=await fixture(t,{id:'GEN2-03'});
  const parent=historical('GEN2-03'), child={...historical('GEN2-04'),depends_on:[parent.id]};
  const roadmap=withRuntimeRecertification([parent,child],stale([parent.id,child.id]));
  const verified=await executeRuntimeRecertification(f.env,f.repository,f.job);
  assert.equal(verified.status,'VERIFIED');
  const state=await new AutonomySupervisor({repository:f.repository,roadmap}).state();
  assert.ok(state.verifiedDependencyIds.includes(parent.id),'the actual audited receipt is available before another truth refresh');
  assert.equal(state.next.id,child.id);
});

test('orange historical software becomes verification work, while physical and unsafe probes remain explicit obligations', () => {
  const items=['GEN2-03','GEN2-02','GEN2-33','MEL-EVOL-06'].map(historical);
  const mapped=withRuntimeRecertification(items, stale(items.map(row=>row.id)));
  assert.equal(mapped[0].mode,'VERIFY_RUNTIME');assert.equal(mapped[0].verification_capability,'models.registry.verify');
  assert.equal(mapped[1].mode,'VERIFY_RUNTIME');
  assert.equal(mapped[2].status,'WAITING_PROOF_RECIPE','Gmail must not be invoked with guessed permissions or inputs');
  assert.equal(mapped.find(row=>row.id==='ROADMAP-PROOF-GEN2-33').verify_existing,false,'a code mission must implement the missing proof first');
  assert.equal(mapped[3].status,'WAITING_PROOF_RECIPE','a software fixture cannot train an adapter');
  assert.ok(items.every(row=>row.status==='DONE_VERIFIED'),'historical registry is not rewritten');
  const fresh={available:true,items:{'GEN2-03':{truth:'VERIFIED_LIVE'}}};
  assert.equal(withRuntimeRecertification([items[0]],fresh)[0],items[0]);
  assert.equal(withRuntimeRecertification(items,{available:false}),items);
});

test('every allowlisted recipe is a registered no-argument core diagnostic with the existing exact proof mapping',async()=>{
  const {bus}=createGen2Runtime({env:{}});
  for(const [id,capability] of Object.entries(ROADMAP_RECERTIFICATION_PROFILES)){
    assert.deepEqual(ROADMAP_PROOF_SOURCES[id].capabilities,[capability]);
    const record=bus.describe(capability);
    assert.equal(record.provider,'core',capability);assert.equal(record.category,'diagnostic',capability);
    assert.equal(record.risk,'LOW',capability);assert.deepEqual(record.permissions,[],capability);
    if (capability === 'memory.contradiction.provenance.verify') {
      await assert.rejects(() => bus.execute(capability,{}, {owner:'test',permissions:[]}), error => /^[A-Z_]*DB_UNAVAILABLE$/.test(error.code));
    } else assert.equal((await bus.execute(capability,{}, {owner:'test',permissions:[]})).ok,true,capability);
  }
});

test('a real runtime diagnostic persists its exact audit event before accepting the recertification',async t=>{
  const f=await fixture(t);
  const result=await executeRuntimeRecertification(f.env,f.repository,f.job);
  assert.equal(result.status,'VERIFIED');assert.equal(result.job.status,'COMPLETED');
  const proof=result.job.result_json.runtime_recertification;
  assert.equal(proof.deployed_sha,sha);assert.equal(proof.external_acceptance_verified,false);
  const row=await f.db.prepare('SELECT details_json FROM audit_logs WHERE id=?').bind(proof.audit_id).first();
  const event=JSON.parse(row.details_json);assert.equal(event.event_id,proof.execution_id);assert.equal(event.status,'SUCCEEDED');
  assert.equal(isAcceptedRuntimeRecertificationJob(result.job),true);
  const display=describeJob(result.job);
  assert.match(display.status_text,/Recette logicielle validée/);
  assert.equal(display.pipeline.length,2);
  assert.ok(display.pipeline.every(step=>step.state==='done'));
  assert.ok(display.pipeline.every(step=>!/Council|Code écrit/.test(step.label)));
  const truth=await computeRoadmapTruth(f.db,[{items:[historical('GEN2-03')]}]);
  assert.equal(truth.items['GEN2-03'].truth,'VERIFIED_LIVE');
  assert.equal(isAcceptedRuntimeRecertificationJob(result.job,{now:proof.at+ROADMAP_TRUTH_WINDOW_MS+1}),false);
  const wrong={...result.job,result_json:{...result.job.result_json,runtime_recertification:{...proof,capability:'gmail.messages.search'}}};
  assert.equal(isAcceptedRuntimeRecertificationJob(wrong),false);
});

test('a successful output without a durable matching audit event is never accepted',async t=>{
  const f=await fixture(t);
  const result=await executeRuntimeRecertification(f.env,f.repository,f.job,{createRuntime:({env})=>createGen2Runtime({env,audit:async()=>{}})});
  assert.equal(result.status,'FAILED');assert.equal(result.code,'ROADMAP_RECERTIFICATION_AUDIT_REQUIRED');
  assert.equal(describeJob(result.job).pipeline.at(-1).state,'blocked');
  assert.equal(isAcceptedRuntimeRecertificationJob(result.job),false);
});

test('owner pause and missing exact deployment identity prevent all verification dispatch',async t=>{
  const f=await fixture(t,{enabled:false});let calls=0;
  const result=await executeRuntimeRecertification(f.env,f.repository,f.job,{createRuntime:()=>{calls++;throw Error('not called');}});
  assert.equal(result.status,'BLOCKED');assert.equal(calls,0);assert.equal((await f.repository.get(f.job.id)).status,'PLANNING');
  await f.db.prepare("UPDATE dev_bridge_state SET status='MAX_AUTONOMY', metadata_json=? WHERE bridge_id='mel-autonomy-control'").bind(JSON.stringify({paused:false,max_autonomy:true,owner_control_version:2})).run();
  const missing=await executeRuntimeRecertification({...f.env,MEL_DEPLOYED_GIT_SHA:''},f.repository,f.job,{createRuntime:()=>{calls++;}});
  assert.equal(missing.code,'ROADMAP_RECERTIFICATION_DEPLOYMENT_REQUIRED');assert.equal(calls,0);
});

test('historical completion without a recent runtime receipt cannot suppress verification admission',async t=>{
  const f=await fixture(t);
  await f.repository.update(f.job.id,{status:'COMPLETED'});
  const rows=withRuntimeRecertification([historical('GEN2-03')],stale(['GEN2-03']));
  const supervisor=new AutonomySupervisor({repository:f.repository,roadmap:rows});
  assert.equal((await supervisor.state()).completedIds.includes('GEN2-03'),false);
  const next=await supervisor.ensureNextJob();
  assert.equal(next.created,true);assert.equal(next.job.optional_context.work_mode,'VERIFY_RUNTIME');
});

test('the real MAX core executes the verification mission without Council, Teacher or code generation',async t=>{
  const f=await fixture(t);const network=[];
  const rows=withRuntimeRecertification([historical('GEN2-03')],stale(['GEN2-03']));
  const result=await runAutonomyRuntimeTick(f.env,{repository:f.repository,maxAutonomy:true,epochMs:0,fetchImpl:async(url,options={})=>{network.push({url:String(url),method:options.method||'GET'});throw Error('metadata unavailable');}});
  assert.equal(result.runtime_recertification?.status,'VERIFIED');assert.equal(result.job.status,'COMPLETED');
  assert.ok(result.progress.events.includes('ROADMAP_RUNTIME_RECERTIFIED'));assert.ok(network.every(call=>call.method==='GET'),'reconciliation may read existing metadata, but never dispatches an AI request');
  assert.equal((await f.repository.list()).length,1,'no second active mission is created');
});

test('blocked recertification obligations never make an empty runnable queue complete',async t=>{
  const f=await fixture(t);await f.repository.update(f.job.id,{status:'CANCELLED'});
  const rows=withRuntimeRecertification([historical('GEN2-33')],stale(['GEN2-33']));
  const supervisor=new AutonomySupervisor({repository:f.repository,roadmap:rows});
  const state=await supervisor.state();assert.equal(state.next.id,'ROADMAP-PROOF-GEN2-33');
  assert.deepEqual(state.outstandingRoadmapIds,['GEN2-33','ROADMAP-PROOF-GEN2-33']);assert.equal(autonomyWorkRemaining(state),true);
  assert.equal((await supervisor.ensureNextJob()).created,true,'the missing recipe is real code work, not a completed parent');
});

test('a queued or terminal receipt cannot bypass the existing execution admission',async t=>{
  const f=await fixture(t);let calls=0;
  const queued=await f.repository.update(f.job.id,{status:'QUEUED'});
  const result=await executeRuntimeRecertification(f.env,f.repository,queued,{createRuntime:()=>{calls++;}});
  assert.equal(result.code,'ROADMAP_RECERTIFICATION_ADMISSION_REQUIRED');assert.equal(calls,0);
  const supervisor=new AutonomySupervisor({repository:f.repository,roadmap:[historical('GEN2-03')]});
  await supervisor.ensureNextJob();
  assert.notEqual((await f.repository.get(f.job.id)).status,'DONE_VERIFIED','static declaration must never close a queued verification job');
});

test('a replaced unsafe descriptor fails closed before any handler executes',async t=>{
  const f=await fixture(t);let calls=0;
  const result=await executeRuntimeRecertification(f.env,f.repository,f.job,{createRuntime:()=>({bus:{
    describe:()=>({provider:'remote',category:'diagnostic',risk:'LOW',enabled:true,permissions:[]}),
    executeDetailed:()=>{calls++;},
  }})});
  assert.equal(result.code,'ROADMAP_RECERTIFICATION_UNSAFE_RECIPE');assert.equal(calls,0);
});

test('old COMPLETED work cannot discharge an orange obligation lacking a safe runtime recipe',async t=>{
  const f=await fixture(t,{id:'GEN2-33'});await f.repository.update(f.job.id,{status:'COMPLETED'});
  const rows=withRuntimeRecertification([historical('GEN2-33')],stale(['GEN2-33']));
  const state=await new AutonomySupervisor({repository:f.repository,roadmap:rows}).state();
  assert.equal(state.completedIds.includes('GEN2-33'),false);
  assert.deepEqual(state.outstandingRoadmapIds,['GEN2-33','ROADMAP-PROOF-GEN2-33']);
});
