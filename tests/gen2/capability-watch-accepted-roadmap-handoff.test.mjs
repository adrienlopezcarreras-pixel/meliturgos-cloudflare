import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteD1} from '../helpers/sqlite-d1.mjs';
import {D1DevJobRepository} from '../../src/dev/d1-dev-job-repository.js';
import {flattenRoadmap} from '../../src/roadmap/master-roadmap.js';
import {createRoadmapCodeAcceptance} from '../../src/roadmap/roadmap-code-acceptance.js';
import {proveEcosystemTeacherHandoff} from '../../src/evaluation/capability-watch-runtime.js';

async function fixture(){
 const DB=sqliteD1(),repo=new D1DevJobRepository(DB),row=flattenRoadmap().find(r=>r.id==='MEL-FOUNDER-07');
 const context={roadmap_id:row.id,roadmap_contract_revision:row.contract_revision,source:'ecosystem-watch'};
 let done=await repo.create({id:'accepted-restore',requested_by:'mel-autonomy',goal:row.title,optional_context:context});
 await repo.update(done.id,{status:'COMPLETED',files_json:[...row.code_paths,...row.test_paths].map(path=>({path,content:'fixture'}))});
 done=await repo.get(done.id);
 const sha='a'.repeat(40),branch='candidate/mel-clean-autonomy',ci={verified:true,workflow:'full-candidate-ci',conclusion:'success',head_sha:sha,head_branch:branch,run_id:42};
 const receipt=createRoadmapCodeAcceptance(done,{candidate_sha:sha,candidate_branch:branch,ci_run_id:42},ci);
 await repo.update(done.id,{result_json:{roadmap_code_acceptance:receipt,autonomy_completion:{status:'VERIFIED',candidate_sha:sha,candidate_branch:branch,ci,mel_implementation:{verified:true,providers_attempted:2}}}});
 const queued=await repo.create({id:'passive-duplicate',requested_by:'mel-autonomy',goal:row.title,optional_context:context});
 const ledger={items:[{fingerprint:'existing-restore',handoff:{job_id:queued.id,status:'QUEUED',teacher_request_id:'obsolete-request',closed:false}}]};
 await DB.prepare('INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)').bind('ecosystem-discoveries-canonical',JSON.stringify(ledger),1).run();
 return {DB,repo,done,queued};
}

test('release proof reuses an accepted passive roadmap duplicate without executing or completing its job',async()=>{
 const f=await fixture();try{
  const before=await f.repo.get(f.queued.id);let calls=0;
  const options={developmentRepository:f.repo,resumeTeacherRequest:async()=>{calls++;throw Error('MUST_NOT_EXECUTE');},mirrorTeacherRequest:async()=>{calls++;throw Error('MUST_NOT_MIRROR');}};
  const proof=await proveEcosystemTeacherHandoff({DB:f.DB},options);
  assert.equal(proof.ok,true);assert.equal(proof.status,'GEN2_42_TEACHER_HANDOFF_IDLE_VERIFIED');assert.equal(proof.open_handoff_count,0);assert.equal(calls,0);
  assert.equal(proof.production_activation_allowed,false);assert.equal(proof.auto_approval_allowed,false);
  assert.deepEqual(await f.repo.get(f.queued.id),before);
  const ledger=JSON.parse((await f.DB.prepare('SELECT state_json FROM capability_watch_state WHERE id=?').bind('ecosystem-discoveries-canonical').first()).state_json);
  assert.equal(ledger.items[0].handoff.accepted_job_id,f.done.id);assert.equal(ledger.items[0].handoff.status,'REUSE_EXISTING');
  assert.equal(ledger.items[0].handoff.candidate_sha,'a'.repeat(40));assert.equal(ledger.items[0].handoff.ci_run_id,42);
  assert.equal((await proveEcosystemTeacherHandoff({DB:f.DB},options)).ok,true);assert.equal(calls,0);
 }finally{f.DB.close();}
});

test('invalid acceptance cannot close a blocked handoff, including after a formerly valid reconciliation',async()=>{
 const f=await fixture();try{
  assert.equal((await proveEcosystemTeacherHandoff({DB:f.DB},{developmentRepository:f.repo})).ok,true);
  const done=await f.repo.get(f.done.id),result=structuredClone(done.result_json);result.autonomy_completion.ci.head_sha='b'.repeat(40);
  await f.repo.update(done.id,{result_json:result});
  const proof=await proveEcosystemTeacherHandoff({DB:f.DB},{developmentRepository:f.repo});
  assert.equal(proof.ok,false);assert.equal(proof.blocked_open_handoff_count,1);
  const ledger=JSON.parse((await f.DB.prepare('SELECT state_json FROM capability_watch_state WHERE id=?').bind('ecosystem-discoveries-canonical').first()).state_json);
  assert.equal(ledger.items[0].handoff.closed,false);assert.equal(ledger.items[0].handoff.accepted_job_id,null);
 }finally{f.DB.close();}
});

test('a different roadmap contract revision is not certified by the historical receipt',async()=>{
 const f=await fixture();try{
  const queued=await f.repo.get(f.queued.id);await f.repo.update(queued.id,{optional_context:{...queued.optional_context,roadmap_contract_revision:'new-unverified-contract'}});
  const proof=await proveEcosystemTeacherHandoff({DB:f.DB},{developmentRepository:f.repo});
  assert.equal(proof.ok,false);assert.equal(proof.blocked_open_handoff_count,1);
 }finally{f.DB.close();}
});

test('an admission CAS conflict without any job or Teacher is retryable, while unrelated failures stay blocking',async()=>{
 for(const [handoff,allowed] of [
  [{status:'FAILED',code:'JOB_UPDATE_CONFLICT',job_id:null,teacher_request_id:null},true],
  [{status:'FAILED',code:'JOB_UPDATE_CONFLICT',job_id:'unknown-job',teacher_request_id:null},false],
  [{status:'FAILED',code:'JOB_UPDATE_CONFLICT',job_id:null,teacher_request_id:'existing-teacher'},false],
  [{status:'FAILED',code:'TEACHER_REJECT',job_id:null,teacher_request_id:null},false],
 ]){
  const DB=sqliteD1(),repo=new D1DevJobRepository(DB);try{
   await repo.init();
   await DB.prepare('INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)').bind('ecosystem-discoveries-canonical',JSON.stringify({items:[{fingerprint:'conflict',handoff:{...handoff,closed:false,retryable:false}}]}),1).run();
   let called=false;
   const proof=await proveEcosystemTeacherHandoff({DB},{developmentRepository:repo,resumeTeacherRequest:async()=>{called=true;}});
   assert.equal(proof.ok,allowed);assert.equal(called,false);assert.equal(proof.released_retryable_failure_count,allowed?1:0);
   assert.equal((await repo.list()).length,0);
  }finally{DB.close();}
 }
});
