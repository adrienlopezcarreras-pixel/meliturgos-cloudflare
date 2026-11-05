import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sqliteD1} from './helpers/sqlite-d1.mjs';
import {getAutonomyControl,setAutonomyControl} from '../src/evolution/autonomy-control.js';
import {maybeHandleReleaseLaunchBootstrap} from '../src/evolution/release-launch-bootstrap.js';
import {REPAIR_RELEASE_GATES} from '../src/evolution/verified-repair-release.js';

const SHA='a'.repeat(40),REPOSITORY='adrienlopezcarreras-pixel/meliturgos-cloudflare';
const ROOT=`https://api.github.com/repos/${REPOSITORY}/actions/runs/99`;
async function fixture(t){
 const DB=sqliteD1();t.after(()=>DB.close());
 const control=await setAutonomyControl(DB,{paused:true,max_autonomy:false,source:'owner-ui',reason:'owner-stop'});
 return {DB,control};
}
async function invoke(f,{body={},identity={},run={},jobs=null,prepare=null,setControl=null}={}){
 const requestBody={phase:'verified-repair-complete',owner_start:true,expected_owner_control_version:f.control.owner_control_version,...body};
 const request=new Request('https://mel.test/api/internal/release-launch-bootstrap?expected_sha='+SHA,{
  method:'POST',headers:{'content-type':'application/json','x-mel-github-oidc':'signed-fixture','x-mel-github-read-token':'private-fixture'},body:JSON.stringify(requestBody),
 });
 const previous=globalThis.fetch;
 let reads=0,prepared=0,ticks=0;
 globalThis.fetch=async url=>{
  reads++;assert.ok([ROOT,ROOT+'/jobs?per_page=100'].includes(String(url)));
  return Response.json(String(url)===ROOT
   ?{id:99,head_sha:SHA,repository:{full_name:REPOSITORY},path:'.github/workflows/deploy-cloudflare-release.yml',event:'workflow_dispatch',...run}
   :(jobs||{total_count:REPAIR_RELEASE_GATES.length+1,jobs:[...REPAIR_RELEASE_GATES.map(name=>({name,status:'completed',conclusion:'success'})),{name:'resume-verified-repair',status:'in_progress',conclusion:null}]}));
 };
 try{
  const response=await maybeHandleReleaseLaunchBootstrap(request,{DB:f.DB,MEL_DEPLOYED_GIT_SHA:SHA},{
   authorizeOidc:async()=>({ok:true,identity:{ok:true,repository:REPOSITORY,sha:SHA,run_id:99,event_name:'workflow_dispatch',actor:REPOSITORY.split('/')[0],...identity}}),
   prepare:async()=>{prepared++;return prepare?prepare():{ok:true,readiness:{launch_ready:true,candidate_sha:SHA,evaluated_at:'2026-11-05T12:00:00.000Z'}};},
   ...(setControl?{setControl}:{}),
   runAutonomyTick:async()=>{ticks++;throw new Error('owner callback must not execute a mission');},
  });
  return {response,body:await response.json(),reads,prepared,ticks};
 }finally{globalThis.fetch=previous;}
}

