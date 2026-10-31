import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, mkdtemp, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { flattenRoadmap, validateRoadmap } from '../src/roadmap/master-roadmap.js';
import { ROADMAP_CODE_CONTRACT_REVISION, assertRoadmapCodeChanges } from '../src/roadmap/roadmap-code-contracts.js';
import { validateRoadmapDependencies } from '../src/roadmap/roadmap-dependencies.js';
import { manifest01FoundationPrerequisites } from '../src/roadmap/manifest-01-acceptance.js';
import { AutonomySupervisor, selectNextAutonomyItem, BRIDGE_MENTOR_ROUNDS } from '../src/evolution/autonomy-supervisor.js';
import { refreshRoadmapCodeMissions } from '../src/evolution/roadmap-code-missions.js';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const canonical = flattenRoadmap();
const closed = row => ['DONE_VERIFIED','VERIFIED','ACCEPTED'].includes(row.status);

test('all 43 open objectives have real, bounded code and test targets; proven history remains separate', async () => {
  assert.deepEqual(validateRoadmap(), {ok:true,issues:[]});
  assert.equal(canonical.length,176);assert.equal(canonical.filter(closed).length,133);
  for (const row of canonical.filter(row => !closed(row))) {
    assert.equal(row.mode,'IMPLEMENT',row.id);assert.equal(row.required_proof,'DIFF_TESTS_EXACT_SHA_CI');
    assert.equal(row.max_attempts,3);assert.ok(row.acceptance.length);assert.ok(row.code_paths.length);assert.ok(row.test_paths.length);
    assert.ok(!row.code_paths.includes('src/roadmap/master-roadmap.js'));
    for(const path of [...row.code_paths,...row.test_paths])assert.ok((await stat(new URL('../'+path,import.meta.url))).size<200_000,path+' must fit the real bounded Bridge');
  }
  assert.equal(BRIDGE_MENTOR_ROUNDS,3);
});

test('the whole canonical graph schedules prerequisites before every dependent, without simulated completed jobs',()=>{
  const verified=canonical.filter(closed).map(row=>row.id), order=[];
  assert.deepEqual(validateRoadmapDependencies(canonical),[]);
  while(order.length<43){
    const next=selectNextAutonomyItem({roadmap:canonical,verifiedIds:verified,completedIds:verified});
    assert.ok(next,'an acyclic code deliverable must remain schedulable');
    for(const parent of next.depends_on)assert.ok(verified.includes(parent),next.id+' ran before '+parent);
    assert.ok(!order.includes(next.id));order.push(next.id);verified.push(next.id);
  }
  assert.equal(order[0],'MEL-FOUNDER-01');
  assert.ok(order.indexOf('MEL-FOUNDER-02')<order.indexOf('MEL-MANIFEST-01'));
  assert.ok(order.indexOf('MEL-FOUNDER-04')<order.indexOf('MEL-FOUNDER-03'));
  assert.equal(selectNextAutonomyItem({roadmap:canonical,verifiedIds:verified,completedIds:verified}),null);
});

test('physical acceptance cannot be certified by completion of the software harness',()=>{
  const rows=canonical.map(row=>row.id==='MEL-FOUNDER-06'?{...row,status:'DONE_VERIFIED'}:row);
  const physical=manifest01FoundationPrerequisites(rows).priorities.find(row=>row.priority===4);
  assert.equal(physical.status,'BLOCKED_HUMAN');assert.equal(physical.verified,false);assert.equal(physical.blocking,false);
});

test('the exact observed generated P4 declaration fails validation and cannot be shipped as a Manifest code patch',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'mel-roadmap-p4-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  for(const name of ['roadmap-dependencies.js','roadmap-code-contracts.js'])await cp(new URL('../src/roadmap/'+name,import.meta.url),join(dir,name));
  await writeFile(join(dir,'package.json'),'{"type":"module"}');
  const source=await readFile(new URL('../src/roadmap/master-roadmap.js',import.meta.url),'utf8');
  const bad="item('MEL-MANIFEST-01-P4', 'Priorité matérielle 4 du manifeste', 'BLOCKED_HUMAN', 'En pause, pas d’attente ni de programmation dans MAX.', 'P4'),\n    ";
  await writeFile(join(dir,'master-roadmap.js'),source.replace(/codeItem\("MEL-MANIFEST-02"/,bad+'codeItem("MEL-MANIFEST-02"'));
  const broken=await import(pathToFileURL(join(dir,'master-roadmap.js')).href);
  assert.ok(broken.validateRoadmap().issues.some(row=>row.type==='INVALID_PRIORITY'&&row.id==='MEL-MANIFEST-01-P4'));
  const job={requested_by:'mel-autonomy',optional_context:{roadmap_id:'MEL-MANIFEST-01',roadmap_contract_revision:ROADMAP_CODE_CONTRACT_REVISION}};
  assert.throws(()=>assertRoadmapCodeChanges(job,[{path:'src/roadmap/master-roadmap.js',content:bad}]),{code:'ROADMAP_CODE_SCOPE_VIOLATION'});
  assert.doesNotThrow(()=>assertRoadmapCodeChanges(job,[{path:'src/roadmap/manifest-01-acceptance.js'},{path:'tests/autonomy-readiness.test.mjs'}]));
});

