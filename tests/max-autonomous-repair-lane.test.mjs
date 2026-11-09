import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteD1} from './helpers/sqlite-d1.mjs';
import {D1DevJobRepository} from '../src/dev/d1-dev-job-repository.js';
import {setAutonomyControl,getAutonomyControl} from '../src/evolution/autonomy-control.js';
import {beginAutomaticRepair,scopeRepairRepository,completeVerifiedRepair,repairLane,verifyUnchangedRepairDescendant,diagnoseUnchangedRepairDescendant} from '../src/evolution/autonomy-repair.js';
import {verifyRepairRelease,REPAIR_RELEASE_GATES} from '../src/evolution/verified-repair-release.js';
import {maybeHandleReleaseLaunchBootstrap} from '../src/evolution/release-launch-bootstrap.js';
import {flattenRoadmap} from '../src/roadmap/master-roadmap.js';
import {createRoadmapCodeAcceptance,isAcceptedRoadmapCodeJob,diagnoseRoadmapCodeAcceptance} from '../src/roadmap/roadmap-code-acceptance.js';
const sha='a'.repeat(40),repoName='adrienlopezcarreras-pixel/meliturgos-cloudflare';
async function fixture(t) {
 const db=sqliteD1();t.after(()=>db.close());const repo=new D1DevJobRepository(db);
 const a=await repo.create({id:'repair-a',requested_by:'mel-autonomy',goal:'A'});
 await repo.update(a.id,{status:'QUEUED',result_json:{autonomy_queue_pass:{round:3,passive:true},repair_cycle:{attempts:1}}});
 // Legacy queued successor must not gain the held execution slot.
 const b=await repo.create({id:'waiting-b',requested_by:'owner-chat',goal:'B'});
 await db.prepare("UPDATE dev_jobs SET requested_by='mel-autonomy' WHERE id=?").bind(b.id).run();
 const owner=await setAutonomyControl(db,{paused:false,max_autonomy:true,source:'owner-ui-launch-gate'});
 const control=await beginAutomaticRepair(db,await repo.get(a.id),owner);
 return {db,repo,a,b,owner,control};
}
test('real D1 reserves the repair slot, rejects normal third-pass claims and every other admission',async t=>{
 const {db,repo,a,b}=await fixture(t);
 assert.equal(await repo.claimQueuedAutonomy(a.id),null);
 assert.equal(await repo.claimQueuedRepair(b.id),null);
 await assert.rejects(repo.create({id:'third',requested_by:'mel-autonomy',goal:'unrelated'}));
 assert.equal(await repo.get('third'),null);
 const claimed=await repo.claimQueuedRepair(a.id,{expected:await repo.get(a.id)});
 assert.equal(claimed.status,'PLANNING');
 assert.equal((await repo.get(b.id)).status,'QUEUED');
 await repo.create({id:'direct-owner',requested_by:'owner-chat',goal:'direct request'});
});
test('owner STOP revokes the repair and wins over stale repair claims',async t=>{
 const {db,repo,a,control}=await fixture(t);
 const before=await repo.get(a.id);
 const stop=await setAutonomyControl(db,{paused:true,max_autonomy:false,source:'owner-ui',reason:'owner-stop'});
 assert.equal(stop.repair,null);
 assert.equal(await repo.claimQueuedRepair(a.id,{expected:before}),null);
 await assert.rejects(beginAutomaticRepair(db,before,control),{code:'AUTONOMY_CONTROL_CHANGED'});
 assert.equal((await completeVerifiedRepair(db,repo,{deployedSha:sha,releaseVerified:true})).status,'REPAIR_OWNER_STOP_PRESERVED');
 assert.equal((await getAutonomyControl(db)).max_autonomy,false);
});
test('repair claim requires fresh CAS, unexhausted existing budget and valid scope',async t=>{
 const {db,repo,a}=await fixture(t);
 const old=await repo.get(a.id);
 await repo.update(a.id,{result_json:{repair_cycle:{attempts:8,status:'EXHAUSTED'}}});
 assert.equal(await repo.claimQueuedRepair(a.id,{expected:old}),null);
 assert.equal(await repo.claimQueuedRepair(a.id),null);
 await repo.update(a.id,{result_json:{repair_cycle:{attempts:1}}});
 await db.prepare("UPDATE dev_bridge_state SET metadata_json=json_set(metadata_json,'$.repair.owner_control_version',1) WHERE bridge_id='mel-autonomy-control'").run();
 assert.equal((await getAutonomyControl(db)).repair_invalid,true);
 assert.equal(await repo.claimQueuedRepair(a.id),null);
 assert.equal(await repo.claimQueuedAutonomy(a.id),null);
});
test('scoped maintenance cannot read or write another mission, while historical prerequisite receipts remain readable',async t=>{
 const {repo,a,b}=await fixture(t);const scoped=scopeRepairRepository(repo,a.id);
 assert.equal(await scoped.get(b.id),null);
 assert.deepEqual((await scoped.list()).map(j=>j.id),[a.id]);
 for(const invoke of [()=>scoped.create({id:'new'}),()=>scoped.createIfAbsent({id:'new'}),()=>scoped.update(b.id,{status:'FAILED'}),()=>scoped.resumeSecondPassQueued(b.id),()=>scoped.claim()]) await assert.rejects(invoke);
 assert.equal(typeof scoped.listAutonomyAcceptanceJobs,'function');
 assert.equal((await repo.get(b.id)).status,'QUEUED');
});
test('technical release pause/restore preserves the exact repair authorization; bare completion never resumes it',async t=>{
 const {db,repo,a,control}=await fixture(t);
 const paused=await setAutonomyControl(db,{paused:true,max_autonomy:false,source:'release-predeploy-binder',reason:'predeploy-release-safety'});
 assert.equal(paused.owner_control_version,control.owner_control_version);
 const restored=await setAutonomyControl(db,{paused:false,max_autonomy:true,source:'verified-release-restore',expected_updated_at:paused.updated_at});
 assert.equal(repairLane(restored).job_id,a.id);
 await repo.update(a.id,{status:'COMPLETED'});
 assert.equal((await completeVerifiedRepair(db,repo,{deployedSha:sha,releaseVerified:true})).resumed,false);
 assert.equal((await getAutonomyControl(db)).repair.job_id,a.id);
});
test('unaccepted repair reports a safe reason and never releases another queued mission',async t=>{
 const {db,repo,a,b}=await fixture(t);
 const waiting=await repo.get(b.id);
 const result=await completeVerifiedRepair(db,repo,{deployedSha:sha,releaseVerified:true});
 assert.deepEqual(result,{ok:false,status:'REPAIR_DELIVERY_NOT_VERIFIED',reason:'REPAIR_MISSION_ACCEPTANCE_NOT_VERIFIED',resumed:false});
 assert.equal((await getAutonomyControl(db)).repair.job_id,a.id);
 assert.deepEqual(await repo.get(b.id),waiting);
 assert.doesNotMatch(JSON.stringify(result),/repair-a|waiting-b|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
});
test('only accepted exact-SHA delivery and verified deployment release the held stream',async t=>{
 const {db,repo,a}=await fixture(t);
 const item=flattenRoadmap().find(x=>x.id==='MEL-FOUNDER-02');
 await repo.update(a.id,{status:'COMPLETED',optional_context:{roadmap_id:item.id,roadmap_contract_revision:item.contract_revision},files_json:[...item.code_paths,...item.test_paths].map(path=>({path,content:'reviewed regression fixture'}))});
 const ci={verified:true,workflow:'full-candidate-ci',head_sha:sha,head_branch:'candidate/mel-clean-autonomy',run_id:42,conclusion:'success'};
 const completion={status:'VERIFIED',candidate_sha:sha,candidate_branch:ci.head_branch,ci_run_id:42,ci,mel_implementation:{verified:true,providers_attempted:2}};
 const receipt=createRoadmapCodeAcceptance(await repo.get(a.id),completion,ci);
 await repo.update(a.id,{result_json:{roadmap_code_acceptance:receipt,autonomy_completion:completion}});
 const releaseNotVerified=await completeVerifiedRepair(db,repo,{deployedSha:sha});
 assert.equal(releaseNotVerified.resumed,false);
 assert.equal(releaseNotVerified.reason,'REPAIR_RELEASE_HEALTH_NOT_VERIFIED');
 const wrongSha=await completeVerifiedRepair(db,repo,{deployedSha:'b'.repeat(40),releaseVerified:true});
 assert.equal(wrongSha.resumed,false);
 assert.equal(wrongSha.reason,'REPAIR_ACCEPTED_SHA_NOT_DEPLOYED');
 assert.equal((await getAutonomyControl(db)).repair.job_id,a.id);
 const stillHeld=await completeVerifiedRepair(db,repo,{deployedSha:'b'.repeat(40),releaseVerified:true,
  verifyDescendant:async()=>false});
 assert.equal(stillHeld.resumed,false);
 const diagnosticRejected=await completeVerifiedRepair(db,repo,{deployedSha:'b'.repeat(40),releaseVerified:true,
  verifyDescendant:async()=>({ok:false,diagnostic:'REPAIR_COMPARE_HTTP_403'})});
 assert.equal(diagnosticRejected.resumed,false);
 assert.equal(diagnosticRejected.diagnostic,'REPAIR_COMPARE_HTTP_403');
 assert.equal((await getAutonomyControl(db)).repair.job_id,a.id);
 const descendant=await completeVerifiedRepair(db,repo,{deployedSha:'b'.repeat(40),releaseVerified:true,
  verifyDescendant:async({acceptedSha,deployedSha,protectedPaths})=>{
   assert.equal(acceptedSha,sha);
   assert.equal(deployedSha,'b'.repeat(40));
   assert.ok(protectedPaths.includes(item.code_paths[0]));
   assert.ok(protectedPaths.includes(item.test_paths[0]));
   return {ok:true};
  }});
 assert.equal(descendant.resumed,true);
 assert.equal(descendant.control.repair,null);
 // Recreate the held repair to retain the original exact-SHA acceptance regression.
 const updated=await setAutonomyControl(db,{paused:false,max_autonomy:true,source:'bridge-repair-lane',
  repair:{schema:'mel.autonomy-repair/v1',job_id:a.id,
   owner_control_version:descendant.control.owner_control_version,started_at:Date.now()}});
 assert.ok(repairLane(updated));
 const done=await completeVerifiedRepair(db,repo,{deployedSha:sha,releaseVerified:true});
 assert.equal(done.resumed,true);assert.equal(done.control.repair,null);assert.equal(done.control.max_autonomy,true);
 assert.equal((await repo.get('waiting-b')).status,'QUEUED','no callback invents a next execution');
});
function releaseFixture() {
 const oidc={ok:true,identity:{ok:true,repository:repoName,sha,run_id:99}};
 const run={id:99,head_sha:sha,repository:{full_name:repoName},path:'.github/workflows/deploy-cloudflare-release.yml',event:'workflow_dispatch'};
 const jobs=REPAIR_RELEASE_GATES.map(name=>({name,status:'completed',conclusion:'success'}));
 jobs.push({name:'resume-verified-repair',status:'in_progress',conclusion:null});
 return {oidc,run,page:{total_count:jobs.length,jobs}};
}
test('post-deployment verification reads the actual run and all health jobs; incomplete, failed and paginated evidence is refused',async()=>{
 for(const corrupt of [null,'sha','missing','failed','pending','pages','other-workflow','other-repo']) {
  const f=releaseFixture();
  if(corrupt==='sha')f.run.head_sha='b'.repeat(40);
  if(corrupt==='missing')f.page.jobs.shift();
  if(corrupt==='failed')f.page.jobs[1].conclusion='failure';
  if(corrupt==='pending')f.page.jobs[1].status='in_progress';
  if(corrupt==='pages')f.page.total_count++;
  if(corrupt==='other-workflow')f.run.path='.github/workflows/forged.yml';
  if(corrupt==='other-repo')f.run.repository.full_name='foreign/repo';
  const result=await verifyRepairRelease({oidc:f.oidc,deployedSha:sha,token:'private-fixture',fetchImpl:async url=>Response.json(url.includes('/jobs?')?f.page:f.run)});
  assert.equal(result.ok,corrupt===null,String(corrupt));
  assert.ok(!JSON.stringify(result).includes('private-fixture'));
 }
});
test('release verification explains only safe failure classes and never reveals GitHub tokens',async()=>{
 const f=releaseFixture();
 for(const [response,reason] of [[new Response('',{status:403}),'RUN_HTTP_403'],[new Response('',{status:502}),'RUN_HTTP_502']]){
  const result=await verifyRepairRelease({oidc:f.oidc,deployedSha:sha,token:'private-fixture',fetchImpl:async()=>response});
  assert.equal(result.ok,false);assert.equal(result.reason,reason);
  assert.ok(!JSON.stringify(result).includes('private-fixture'));
 }
 for(const [fetchImpl,reason] of [
  [async()=>{throw new TypeError('network secret')},'RUN_FETCH_FAILED'],
  [async()=>new Response('not-json',{status:200}),'RUN_JSON_INVALID'],
 ]){
  const result=await verifyRepairRelease({oidc:f.oidc,deployedSha:sha,token:'private-fixture',fetchImpl});
  assert.equal(result.reason,reason);
  assert.ok(!JSON.stringify(result).includes('private-fixture'));
 }
 const mismatch=await verifyRepairRelease({oidc:f.oidc,deployedSha:'b'.repeat(40),token:'private-fixture',fetchImpl:async()=>{throw new Error('must not fetch')}});
 assert.equal(mismatch.reason,'IDENTITY_OR_TOKEN_INVALID');
});
test('repair completion endpoint rejects launch-bearer impersonation and SHA mismatches before any release read',async()=>{
 const request=()=>new Request('https://mel.test/api/internal/release-launch-bootstrap?expected_sha='+sha,{method:'POST',headers:{'x-mel-launch-bootstrap':'x'.repeat(32)},body:JSON.stringify({phase:'verified-repair-complete'})});
 const env={MEL_LAUNCH_BOOTSTRAP_TOKEN:'x'.repeat(32),MEL_DEPLOYED_GIT_SHA:sha};
 assert.equal((await maybeHandleReleaseLaunchBootstrap(request(),env,{authorizeOidc:async()=>({ok:false})})).status,401);
 assert.equal((await maybeHandleReleaseLaunchBootstrap(request(),env,{authorizeOidc:async()=>({ok:true,identity:{...releaseFixture().oidc.identity,sha:'b'.repeat(40)}})})).status,409);
 const validIdentity=await maybeHandleReleaseLaunchBootstrap(request(),env,{authorizeOidc:async()=>({ok:true,identity:releaseFixture().oidc.identity})});
 assert.notEqual((await validIdentity.json()).code,'REPAIR_RELEASE_SHA_MISMATCH','a verified matching OIDC identity must pass the exact-SHA guard');
});

test('the real runtime holds completed but unproven repair without selecting the queued successor or calling AI',async t=>{
 const {db,repo,a,b}=await fixture(t);
 await repo.update(a.id,{status:'COMPLETED'});
 await setAutonomyControl(db,{launch_approved_sha:sha,source:'verified-release-restore'});
 const before=await repo.get(b.id);let calls=0;
 const {runAutonomyRuntimeTick}=await import('../src/evolution/autonomy-runtime.js');
 const result=await runAutonomyRuntimeTick({DB:db,MEL_DEPLOYED_GIT_SHA:sha,MEL_GITHUB_BRANCH:'candidate/mel-clean-autonomy',MEL_TEACHER_BRANCH:'candidate/mel-clean-autonomy',AI:{run(){calls++;throw new Error('no AI expected');}}},
  {repository:repo,ignoreNeuronBudget:true,localPcReady:async()=>({ok:false}),roadmap:[]});
 assert.equal(result.status,'REPAIR_NEEDS_VALID_PACKAGE');assert.equal(result.repairing,true);
 assert.deepEqual(await repo.get(b.id),before);assert.equal(calls,0);
});

test('a current repair QUEUED revision re-enters only its authorized slot through the real runtime',async t=>{
 const {db,repo,a,b}=await fixture(t);
 await repo.update(a.id,{optional_context:{roadmap_id:'TEST-REPAIR'}});
 await setAutonomyControl(db,{launch_approved_sha:sha,source:'verified-release-restore'});
 const before=await repo.get(b.id);
 const {runAutonomyRuntimeTick}=await import('../src/evolution/autonomy-runtime.js');
 const result=await runAutonomyRuntimeTick({DB:db,MEL_DEPLOYED_GIT_SHA:sha,MEL_GITHUB_BRANCH:'candidate/mel-clean-autonomy',MEL_TEACHER_BRANCH:'candidate/mel-clean-autonomy'},
  {repository:repo,ignoreNeuronBudget:true,localPcReady:async()=>({ok:false}),roadmap:[{id:'TEST-REPAIR',title:'repair only',status:'PLANNED'}],fetchImpl:async()=>new Response('',{status:403})});
 assert.equal(result.repairing,true);
 assert.notEqual((await repo.get(a.id)).status,'QUEUED','repair entered the existing planning pipeline');
 assert.deepEqual(await repo.get(b.id),before);
});

test('rollback restoration cannot replace a newer owner STOP, and retains the repair scope on a technical rollback',async t=>{
 const {db,control}=await fixture(t);
 const pause=await setAutonomyControl(db,{paused:true,max_autonomy:false,source:'release-rollback-restore',reason:'restore-predeploy-autonomy-state'});
 const resume=await setAutonomyControl(db,{paused:false,max_autonomy:true,source:'release-rollback-restore',reason:'restore-predeploy-autonomy-state'});
 assert.equal(resume.owner_control_version,control.owner_control_version);
 assert.equal(repairLane(resume).job_id,'repair-a');
 await setAutonomyControl(db,{paused:true,max_autonomy:false,source:'owner-ui',reason:'owner-stop'});
 const stopped=await setAutonomyControl(db,{paused:false,max_autonomy:true,source:'release-rollback-restore',reason:'restore-predeploy-autonomy-state'});
 assert.equal(stopped.paused,true);assert.equal(stopped.max_autonomy,false);assert.equal(stopped.source,'owner-ui');
});

test('full candidate CI failure reserves repair before any next mission selection or model invocation',async t=>{
 const db=sqliteD1();t.after(()=>db.close());const repository=new D1DevJobRepository(db);
 await repository.create({id:'published',requested_by:'mel-autonomy',goal:'published code'});
 await repository.update('published',{status:'READY_FOR_REVIEW',result_json:{
  teacher_bridge:{status:'ANSWERED',request:{request_id:'request'},review:{request_id:'request',verdict:'APPROVE_PLAN',development_allowed:true}},
  bridge_preparation:{status:'READY',teacher_request_id:'request',candidate_branch:'candidate/mel-clean-autonomy',candidate_sha:'b'.repeat(40)},
  dev_bridge:{status:'READY_FOR_REVIEW',candidate_sha:sha,tests:[{passed:true}]},
 }});
 const other=await repository.create({id:'next-mission',requested_by:'mel-autonomy',goal:'next'});
 const before=await repository.get(other.id);
 await setAutonomyControl(db,{paused:false,max_autonomy:true,source:'owner-ui-launch-gate'});
 const {runAutonomyRuntimeTick:core}=await import('../src/evolution/autonomy-runtime-core.js');
 const result=await core({DB:db,MEL_GITHUB_REPOSITORY:repoName,MEL_TEACHER_BRANCH:'candidate/mel-clean-autonomy'},
  {repository,roadmap:[],maxAutonomy:true,fetchImpl:async url=>{
   const text=String(url);
   if(text.includes('teacher-bridge/'))return new Response('');
   if(text.includes('/commits/'))return Response.json({sha});
   return Response.json({workflow_runs:[{id:11,name:'full-candidate-ci',head_sha:sha,head_branch:'candidate/mel-clean-autonomy',status:'completed',conclusion:'failure'}]});
  }});
 assert.equal(result.status,'REPAIR_RESERVED');
 assert.equal((await getAutonomyControl(db)).repair.job_id,'published');
 assert.equal((await repository.get('published')).status,'REPAIR_REQUIRED');
 assert.deepEqual(await repository.get(other.id),before);
});

test('descendant compare requires complete immutable ancestry and unchanged mission files',async()=>{
 const acceptedSha='a'.repeat(40),deployedSha='b'.repeat(40),token='fixture-read-token';
 const protectedPaths=['src/mission.js','tests/mission.test.mjs'];
 const good={status:'ahead',ahead_by:3,behind_by:0,total_commits:3,
  commits:[{sha:'1'},{sha:'2'},{sha:'3'}],
  files:[{filename:'src/unrelated.js',status:'modified'}]};
 const verify=async(data,options={})=>verifyUnchangedRepairDescendant({
  acceptedSha,deployedSha,protectedPaths,token,
  fetchImpl:async(url,request)=>{
   assert.ok(url.includes(acceptedSha+'...'+deployedSha));
   assert.equal(new Headers(request.headers).get('authorization'),'Bearer '+token);
   assert.equal(request.redirect,'manual');
   assert.ok(new Headers(request.headers).get('user-agent'));
   return Response.json(data,options);
  },
 });
 assert.equal(await verify(good),true);
 for(const modified of [
  {...good,status:'diverged'},
  {...good,behind_by:1},
  {...good,total_commits:251},
  {...good,total_commits:4},
  {...good,files:[{filename:'src/mission.js'}]},
  {...good,files:[{filename:'src/new.js',previous_filename:'tests/mission.test.mjs'}]},
  {...good,files:Array.from({length:300},(_,i)=>({filename:'other/'+i}))},
 ])assert.equal(await verify(modified),false);
 assert.equal(await verifyUnchangedRepairDescendant({
  acceptedSha,deployedSha,protectedPaths,token,
  fetchImpl:async()=>new Response('unauthorized',{status:403})}),false);
 assert.equal(await verifyUnchangedRepairDescendant({
  acceptedSha,deployedSha,protectedPaths,token,
  fetchImpl:async()=>{throw new Error('unavailable')} }),false);
 assert.equal(await verifyUnchangedRepairDescendant({acceptedSha,deployedSha,protectedPaths,token:''}),false);
});

test('production diagnostic distinguishes GitHub authorization, changed files and incomplete compare without secrets',async()=>{
 const base={acceptedSha:'a'.repeat(40),deployedSha:'b'.repeat(40),
  protectedPaths:['src/evolution/autonomy-supervisor.js','tests/autonomy-runtime-evolution-queue-progress.test.mjs'],token:'hidden-gh-token'};
 const good={status:'ahead',ahead_by:12,behind_by:0,total_commits:12,
  commits:Array.from({length:12},(_,i)=>({sha:String(i)})),
  files:[{filename:'src/evolution/autonomy-repair.js'}]};
 const run=async response=>diagnoseUnchangedRepairDescendant({...base,fetchImpl:async()=>response});
 assert.deepEqual(await run(Response.json(good)),{ok:true});
 assert.deepEqual(await run(Response.json(good,{status:403})),{ok:false,diagnostic:'REPAIR_COMPARE_HTTP_403'});
 assert.deepEqual(await run(Response.json({...good,files:[{filename:base.protectedPaths[0]}]})),
  {ok:false,diagnostic:'REPAIR_COMPARE_PROTECTED_PATH_CHANGED'});
 assert.deepEqual(await run(Response.json({...good,total_commits:13})),
  {ok:false,diagnostic:'REPAIR_COMPARE_TRUNCATED'});
 assert.deepEqual(await run(Response.json({...good,status:'diverged'})),
  {ok:false,diagnostic:'REPAIR_COMPARE_ANCESTRY_INVALID'});
 assert.deepEqual(await run(new Response('not json')),
  {ok:false,diagnostic:'REPAIR_COMPARE_JSON_INVALID'});
 assert.deepEqual(await diagnoseUnchangedRepairDescendant({...base,fetchImpl:async()=>{throw Error('hidden-gh-token')}}),
  {ok:false,diagnostic:'REPAIR_COMPARE_FETCH_FAILED'});
 assert.deepEqual(await diagnoseUnchangedRepairDescendant({...base,token:''}),
  {ok:false,diagnostic:'REPAIR_COMPARE_INPUT_INVALID'});
});

test('safe repair diagnostics identify stale revision and missing evidence without releasing the lane',async t=>{
 const {db,repo,a}=await fixture(t);
 const item=flattenRoadmap().find(x=>x.id==='MEL-FOUNDER-02');
 await repo.update(a.id,{status:'COMPLETED',optional_context:{roadmap_id:item.id,roadmap_contract_revision:'obsolete-private-revision'}});
 let job=await repo.get(a.id);
 assert.equal(diagnoseRoadmapCodeAcceptance(job),'REPAIR_ACCEPTANCE_CONTRACT_REVISION_STALE');
 let result=await completeVerifiedRepair(db,repo,{deployedSha:sha,releaseVerified:true});
 assert.equal(result.diagnostic,'REPAIR_ACCEPTANCE_CONTRACT_REVISION_STALE');
 assert.equal(result.resumed,false);
 assert.ok(!JSON.stringify(result).includes('obsolete-private-revision'));
 await repo.update(a.id,{optional_context:{roadmap_id:item.id,roadmap_contract_revision:item.contract_revision}});
 job=await repo.get(a.id);
 assert.equal(diagnoseRoadmapCodeAcceptance(job),'REPAIR_ACCEPTANCE_RECEIPT_MISSING');
 result=await completeVerifiedRepair(db,repo,{deployedSha:sha,releaseVerified:true});
 assert.equal(result.diagnostic,'REPAIR_ACCEPTANCE_RECEIPT_MISSING');
 assert.equal((await getAutonomyControl(db)).repair.job_id,a.id);
});

test('diagnostic stays equivalent to canonical acceptance and never exposes source or SHA',async t=>{
 const {repo,a}=await fixture(t);
 const item=flattenRoadmap().find(x=>x.id==='MEL-FOUNDER-02');
 await repo.update(a.id,{status:'COMPLETED',optional_context:{roadmap_id:item.id,roadmap_contract_revision:item.contract_revision},
  files_json:[...item.code_paths,...item.test_paths].map(path=>({path,content:'private-test-content'}))});
 const ci={verified:true,workflow:'full-candidate-ci',head_sha:sha,head_branch:'candidate/mel-clean-autonomy',run_id:42,conclusion:'success'};
 const completion={status:'VERIFIED',candidate_sha:sha,candidate_branch:ci.head_branch,ci_run_id:42,ci,mel_implementation:{verified:true,providers_attempted:2}};
 const receipt=createRoadmapCodeAcceptance(await repo.get(a.id),completion,ci);
 await repo.update(a.id,{result_json:{roadmap_code_acceptance:receipt,autonomy_completion:completion}});
 const accepted=await repo.get(a.id);
 assert.equal(isAcceptedRoadmapCodeJob(accepted),true);
 assert.equal(diagnoseRoadmapCodeAcceptance(accepted),null);
 const corrupt={...accepted,result_json:{...accepted.result_json,autonomy_completion:{...completion,mel_implementation:{verified:false,providers_attempted:1}}}};
 assert.equal(isAcceptedRoadmapCodeJob(corrupt),false);
 const diagnostic=diagnoseRoadmapCodeAcceptance(corrupt);
 assert.equal(diagnostic,'REPAIR_ACCEPTANCE_IMPLEMENTATION_UNVERIFIED');
 assert.doesNotMatch(JSON.stringify({diagnostic}),/private-test-content|candidate\/mel|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|MEL-FOUNDER-02/);
});
