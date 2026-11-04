import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor, listAutonomySchedulerJobs } from '../src/evolution/autonomy-supervisor.js';
import { flattenRoadmap } from '../src/roadmap/master-roadmap.js';
import { createRoadmapCodeAcceptance, isAcceptedRoadmapCodeJob } from '../src/roadmap/roadmap-code-acceptance.js';

async function fixture({ hideInHistory = true } = {}) {
 const DB=sqliteD1(),repo=new D1DevJobRepository(DB);
 const roadmap=flattenRoadmap(),parent=roadmap.find(r=>r.id==='MEL-FOUNDER-02'),child=roadmap.find(r=>r.id==='MEL-MANIFEST-01');
 let job=await repo.create({id:'old-accepted-parent',requested_by:'mel-autonomy',goal:parent.title,
  optional_context:{roadmap_id:parent.id,roadmap_contract_revision:parent.contract_revision}});
 const files=[...parent.code_paths,...parent.test_paths].map(path=>({path,content:'large private implementation '.repeat(5000)}));
 await repo.update(job.id,{status:'COMPLETED',files_json:files});job=await repo.get(job.id);
 const sha='a'.repeat(40),branch='candidate/mel-clean-autonomy';
 const record={candidate_sha:sha,candidate_branch:branch,ci_run_id:42};
 const ci={verified:true,workflow:'full-candidate-ci',head_sha:sha,head_branch:branch,run_id:42,conclusion:'success'};
 const proof=createRoadmapCodeAcceptance(job,record,ci);
 await repo.update(job.id,{result_json:{roadmap_code_acceptance:proof,autonomy_completion:{status:'VERIFIED',candidate_sha:sha,candidate_branch:branch,ci,
  mel_implementation:{verified:true,providers_attempted:2},mentor_learning:{private_payload:'should not load '.repeat(5000)}}}});
 await DB.prepare('UPDATE dev_jobs SET created_at=1000,updated_at=1001 WHERE id=?').bind(job.id).run();
 for(let i=0;i<(hideInHistory?105:0);i++)await repo.create({id:'newer-ui-row-'+i,requested_by:'professor',goal:'unrelated interface row'});
 return {DB,repo,parent,child};
}

test('verified parent beyond 100 UI rows unlocks its child without reopening the delivered parent',async()=>{
 const f=await fixture();try{
  assert.equal((await f.repo.list()).some(j=>j.id==='old-accepted-parent'),false);
  const state=await new AutonomySupervisor({repository:f.repo,roadmap:[f.parent,f.child]}).state();
  assert.ok(state.verifiedDependencyIds.includes(f.parent.id));
  assert.ok(state.completedIds.includes(f.parent.id));
  assert.equal(state.next.id,f.child.id);
  assert.equal((await f.repo.get('old-accepted-parent')).status,'COMPLETED');
 }finally{f.DB.close();}
});

test('history lookup remains compact and validates the original receipt instead of loading code or private learning',async()=>{
 const f=await fixture();try{
  const jobs=await listAutonomySchedulerJobs(f.repo);
  const accepted=jobs.find(j=>j.id==='old-accepted-parent');
  assert.ok(accepted);assert.equal(isAcceptedRoadmapCodeJob(accepted),true);
  assert.ok(JSON.stringify(accepted).length<6000);
  assert.doesNotMatch(JSON.stringify(accepted),/large private implementation|should not load/);
 }finally{f.DB.close();}
});

test('wrong SHA and explicit regression still prevent historical acceptance from unlocking dependencies',async()=>{
 const f=await fixture();try{
  const job=await f.repo.get('old-accepted-parent');
  await f.repo.update(job.id,{result_json:{...job.result_json,autonomy_completion:{...job.result_json.autonomy_completion,ci:{...job.result_json.autonomy_completion.ci,head_sha:'b'.repeat(40)}}}});
  const state=await new AutonomySupervisor({repository:f.repo,roadmap:[f.parent,f.child]}).state();
  assert.ok(!state.verifiedDependencyIds.includes(f.parent.id));
  await f.repo.update(job.id,{result_json:job.result_json});
  const regressed=await new AutonomySupervisor({repository:f.repo,roadmap:[{...f.parent,status:'REGRESSED'},f.child]}).state();
  assert.ok(!regressed.verifiedDependencyIds.includes(f.parent.id));
 }finally{f.DB.close();}
});

test('a reset changes the active queue but does not erase an unchanged independently verified software receipt',async()=>{
 const f=await fixture({ hideInHistory:false });try{
  assert.ok((await f.repo.list()).some(j=>j.id==='old-accepted-parent'));
  const state=await new AutonomySupervisor({repository:f.repo,roadmap:[f.parent,f.child],epochMs:2000}).state();
  assert.ok(state.verifiedDependencyIds.includes(f.parent.id));
  assert.ok(state.completedIds.includes(f.parent.id));
  assert.equal(state.next.id,f.child.id);
 }finally{f.DB.close();}
});

test('compact history never coerces forged numeric/string trust flags or accepts malformed file scopes',async()=>{
 const f=await fixture();try{
  const original=await f.repo.get('old-accepted-parent');
  for(const [field,value] of [['verified',1],['verified','true'],['providers_attempted','2'],['providers_attempted',1]]){
   const result=structuredClone(original.result_json);
   result.autonomy_completion.mel_implementation[field]=value;
   await f.repo.update(original.id,{result_json:result});
   const compact=(await f.repo.listAutonomyAcceptanceJobs()).find(j=>j.id===original.id);
   assert.equal(isAcceptedRoadmapCodeJob(compact),false);
   assert.equal(compact.result_json.autonomy_completion.mel_implementation[field],value);
  }
  await f.repo.update(original.id,{result_json:original.result_json,files_json:['malformed-scope']});
  assert.equal(isAcceptedRoadmapCodeJob((await f.repo.listAutonomyAcceptanceJobs())[0]),false);
 }finally{f.DB.close();}
});

test('activity reset hides the old mission card while retaining truthful catalog and next-mission eligibility',async()=>{
 const f=await fixture();try{
  const {buildAutonomyActivity}=await import('../src/evolution/autonomy-activity.js');
  await f.DB.prepare('INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)').bind('activity-list-epoch',2000,'RESET','{}').run();
  const activity=await buildAutonomyActivity({DB:f.DB},{repository:f.repo});
  assert.ok(!activity.jobs.some(job=>job.id==='old-accepted-parent'));
  assert.ok(!activity.passive_roadmap.items.some(item=>item.id===f.parent.id));
  const child=activity.passive_roadmap.items.find(item=>item.id===f.child.id);
  assert.ok(!child.unmet_prerequisites.includes(f.parent.id));
  assert.ok(!activity.plan.next.some(item=>item.id===f.parent.id));
  assert.equal(activity.counts.active,0);
 }finally{f.DB.close();}
});