for (const storage of ['memory','sqlite']) test(`replan an old declarative job, preserve its failed code and wait for verified prerequisites on ${storage}`,async t=>{
  const DB=storage==='sqlite'?sqliteD1():null;if(DB)t.after(()=>DB.close());
  const repository=new D1DevJobRepository(DB,{memoryStore:new Map()});
  const old=await repository.create({id:'old-manifest',requested_by:'mel-autonomy',goal:'Tenir le compte du manifeste',optional_context:{roadmap_id:'MEL-MANIFEST-01'}});
  await repository.update(old.id,{status:'TEACHER_APPROVED',files_json:[{path:'src/roadmap/master-roadmap.js',content:'bad P4 package'}],result_json:{dev_bridge:{status:'REPAIR_REQUIRED',needs_repair:true},teacher_bridge:{status:'ANSWERED'}}});
  assert.deepEqual(await refreshRoadmapCodeMissions(repository,await repository.list(),canonical),[old.id]);
  const current=await repository.get(old.id);
  assert.equal(current.status,'WAITING_DEPENDENCY');assert.equal(current.approval_status,'PENDING');assert.equal(current.result_json.teacher_bridge,undefined);
  assert.equal(current.result_json.superseded_code_contract.files[0].content,'bad P4 package');assert.deepEqual(current.files_json,[]);
  assert.deepEqual(current.result_json.dependency_wait.prerequisites,['MEL-FOUNDER-02']);
  assert.match(current.goal,/manifest-01-acceptance\.js/);assert.doesNotMatch(current.goal,/\| OBJECTIF/);
  assert.deepEqual(await refreshRoadmapCodeMissions(repository,await repository.list(),canonical),[],'a heartbeat or release must not repeatedly reset the same technical plan');
  const selected=await new AutonomySupervisor({repository,roadmap:canonical}).ensureNextJob();
  assert.equal(selected.job.optional_context.roadmap_id,'MEL-FOUNDER-01');assert.notEqual(selected.job.id,old.id);
});

for(const storage of ['memory','sqlite'])test(`roadmap absolute priority defers an older repair without deleting its evidence on ${storage}`,async t=>{
  const DB=storage==='sqlite'?sqliteD1():null;if(DB)t.after(()=>DB.close());
  const repository=new D1DevJobRepository(DB,{memoryStore:new Map()});
  const repair=await repository.create({id:'error-ledger-existing',requested_by:'mel-autonomy',goal:'repair later',optional_context:{source:'error-ledger'}});
  await repository.update(repair.id,{result_json:{evidence:{code:'REAL_ERROR'}}});
  const roadmap=[{id:'ROOT',title:'Implement the prerequisite',status:'PLANNED',priority:'P0',depends_on:[]}];
  const selected=await new AutonomySupervisor({repository,roadmap}).ensureNextJob();
  assert.equal(selected.job.optional_context.roadmap_id,'ROOT');
  const deferred=await repository.get(repair.id);assert.equal(deferred.status,'WAITING_DEPENDENCY');assert.equal(deferred.result_json.evidence.code,'REAL_ERROR');
  assert.equal(deferred.result_json.dependency_wait.reason,'ROADMAP_PRIORITY_ABSOLUTE');
});

