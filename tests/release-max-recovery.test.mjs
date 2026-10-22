import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { getAutonomyControl, setAutonomyControl, rememberedReleaseMax } from '../src/evolution/autonomy-control.js';
import { maybeHandleAutonomyApi } from '../src/evolution/autonomy-api.js';
import { maybeHandleReleaseLaunchBootstrap } from '../src/evolution/release-launch-bootstrap.js';
import { tryAcquireAutonomyRuntimeLease, releaseAutonomyRuntimeLease } from '../src/evolution/autonomy-runtime-lease.js';
import { preparePredeployRelease } from '../release-tools/predeploy-backup-binder/worker.js';
import { releaseOutcomeComment } from '../scripts/release-outcome-ledger.mjs';

const SHA='a'.repeat(40), OLD='b'.repeat(40), TOKEN='c'.repeat(64);
const env=db=>({DB:db,MEL_DEPLOYED_GIT_SHA:SHA,MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN});
const request=()=>new Request('https://mel.test/api/internal/release-launch-bootstrap?release_restore=true',{
 method:'POST',headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},body:JSON.stringify({phase:'gen2-42-owner-max'})
});
async function owner(db,max=true){return setAutonomyControl(db,{paused:false,max_autonomy:max,source:'owner-ui',reason:'owner-max-autonomy',launch_approved_sha:OLD});}
async function pause(db,afterDeploy=false){return setAutonomyControl(db,{paused:true,max_autonomy:false,
 source:afterDeploy?'release-launch-bootstrap':'release-predeploy-binder',
 reason:afterDeploy?'NEW_RELEASE_AWAITING_OWNER_LAUNCH':'predeploy-release-safety',
 ...(afterDeploy?{launch_approved_sha:null,launch_gate_digest:null}:{}),
});}
const ready=sha=>({ok:true,readiness:{launch_ready:true,candidate_sha:sha,evaluated_at:new Date().toISOString()}});
async function restore(db,{sha=SHA,prepare=async()=>ready(sha),tick=async()=>({ok:true,status:'ACTIVE'})}={}){
 return maybeHandleReleaseLaunchBootstrap(request(),env(db),{prepare,runAutonomyTick:tick});
}
async function usingDb(fn){const db=sqliteD1();try{await fn(db);}finally{db.close();}}

test('release workflow retains predeploy MAX intent only through a technical pause',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
 assert.match(workflow,/const predeployChoice=process\.env\.PREVIOUS_MAX_AUTONOMY==='true'/);
 assert.match(workflow,/rememberedReleaseMax\(control\) \|\| \(predeployChoice && isReleaseAutonomyPause\(control\)\)/);
 assert.equal(rememberedReleaseMax({paused:true,source:'release-launch-bootstrap',reason:'NEW_RELEASE_AWAITING_OWNER_LAUNCH',max_remembered:true}),true);
 assert.equal(rememberedReleaseMax({paused:true,source:'owner-ui',reason:'owner-emergency-stop',max_remembered:true}),false);
});

test('successful verified release restores previously active MAX on the gated deployed SHA',()=>usingDb(async db=>{
 await owner(db);await pause(db);await pause(db,true);
 const stopped=await getAutonomyControl(db);
 assert.equal(stopped.max_autonomy,false);assert.equal(stopped.max_remembered,true);assert.equal(stopped.launch_approved_sha,null);
 let ticks=0;const r=await restore(db,{tick:async()=>{ticks++;return {ok:true};}});
 assert.equal(r.status,200);assert.equal(ticks,1);
 const c=await getAutonomyControl(db);assert.equal(c.max_autonomy,true);assert.equal(c.launch_approved_sha,SHA);
}));

