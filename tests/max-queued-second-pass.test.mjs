import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor, autonomyQueueRound, selectNextAutonomyItem } from '../src/evolution/autonomy-supervisor.js';
import { activeAutonomyMission, singleFlightAutonomyMission } from '../src/evolution/provider-exhaustion-rotation.js';

const make=id=>({id,requested_by:'mel-autonomy',goal:id,optional_context:{roadmap_id:id}});
const row=(id,priority='P1')=>({id,title:id,status:'PLANNED',priority,depends_on:[]});

for(const persistent of [false,true])test('QUEUED never occupies MAX; only one atomic PLANNING claim succeeds ('+(persistent?'D1':'memory')+')',async()=>{
  const db=persistent?sqliteD1():null;
  try{
    const repo=new D1DevJobRepository(db);
    const a=await repo.create(make('MEL-TEST-A'));
    const b=await repo.create(make('MEL-TEST-B'));
    assert.equal(singleFlightAutonomyMission(await repo.list()),null);
    assert.equal(activeAutonomyMission(await repo.list()),null);
    const claims=await Promise.all([repo.claimQueuedAutonomy(a.id,{expected:a}),repo.claimQueuedAutonomy(b.id,{expected:b})]);
    assert.equal(claims.filter(Boolean).length,1);
    const holder=claims.find(Boolean);
    assert.equal(holder.status,'PLANNING');
    assert.equal(singleFlightAutonomyMission(await repo.list())?.id,holder.id);
    const other=holder.id===a.id?b.id:a.id;
    assert.equal(await repo.claimQueuedAutonomy(other),null);
    const returned=await repo.update(holder.id,{status:'QUEUED'});
    assert.equal(returned.status,'QUEUED');
    assert.equal(autonomyQueueRound(returned),2);
    assert.equal(singleFlightAutonomyMission(await repo.list()),null);
    const resumed=await repo.claimQueuedAutonomy(other);
    assert.equal(resumed.status,'PLANNING');
    assert.equal((await repo.get(holder.id)).status,'QUEUED');
    assert.equal(autonomyQueueRound(await repo.get(holder.id)),2);
  }finally{db?.close();}
});

test('never-tried objectives outrank second-pass retries despite priority',()=>{
  const roadmap=[row('MEL-FIRST-A','P0'),row('MEL-FIRST-B','P3')];
  assert.equal(selectNextAutonomyItem({roadmap,attemptedIds:['MEL-FIRST-A']}).id,'MEL-FIRST-B');
  assert.equal(selectNextAutonomyItem({roadmap,attemptedIds:['MEL-FIRST-A','MEL-FIRST-B']}).id,'MEL-FIRST-A');
  const prior={status:'QUEUED',result_json:{teacher_bridge:{status:'PENDING'}}};
  assert.equal(autonomyQueueRound(prior),2);
  assert.equal(autonomyQueueRound({status:'QUEUED',result_json:null}),1);
});

test('scheduler adds a first-pass mission while preserving the original queued second-pass job',async()=>{
  const repo=new D1DevJobRepository(null);
  const first=await repo.create(make('MEL-FIRST-A'));
  const claim=await repo.claimQueuedAutonomy(first.id,{expected:first});
  assert.equal(claim.status,'PLANNING');
  const queued=await repo.update(first.id,{status:'QUEUED'});
  const before=structuredClone(queued);
  const roadmap=[row('MEL-FIRST-A','P0'),row('MEL-FIRST-B','P3')];
  const supervisor=new AutonomySupervisor({repository:repo,roadmap,singleFlight:true});
  const step=await supervisor.ensureNextJob();
  assert.equal(step.next.id,'MEL-FIRST-B');
  assert.equal(step.job.optional_context.roadmap_id,'MEL-FIRST-B');
  assert.equal(step.job.status,'QUEUED');
  assert.deepEqual(await repo.get(first.id),before);
  const bClaim=await repo.claimQueuedAutonomy(step.job.id,{expected:step.job});
  assert.equal(bClaim.status,'PLANNING');
  assert.equal(await repo.claimQueuedAutonomy(first.id),null);
});

test('focused continuation cannot skip first pass to call a passive second-pass job',async()=>{
  const repo=new D1DevJobRepository(null);
  const first=await repo.create(make('MEL-FIRST-A'));
  await repo.claimQueuedAutonomy(first.id,{expected:first});
  await repo.update(first.id,{status:'QUEUED'});
  const supervisor=new AutonomySupervisor({repository:repo,roadmap:[row('MEL-FIRST-A'),row('MEL-FIRST-B')],onlyJobId:first.id});
  const result=await supervisor.ensureNextJob();
  assert.equal(result.job,null);
  assert.equal(result.external_progress.status,'QUEUED_SECOND_PASS_PENDING');
});

test('successful first-pass claim is fenced against canceled and stale jobs',async()=>{
  const db=sqliteD1();
  try{
    const repo=new D1DevJobRepository(db);
    const a=await repo.create(make('MEL-FIRST-A'));
    await repo.update(a.id,{status:'CANCELLED'});
    assert.equal(await repo.claimQueuedAutonomy(a.id),null);
    const b=await repo.create(make('MEL-FIRST-B'));
    const changed=await repo.update(b.id,{result_json:{evidence:'persisted'}});
    assert.equal(await repo.claimQueuedAutonomy(b.id,{expected:b}),null);
    assert.equal((await repo.claimQueuedAutonomy(b.id,{expected:changed})).status,'PLANNING');
  }finally{db.close();}
});
