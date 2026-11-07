import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { ROADMAP_PROOF_SOURCES, ROADMAP_TRUTH_WINDOW_MS } from '../src/roadmap/roadmap-truth.js';
import { ROADMAP_RECERTIFICATION_PROFILES, withRuntimeRecertification } from '../src/roadmap/runtime-recertification.js';

const capability='cloudflare.canary-rollback.verify';
const sha='a'.repeat(40);
const stable='11111111-1111-4111-8111-111111111111';
const candidate='22222222-2222-4222-8222-222222222222';
const canaryId='33333333-3333-4333-8333-333333333333';
const rollbackId='44444444-4444-4444-8444-444444444444';
const script='meliturgos';
const canary=[{version_id:stable,percentage:90},{version_id:candidate,percentage:10}];
const restored=[{version_id:stable,percentage:100}];

async function fixture(t,{tag='sha:'+sha}={}){
  const db=sqliteD1();t.after(()=>db.close());
  await db.prepare('CREATE TABLE cloudflare_api_relay_jobs (id TEXT PRIMARY KEY,operation TEXT,status TEXT,input_json TEXT,result_json TEXT,created_at INTEGER,completed_at INTEGER)').run();
  const start=Date.now()-100000;
  const add=async(kind,at,input,result,status='COMPLETE')=>{
    await db.prepare('INSERT INTO cloudflare_api_relay_jobs VALUES(?,?,?,?,?,?,?)')
      .bind(kind+at,kind,status,JSON.stringify(input),JSON.stringify(result),start+at,start+at+1000).run();
  };
  const deployment=(id,versions)=>({id,versions});
  const expected=(id,versions)=>({provider:'cloudflare',transport:'github-actions-relay',script,deployment:deployment(id,versions)});
  await add('deployments.create',0,{script,versions:canary,message:'owner-approved '+tag},expected(canaryId,canary));
  await add('deployments.create',10000,{script,versions:restored,message:'owner-approved '+tag},expected(rollbackId,restored));
  await add('deployments.list',20000,{script,limit:20},
    {provider:'cloudflare',transport:'github-actions-relay',script,deployments:[deployment(rollbackId,restored),deployment(canaryId,canary)],
      production_provenance:{proof_source:'live-worker-and-cloudflare-deployment',deployed_sha:sha,
        cloudflare_version_id:stable,observed_at:new Date(start+20500).toISOString()}});
  const bus=createDefaultCapabilityBus({env:{DB:db,MEL_DEPLOYED_GIT_SHA:sha,MEL_CLOUDFLARE_SCRIPT:script}});
  const verify=()=>bus.execute(capability,{}, {owner:'proof',permissions:[]});
  return {db,verify,add,expected,start};
}

