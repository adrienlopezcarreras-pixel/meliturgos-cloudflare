import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteD1} from './helpers/sqlite-d1.mjs';
import {D1DevJobRepository} from '../src/dev/d1-dev-job-repository.js';
import {setAutonomyControl,getAutonomyControl} from '../src/evolution/autonomy-control.js';
import {beginAutomaticRepair,scopeRepairRepository,completeVerifiedRepair,repairLane} from '../src/evolution/autonomy-repair.js';
import {verifyRepairRelease,REPAIR_RELEASE_GATES} from '../src/evolution/verified-repair-release.js';
import {maybeHandleReleaseLaunchBootstrap} from '../src/evolution/release-launch-bootstrap.js';
import {flattenRoadmap} from '../src/roadmap/master-roadmap.js';
import {createRoadmapCodeAcceptance} from '../src/roadmap/roadmap-code-acceptance.js';
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
test('only accepted exact-SHA delivery and verified deployment release the held stream',async t=>{
 const {db,repo,a}=await fixture(t);
 const item=flattenRoadmap().find(x=>x.id==='MEL-FOUNDER-02');
 await repo.update(a.id,{status:'COMPLETED',optional_context:{roadmap_id:item.id,roadmap_contract_revision:item.contract_revision},files_json:[...item.code_paths,...item.test_paths].map(path=>({path,content:'reviewed regression fixture'}))});
 const ci={verified:true,workflow:'full-candidate-ci',head_sha:sha,head_branch:'candidate/mel-clean-autonomy',run_id:42,conclusion:'success'};
 const completion={status:'VERIFIED',candidate_sha:sha,candidate_branch:ci.head_branch,ci_run_id:42,ci,mel_implementation:{verified:true,providers_attempted:2}};
 const receipt=createRoadmapCodeAcceptance(await repo.get(a.id),completion,ci);
 await repo.update(a.id,{result_json:{roadmap_code_acceptance:receipt,autonomy_completion:completion}});
 assert.equal((await completeVerifiedRepair(db,repo,{deployedSha:sha})).resumed,false);
 assert.equal((await completeVerifiedRepair(db,repo,{deployedSha:'b'.repeat(40),releaseVerified:true})).resumed,false);
 const done=await completeVerifiedRepair(db,repo,{deployedSha:sha,releaseVerified:true});
 assert.equal(done.resumed,true);assert.equal(done.control.repair,null);assert.equal(done.control.max_autonomy,true);
 assert.equal((await repo.get('waiting-b')).status,'QUEUED','no callback invents a next execution');
});
function releaseFixture() {
 const oidc={ok:true,repository:repoName,sha,run_id:99};
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
test('repair completion endpoint rejects launch-bearer impersonation and SHA mismatches before any release read',async()=>{
 const request=()=>new Request('https://mel.test/api/internal/release-launch-bootstrap?expected_sha='+sha,{method:'POST',headers:{'x-mel-launch-bootstrap':'x'.repeat(32)},body:JSON.stringify({phase:'verified-repair-complete'})});
 const env={MEL_LAUNCH_BOOTSTRAP_TOKEN:'x'.repeat(32),MEL_DEPLOYED_GIT_SHA:sha};
 assert.equal((await maybeHandleReleaseLaunchBootstrap(request(),env,{authorizeOidc:async()=>({ok:false})})).status,401);
 assert.equal((await maybeHandleReleaseLaunchBootstrap(request(),env,{authorizeOidc:async()=>({...releaseFixture().oidc,sha:'b'.repeat(40)})})).status,409);
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