test('successful release with MAX deliberately off does not remember an automatic restore',()=>usingDb(async db=>{
 await owner(db,false);await pause(db);await pause(db,true);
 assert.equal(rememberedReleaseMax(await getAutonomyControl(db)),false);
 const workflow=readFileSync(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
 assert.match(workflow,/const maxAutonomy=rememberedReleaseMax\(d\)/);
 assert.match(workflow,/if: success\(\) && \(env.OWNER_MAX_AUTORELEASE == 'true' \|\| env.PREVIOUS_MAX_AUTONOMY == 'true'\)/);
}));

test('cancellation before deployment keeps execution paused and retains MAX for a subsequent verified release',()=>usingDb(async db=>{
 await owner(db);await pause(db); // execution stops here, no restore on cancellation
 const c=await getAutonomyControl(db);assert.equal(c.paused,true);assert.equal(c.max_autonomy,false);
 assert.equal(c.launch_approved_sha,OLD);assert.equal(rememberedReleaseMax(c),true);
 await pause(db,true);assert.equal((await restore(db)).status,200);
}));

test('cancellation after deployment cannot authorize the new SHA; subsequent release retains the owner choice',()=>usingDb(async db=>{
 await owner(db);await pause(db);await pause(db,true);
 let c=await getAutonomyControl(db);assert.equal(c.paused,true);assert.equal(c.launch_approved_sha,null);
 assert.equal(rememberedReleaseMax(c),true);
 // A retry/new official release sees the persisted intent, not the effective paused MAX=false.
 await pause(db);await pause(db,true);c=await getAutonomyControl(db);
 assert.equal(c.max_remembered,true);assert.equal(c.launch_approved_sha,null);
 let ticks=0;const blocked=await restore(db,{prepare:async()=>({ok:false,readiness:{launch_ready:false}}),tick:async()=>{ticks++;}});
 assert.equal(blocked.status,409);assert.equal(ticks,0);assert.equal((await getAutonomyControl(db)).paused,true);
 assert.equal((await restore(db)).status,200);
}));

test('stale SHA authorization or stale green readiness cannot restore MAX',()=>usingDb(async db=>{
 await owner(db);await pause(db);
 let ticks=0;const r=await restore(db,{sha:OLD,tick:async()=>{ticks++;}});
 assert.equal(r.status,409);assert.equal(ticks,0);assert.equal((await getAutonomyControl(db)).launch_approved_sha,OLD);
}));

test('active runtime lease stays owned and blocks overlap; recovery does not delete it',()=>usingDb(async db=>{
 await owner(db);await pause(db,true);
 const store=new Map();const held=await tryAcquireAutonomyRuntimeLease({owner:'active',now:1000,memoryStore:store});
 const blocked=await tryAcquireAutonomyRuntimeLease({owner:'recovery',now:2000,memoryStore:store});
 assert.equal(blocked.acquired,false);assert.equal(blocked.expires_at,held.expires_at);
 assert.equal(await releaseAutonomyRuntimeLease({owner:'recovery',memoryStore:store}),false);
 assert.equal((await getAutonomyControl(db)).paused,true);
}));

test('expired runtime lease can be acquired normally but never lifts a release pause',()=>usingDb(async db=>{
 await owner(db);await pause(db,true);
 const store=new Map();const first=await tryAcquireAutonomyRuntimeLease({owner:'old',now:1000,memoryStore:store});
 const next=await tryAcquireAutonomyRuntimeLease({owner:'new',now:first.expires_at+1,memoryStore:store});
 assert.equal(next.acquired,true);assert.equal(await releaseAutonomyRuntimeLease({owner:'old',memoryStore:store}),false);
 assert.equal((await getAutonomyControl(db)).paused,true);
}));

test('two concurrent restore attempts cannot both write control or execute the first tick',()=>usingDb(async db=>{
 await owner(db);await pause(db,true);
 let prepared=0,ticks=0,release;
 const barrier=new Promise(resolve=>{release=resolve;});
 const prepare=async()=>{if(++prepared===2)release();await barrier;return ready(SHA);};
 const tick=async()=>{ticks++;return {ok:true};};
 const results=await Promise.allSettled([restore(db,{prepare,tick}),restore(db,{prepare,tick})]);
 assert.equal(ticks,1);assert.equal(results.filter(x=>x.status==='fulfilled'&&x.value.status===200).length,1);
 assert.equal(results.filter(x=>x.status==='rejected'&&x.reason.code==='AUTONOMY_CONTROL_CHANGED').length,1);
 const workflow=readFileSync(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
 assert.match(workflow,/group: mel-launch-bootstrap-token\s+cancel-in-progress: false/);
 assert.match(workflow,/if: success\(\) && steps.restore_max.outputs.restored == 'true'/);
}));

test('replayed restore never runs the initial tick twice',()=>usingDb(async db=>{
 await owner(db);await pause(db,true);let ticks=0;const tick=async()=>{ticks++;return {ok:true};};
 await restore(db,{tick});const replay=await restore(db,{tick});
 assert.equal(ticks,1);assert.equal((await replay.json()).restore_skipped,true);
}));

test('missing D1 or unavailable Cloudflare readiness fails closed without a tick',()=>usingDb(async db=>{
 let ticks=0;
 await owner(db);await pause(db,true);
 const r=await restore(db,{prepare:async()=>({ok:false,readiness:{launch_ready:false,blockers:['CLOUDFLARE_UNAVAILABLE']}}),tick:async()=>{ticks++;}});
 assert.equal(r.status,409);assert.equal(ticks,0);
 const badDb={prepare(){throw new Error('D1_UNAVAILABLE');}};
 await assert.rejects(restore(badDb),/D1_UNAVAILABLE/);
 assert.equal((await getAutonomyControl(db)).paused,true);
}));

test('owner and safety pauses before or during readiness dominate every automatic restore',()=>usingDb(async db=>{
 await owner(db);await setAutonomyControl(db,{paused:true,source:'owner-ui',reason:'owner-emergency-stop'});
 await pause(db);await pause(db,true);
 let c=await getAutonomyControl(db);assert.equal(c.source,'owner-ui');assert.equal(c.max_remembered,false);
 assert.equal((await (await restore(db)).json()).restore_skipped,true);
 await owner(db);await pause(db,true);
 await assert.rejects(restore(db,{prepare:async()=>{
  await setAutonomyControl(db,{paused:true,source:'owner-ui',reason:'owner-emergency-stop'});return ready(SHA);
 }}),error=>error.code==='AUTONOMY_CONTROL_CHANGED');
 c=await getAutonomyControl(db);assert.equal(c.reason,'owner-emergency-stop');assert.equal(c.max_autonomy,false);
 await setAutonomyControl(db,{paused:true,source:'release-rollback-restore',reason:'rollback-safety'});
 await pause(db,true);c=await getAutonomyControl(db);assert.equal(c.reason,'rollback-safety');assert.equal(c.max_remembered,false);
}));

test('cancelled outcome is explicitly recoverable, never a grant to start MAX',()=>{
 const repo='adrienlopezcarreras-pixel/meliturgos-cloudflare';
 const comment=releaseOutcomeComment({action:'completed',workflow_run:{name:'deploy-cloudflare-release',id:123,head_sha:SHA,
  conclusion:'cancelled',event:'workflow_dispatch',head_branch:'main',repository:{full_name:repo},head_repository:{full_name:repo}}});
 assert.match(comment,/RECOVERY_REQUIRED/);assert.match(comment,/Conserver la pause/);assert.match(comment,/nouvelle release officielle entièrement vérifiée/);
});


test('the actual predeploy binder preserves remembered MAX across retries without reporting effective MAX',()=>usingDb(async db=>{
 await owner(db);await pause(db,true);
 await preparePredeployRelease({DB:db,MEDIA_BUCKET:{head:async()=>null}});
 const c=await getAutonomyControl(db);assert.equal(c.paused,true);assert.equal(c.max_autonomy,false);assert.equal(c.max_remembered,true);
}));

test('remembered preference never becomes effective MAX merely because a stored row is not paused',()=>usingDb(async db=>{
 await owner(db,false);
 await db.prepare("UPDATE dev_bridge_state SET metadata_json=json_set(metadata_json,'$.max_remembered',json('true')) WHERE bridge_id='mel-autonomy-control'").run();
 assert.equal((await getAutonomyControl(db)).max_autonomy,false);
 assert.equal(rememberedReleaseMax({paused:true,max_autonomy:true,source:'owner-ui'}),false);
}));


test('public capture exposes only fixed release provenance, never an owner pause message',()=>usingDb(async db=>{
 await owner(db);await pause(db,true);
 const read=async()=>{const r=await maybeHandleAutonomyApi(new Request('https://mel.test/api/gen2/autonomy/control'),{DB:db});return r.json();};
 let c=await read();assert.equal(c.max_remembered,true);assert.equal(c.source,'release-launch-bootstrap');
 await setAutonomyControl(db,{paused:true,source:'owner-ui',reason:'Private owner explanation'});
 c=await read();assert.equal(c.source,null);assert.equal(c.reason,null);assert.equal(c.max_remembered,false);
}));