test('GEN2-53 checks real Cloudflare relay receipts plus later authoritative readback, without writes',async t=>{
  const f=await fixture(t);
  const before=(await f.db.prepare('SELECT * FROM cloudflare_api_relay_jobs ORDER BY completed_at').all()).results;
  assert.deepEqual(await f.verify(),{ok:true,verified_steps:3});
  assert.deepEqual((await f.db.prepare('SELECT * FROM cloudflare_api_relay_jobs ORDER BY completed_at').all()).results,before);
  assert.equal(ROADMAP_RECERTIFICATION_PROFILES['GEN2-53'],capability);
  assert.deepEqual(ROADMAP_PROOF_SOURCES['GEN2-53'].capabilities,[capability]);
  const mapped=withRuntimeRecertification([{id:'GEN2-53',status:'DONE_VERIFIED',depends_on:[]}],
    {available:true,items:{'GEN2-53':{truth:'PARTIAL_LIVE'}}});
  assert.equal(mapped.length,1);
  assert.equal(mapped[0].mode,'VERIFY_RUNTIME');
});
test('GEN2-53 rejects a valid-looking rollback without an exact deployed SHA binding',async t=>{
  const f=await fixture(t,{tag:'sha:'+('b'.repeat(40))});
  await assert.rejects(f.verify(),{code:'CLOUDFLARE_ROLLBACK_LIVE_PROOF_NOT_FOUND'});
});
test('GEN2-53 rejects a stale provider readback',async t=>{
  const f=await fixture(t);
  await f.db.prepare("UPDATE cloudflare_api_relay_jobs SET completed_at=? WHERE operation='deployments.list'")
    .bind(Date.now()-ROADMAP_TRUTH_WINDOW_MS-2000).run();
  await assert.rejects(f.verify(),{code:'CLOUDFLARE_ROLLBACK_READBACK_MISSING'});
});
test('GEN2-53 rejects a rollback followed by another deployment',async t=>{
  const f=await fixture(t);
  await f.add('deployments.create',30000,{script,versions:restored,message:'sha:'+sha},
    f.expected('55555555-5555-4555-8555-555555555555',restored));
  await assert.rejects(f.verify(),{code:'CLOUDFLARE_ROLLBACK_LIVE_PROOF_NOT_FOUND'});
});
test('GEN2-53 rejects a newer failed provider readback even if old successful data remains',async t=>{
  const f=await fixture(t);
  await f.add('deployments.list',30000,{script,limit:20},
    {provider:'cloudflare',transport:'github-actions-relay',script,deployments:[]},'FAILED');
  await assert.rejects(f.verify(),{code:'CLOUDFLARE_ROLLBACK_READBACK_MISSING'});
});
test('GEN2-53 rejects a later pending deployment, not just completed changes',async t=>{
  const f=await fixture(t);
  await f.add('deployments.create',30000,{script,versions:restored,message:'sha:'+sha},
    f.expected('55555555-5555-4555-8555-555555555555',restored),'QUEUED');
  await assert.rejects(f.verify(),{code:'CLOUDFLARE_ROLLBACK_LIVE_PROOF_NOT_FOUND'});
});
test('GEN2-53 rejects an unrelated latest provider deployment',async t=>{
  const f=await fixture(t);
  await f.db.prepare("UPDATE cloudflare_api_relay_jobs SET result_json=? WHERE operation='deployments.list'")
    .bind(JSON.stringify({provider:'cloudflare',transport:'github-actions-relay',script,
      deployments:[{id:canaryId,versions:canary}]})).run();
  await assert.rejects(f.verify(),{code:'CLOUDFLARE_ROLLBACK_SOURCE_IDENTITY_UNPROVEN'});
});
test('GEN2-53 rejects fixture-only receipts or a failed rollback',async t=>{
  const f=await fixture(t);
  await f.db.prepare("UPDATE cloudflare_api_relay_jobs SET status='FAILED' WHERE operation='deployments.create' AND created_at=?")
    .bind(f.start+10000).run();
  await assert.rejects(f.verify(),{code:'CLOUDFLARE_ROLLBACK_LIVE_PROOF_NOT_FOUND'});
});
test('GEN2-53 requires D1 and an explicit script/exact deployment identity',async t=>{
  const bus=createDefaultCapabilityBus({env:{}});
  await assert.rejects(bus.execute(capability,{}, {owner:'proof',permissions:[]}),{code:'CLOUDFLARE_ROLLBACK_DB_UNAVAILABLE'});
  const f=await fixture(t);
  const b=createDefaultCapabilityBus({env:{DB:f.db,MEL_DEPLOYED_GIT_SHA:sha}});
  await assert.rejects(b.execute(capability,{}, {owner:'proof',permissions:[]}),
    {code:'CLOUDFLARE_ROLLBACK_IDENTITY_UNAVAILABLE'});
});
test('GEN2-53 auxiliary code mission is parked, never counted as real runtime rollback proof',async t=>{
  const {D1DevJobRepository}=await import('../src/dev/d1-dev-job-repository.js');
  const {AutonomySupervisor}=await import('../src/evolution/autonomy-supervisor.js');
  const {flattenRoadmap}=await import('../src/roadmap/master-roadmap.js');
  const db=sqliteD1({maintenanceFence:true});t.after(()=>db.close());
  const repository=new D1DevJobRepository(db);
  const old=await repository.create({id:'old-gen2-53',requested_by:'mel-autonomy',
    goal:'Prepare a canary rollback proof recipe',optional_context:{roadmap_id:'ROADMAP-PROOF-GEN2-53',source:'autonomy-supervisor'}});
  await repository.update(old.id,{status:'TEACHER_APPROVED'});
  const parent={...flattenRoadmap().find(row=>row.id==='GEN2-53'),depends_on:[]};
  const roadmap=withRuntimeRecertification([parent],{available:true,items:{'GEN2-53':{truth:'UNPROVEN'}}});
  const result=await new AutonomySupervisor({repository,roadmap}).ensureNextJob();
  assert.equal((await repository.get(old.id)).status,'WAITING_DEPENDENCY');
  assert.equal(result.job.optional_context.roadmap_id,'GEN2-53');
  assert.equal(result.job.optional_context.work_mode,'VERIFY_RUNTIME');
  assert.notEqual(result.job.status,'COMPLETED');
  const state=await new AutonomySupervisor({repository,roadmap}).state();
  assert.equal(state.active.length,1);
  assert.equal(state.completedIds.includes('GEN2-53'),false);
});

test('GEN2-53 never trusts a SHA annotation without independent Worker/version provenance',async t=>{
  const f=await fixture(t);
  await f.db.prepare("UPDATE cloudflare_api_relay_jobs SET result_json=json_remove(result_json,'$.production_provenance') WHERE operation='deployments.list'").run();
  await assert.rejects(f.verify(),{code:'CLOUDFLARE_ROLLBACK_SOURCE_IDENTITY_UNPROVEN'});
});
for(const [name,field,value] of [
  ['different deployed SHA','deployed_sha','b'.repeat(40)],
  ['wrong Cloudflare stable version','cloudflare_version_id',candidate],
  ['unrecognized proof source','proof_source','user-controlled-message'],
  ['stale identity','observed_at',new Date(0).toISOString()],
]){
  test('GEN2-53 rejects '+name+' even with matching SHA message tokens',async t=>{
    const f=await fixture(t);
    const row=await f.db.prepare("SELECT result_json FROM cloudflare_api_relay_jobs WHERE operation='deployments.list'").first();
    const payload=JSON.parse(row.result_json);
    payload.production_provenance[field]=value;
    await f.db.prepare("UPDATE cloudflare_api_relay_jobs SET result_json=? WHERE operation='deployments.list'").bind(JSON.stringify(payload)).run();
    await assert.rejects(f.verify(),{code:'CLOUDFLARE_ROLLBACK_SOURCE_IDENTITY_UNPROVEN'});
  });
}