for(const storage of ['memory','sqlite'])test(`a dependent unlocks only from an exact-SHA verified code receipt on ${storage}`,async t=>{
  const {createRoadmapCodeAcceptance,isAcceptedRoadmapCodeJob}=await import('../src/roadmap/roadmap-code-acceptance.js');
  const DB=storage==='sqlite'?sqliteD1():null;if(DB)t.after(()=>DB.close());
  const repository=new D1DevJobRepository(DB,{memoryStore:new Map()});
  const parent=canonical.find(row=>row.id==='MEL-FOUNDER-02'),child=canonical.find(row=>row.id==='MEL-MANIFEST-01');
  const created=await repository.create({id:'verified-parent',requested_by:'mel-autonomy',goal:parent.title,optional_context:{roadmap_id:parent.id,roadmap_contract_revision:parent.contract_revision}});
  const files=[...parent.code_paths,...parent.test_paths].map(path=>({path,content:'fixture reviewed code'}));
  await repository.update(created.id,{status:'COMPLETED',files_json:files});
  const supervisor=new AutonomySupervisor({repository,roadmap:[parent,child]});
  assert.ok(!(await supervisor.state()).verifiedDependencyIds.includes(parent.id),'a bare COMPLETED flag is not acceptance');
  const job=await repository.get(created.id),sha='a'.repeat(40),record={candidate_sha:sha,candidate_branch:'candidate/mel-clean-autonomy',ci_run_id:42};
  const ci={verified:true,workflow:'full-candidate-ci',head_sha:sha,head_branch:'candidate/mel-clean-autonomy',run_id:42,conclusion:'success'};
  const receipt=createRoadmapCodeAcceptance(job,record,ci);
  assert.throws(()=>createRoadmapCodeAcceptance(job,record,{...ci,head_sha:'b'.repeat(40)}),{code:'ROADMAP_CODE_ACCEPTANCE_CI_REQUIRED'});
  await repository.update(job.id,{result_json:{roadmap_code_acceptance:receipt,autonomy_completion:{status:'VERIFIED',candidate_sha:sha,candidate_branch:'candidate/mel-clean-autonomy',ci,mel_implementation:{verified:true,providers_attempted:2}}}});
  assert.equal(isAcceptedRoadmapCodeJob(await repository.get(job.id)),true);
  const selected=await supervisor.ensureNextJob();assert.equal(selected.job.optional_context.roadmap_id,child.id);
  assert.ok((await supervisor.state()).verifiedDependencyIds.includes(parent.id));
  const persisted=await repository.get(job.id);
  await repository.update(job.id,{result_json:{...persisted.result_json,autonomy_completion:{...persisted.result_json.autonomy_completion,ci:{...ci,verified:false}}}});
  assert.equal(isAcceptedRoadmapCodeJob(await repository.get(job.id)),false);
  assert.ok(!(await supervisor.state()).verifiedDependencyIds.includes(parent.id));
});

// 30/10 production: FOUNDER-01 was Council-approved as VERIFY_EXISTING three
// times on a green exact-SHA CI, yet the acceptance kept demanding a new diff
// (ROADMAP_CODE_AND_REGRESSION_REQUIRED): an objective already met could never close.
test('a Council-verified existing implementation is accepted without an artificial diff, only with its verification', async () => {
  const {createRoadmapCodeAcceptance,isAcceptedRoadmapCodeJob}=await import('../src/roadmap/roadmap-code-acceptance.js');
  const sha='c'.repeat(40),branch='candidate/mel-clean-autonomy';
  const job={id:'founder-verified',status:'COMPLETED',requested_by:'mel-autonomy',files_json:[],
    optional_context:{roadmap_id:'MEL-FOUNDER-01',roadmap_contract_revision:ROADMAP_CODE_CONTRACT_REVISION}};
  const record={candidate_sha:sha,candidate_branch:branch,ci_run_id:7};
  const ci={verified:true,workflow:'full-candidate-ci',head_sha:sha,head_branch:branch,run_id:7,conclusion:'success'};
  assert.throws(()=>createRoadmapCodeAcceptance(job,record,ci),{code:'ROADMAP_CODE_AND_REGRESSION_REQUIRED'});
  const receipt=createRoadmapCodeAcceptance(job,record,ci,{verifiedExisting:true});
  assert.equal(receipt.verification,'VERIFY_EXISTING');
  assert.throws(()=>createRoadmapCodeAcceptance(job,record,{...ci,conclusion:'failure'},{verifiedExisting:true}),{code:'ROADMAP_CODE_ACCEPTANCE_CI_REQUIRED'});
  const completion={status:'VERIFIED',candidate_sha:sha,candidate_branch:branch,ci,mel_implementation:{verified:true,providers_attempted:2}};
  const accepted={...job,result_json:{roadmap_code_acceptance:receipt,autonomy_completion:completion,verify_existing:{status:'VERIFIED',candidate_sha:sha}}};
  assert.equal(isAcceptedRoadmapCodeJob(accepted),true);
  // The no-diff exception needs the verification recorded on the same SHA.
  assert.equal(isAcceptedRoadmapCodeJob({...accepted,result_json:{...accepted.result_json,verify_existing:{status:'WAITING_VERIFICATION',candidate_sha:sha}}}),false);
  assert.equal(isAcceptedRoadmapCodeJob({...accepted,result_json:{...accepted.result_json,verify_existing:{status:'VERIFIED',candidate_sha:'d'.repeat(40)}}}),false);
  const {verification,...plainReceipt}=receipt;
  assert.equal(isAcceptedRoadmapCodeJob({...accepted,result_json:{...accepted.result_json,roadmap_code_acceptance:plainReceipt}}),false);
});