test('default callback and explicit false leave an owner STOP unchanged',async t=>{
 const f=await fixture(t);
 for(const owner_start of [undefined,false]){
  const result=await invoke(f,{body:{owner_start}});
  assert.equal(result.response.status,200);assert.equal(result.body.resumed,false);
  assert.deepEqual(await getAutonomyControl(f.DB),f.control);
  assert.equal(result.prepared,0);assert.equal(result.ticks,0);
 }
});
for(const identity of [{actor:'github-actions[bot]'},{actor:'another-owner'},{event_name:'push'},{event_name:'schedule'}])test('explicit owner start denies a non-owner or non-manual signed workflow: '+JSON.stringify(identity),async t=>{
 const f=await fixture(t),result=await invoke(f,{identity});
 assert.equal(result.response.status,403);assert.equal(result.body.code,'OWNER_START_MANUAL_OWNER_REQUIRED');
 assert.equal(result.reads,0);assert.equal(result.prepared,0);assert.equal(result.ticks,0);
 assert.deepEqual(await getAutonomyControl(f.DB),f.control);
});
for(const version of [undefined,null,0,-1,'12',1.5,Number.MAX_SAFE_INTEGER+1])test('owner start refuses invalid owner version '+String(version),async t=>{
 const f=await fixture(t),result=await invoke(f,{body:{expected_owner_control_version:version}});
 assert.equal(result.response.status,400);assert.equal(result.body.code,'OWNER_START_VERSION_INVALID');
 assert.equal(result.reads,0);assert.equal(result.prepared,0);
 assert.deepEqual(await getAutonomyControl(f.DB),f.control);
});
test('a future invented owner version cannot authorize a start',async t=>{
 const f=await fixture(t),result=await invoke(f,{body:{expected_owner_control_version:f.control.owner_control_version+100000}});
 assert.equal(result.response.status,409);assert.equal(result.body.status,'OWNER_START_VERSION_MISMATCH');
 assert.equal(result.prepared,0);assert.deepEqual(await getAutonomyControl(f.DB),f.control);
});
test('an owner command superseded by a newer STOP preserves it without failing a healthy release',async t=>{
 const f=await fixture(t);
 const stopped=await setAutonomyControl(f.DB,{paused:true,max_autonomy:false,source:'owner-ui',reason:'owner-stop'});
 const result=await invoke(f);
 assert.equal(result.response.status,200);assert.equal(result.body.owner_command,'SUPERSEDED');
 assert.equal(result.body.resumed,false);assert.equal(result.prepared,0);assert.equal(result.ticks,0);
 assert.deepEqual(await getAutonomyControl(f.DB),stopped);
});
test('failed health or mismatched release identity never reach launch preparation',async t=>{
 const f=await fixture(t);
 for(const options of [{run:{head_sha:'b'.repeat(40)}},{jobs:{total_count:0,jobs:[]}},{identity:{sha:'b'.repeat(40)}}]){
  const result=await invoke(f,options);
  assert.equal(result.response.status,409);assert.equal(result.prepared,0);assert.equal(result.ticks,0);
  assert.deepEqual(await getAutonomyControl(f.DB),f.control);
 }
});
test('owner start retains the full launch gate and exact deployed SHA',async t=>{
 const f=await fixture(t);
 for(const prepared of [{ok:false,readiness:{launch_ready:true,candidate_sha:SHA}},{ok:true,readiness:{launch_ready:false,candidate_sha:SHA}},{ok:true,readiness:{launch_ready:true,candidate_sha:'b'.repeat(40)}}]){
  const result=await invoke(f,{prepare:async()=>prepared});
  assert.equal(result.response.status,409);assert.equal(result.body.status,'OWNER_START_LAUNCH_GATE_BLOCKED');
  assert.deepEqual(await getAutonomyControl(f.DB),f.control);assert.equal(result.ticks,0);
 }
});
test('unresolved or malformed repair holds cannot be erased by owner start',async t=>{
 const f=await fixture(t);
 for(const repair of [{schema:'mel.autonomy-repair/v1',job_id:'held-job',owner_control_version:f.control.owner_control_version,started_at:Date.now()},{schema:'invalid'}]){
  await f.DB.prepare("UPDATE dev_bridge_state SET metadata_json=json_set(metadata_json,'$.repair',json(?)) WHERE bridge_id='mel-autonomy-control'").bind(JSON.stringify(repair)).run();
  const before=await getAutonomyControl(f.DB),result=await invoke(f);
  assert.equal(result.response.status,409);assert.equal(result.body.status,'OWNER_START_REPAIR_HOLD_UNRESOLVED');
  assert.deepEqual(await getAutonomyControl(f.DB),before);assert.equal(result.prepared,0);
 }
});
test('STOP during launch readiness wins the final control CAS and is reported as superseded',async t=>{
 const f=await fixture(t);let stopped;
 const result=await invoke(f,{prepare:async()=>{
  stopped=await setAutonomyControl(f.DB,{paused:true,max_autonomy:false,source:'owner-ui',reason:'owner-stop'});
  return {ok:true,readiness:{launch_ready:true,candidate_sha:SHA}};
 }});
 assert.equal(result.response.status,200);assert.equal(result.body.owner_command,'SUPERSEDED');
 assert.equal(result.body.resumed,false);assert.equal(result.ticks,0);
 assert.deepEqual(await getAutonomyControl(f.DB),stopped);
});
test('unrelated control write failures remain failures rather than successful starts',async t=>{
 const f=await fixture(t),result=await invoke(f,{setControl:async()=>{throw new Error('D1 unavailable');}});
 assert.equal(result.response.status,409);assert.equal(result.body.resumed,false);
 assert.deepEqual(await getAutonomyControl(f.DB),f.control);
});
test('matching explicit owner command persists a new owner intent after proven health, without running a mission',async t=>{
 const f=await fixture(t);
 // Technical release writes advance the row CAS clock but not owner intent.
 await setAutonomyControl(f.DB,{paused:true,max_autonomy:false,source:'release-predeploy-binder',reason:'predeploy-release-safety'});
 const result=await invoke(f),started=await getAutonomyControl(f.DB);
 assert.equal(result.response.status,200);assert.equal(result.body.owner_started,true);assert.equal(result.body.resumed,true);
 assert.equal(started.paused,false);assert.equal(started.max_autonomy,true);assert.equal(started.launch_approved_sha,SHA);
 assert.equal(started.source,'owner-release-command');assert.ok(started.owner_control_version>f.control.owner_control_version);
 assert.equal(result.prepared,1);assert.equal(result.ticks,0);
 assert.ok(!JSON.stringify(result.body).includes('private-fixture'));
 // A later STOP is still authoritative and is never undone by a default callback.
 const stopped=await setAutonomyControl(f.DB,{paused:true,max_autonomy:false,source:'owner-ui',reason:'owner-stop'});
 const again=await invoke(f,{body:{owner_start:false}});
 assert.equal(again.body.resumed,false);assert.deepEqual(await getAutonomyControl(f.DB),stopped);
});
test('already-active MAX is idempotent after proofs and does not churn owner intent',async t=>{
 const f=await fixture(t);
 f.control=await setAutonomyControl(f.DB,{paused:false,max_autonomy:true,source:'owner-ui-launch-gate',launch_approved_sha:SHA});
 const result=await invoke(f);
 assert.equal(result.response.status,200);assert.equal(result.body.owner_command,'ALREADY_ACTIVE');
 assert.equal(result.body.resumed,false);assert.equal(result.prepared,0);assert.equal(result.ticks,0);
 assert.deepEqual(await getAutonomyControl(f.DB),f.control);
});

test('canonical release owner-start opt-in defaults off and keeps the final callback read-only',async()=>{
 const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
 assert.match(source,/owner_start_after_verified_release:\n[\s\S]*?default: false\n\s+type: boolean/);
 assert.match(source,/expected_owner_control_version:\n[\s\S]*?type: string/);
 const callback=source.slice(source.indexOf('\n  resume-verified-repair:'));
 assert.match(callback,/needs: \[deploy, post-release-health\]/);
 assert.match(callback,/actions: read/);assert.doesNotMatch(callback,/actions: write/);
 assert.match(callback,/test "\$START_EVENT" = "workflow_dispatch"/);
 assert.match(callback,/test "\$START_ACTOR" = "\$REPOSITORY_OWNER"/);
 assert.match(callback,/Number\.isSafeInteger\(version\)/);
 assert.match(callback,/--data-binary @verified-repair-request\.json/);
 assert.doesNotMatch(callback,/workflow_dispatch[^\n]*dispatches|wrangler deploy|runAutonomyTick/);
});
