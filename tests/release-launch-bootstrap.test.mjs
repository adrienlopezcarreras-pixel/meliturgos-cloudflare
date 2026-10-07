import test from 'node:test';
import assert from 'node:assert/strict';

import { maybeHandleReleaseLaunchBootstrap, __launchBootstrapTest } from '../src/evolution/release-launch-bootstrap.js';
import { readAutonomyLaunchReadinessPublicCache } from '../src/evolution/launch-readiness.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createAlternativeRegistry } from '../src/portability/prevalidated-alternative-registry.js';
import { D1AlternativeRegistryStore } from '../src/portability/d1-alternative-registry-store.js';

const TOKEN='a'.repeat(64);

test('release bootstrap ignores unrelated routes and rejects non-POST methods', async () => {
  assert.equal(await maybeHandleReleaseLaunchBootstrap(new Request('https://mel.test/other'), {}), null);
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap'),
    {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN},
  );
  assert.equal(response.status,405);
});

test('release bootstrap fails closed without exact temporary secret', async () => {
  for(const supplied of ['', 'a'.repeat(63), 'b'.repeat(64)]){
    const response=await maybeHandleReleaseLaunchBootstrap(
      new Request('https://mel.test/api/internal/release-launch-bootstrap',{
        method:'POST',
        headers:{'x-mel-launch-bootstrap':supplied},
      }),
      {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN},
      {prepare:async()=>{throw new Error('must not run')},setControl:async()=>{throw new Error('must not run')}},
    );
    assert.equal(response.status,401);
    assert.equal((await response.json()).code,'BOOTSTRAP_AUTH_REQUIRED');
  }
  assert.equal(__launchBootstrapTest.equalToken(TOKEN,TOKEN),true);
});

test('exact-SHA source-control reuse accepts only fresh matching zero-cost prevalidation', () => {
  const now=Date.now();
  const sha='7'.repeat(40);
  const proof=(sourceSha,expiresAt=new Date(now+60000).toISOString())=>({
    isolated_test:true,smoke:true,rollback:true,export:true,import:true,activate:true,
    verified_at:new Date(now-1000).toISOString(),
    expires_at:expiresAt,
    evidence_ref:'runtime://test',
    source_sha:sourceSha,
  });
  const registry=createAlternativeRegistry([
    {id:'source.exact',layer:'source_control',provider:'local-git',added_cost_eur:0,proof:proof(sha)},
    {id:'source.other',layer:'source_control',provider:'local-git-2',added_cost_eur:0,proof:proof('8'.repeat(40))},
    {id:'source.expired',layer:'source_control',provider:'local-git-3',added_cost_eur:0,proof:proof('9'.repeat(40),new Date(now-1000).toISOString())},
  ],{now});

  assert.equal(__launchBootstrapTest.exactShaReusableAlternative(registry,'source_control',sha,{now})?.id,'source.exact');
  assert.equal(__launchBootstrapTest.exactShaReusableAlternative(registry,'source_control','8'.repeat(40),{now})?.id,'source.other');
  assert.equal(__launchBootstrapTest.exactShaReusableAlternative(registry,'source_control','9'.repeat(40),{now}),null);
  assert.equal(__launchBootstrapTest.exactShaReusableAlternative(registry,'source_control','bad-sha',{now}),null);
});

test('sovereignty source-control refresh reuses exact-SHA proof offline and rejects mismatched proof', async () => {
  const now=Date.now();
  const deployedSha='6'.repeat(40);
  const proofSha=sha=>({
    isolated_test:true,smoke:true,rollback:true,export:true,import:true,activate:true,
    verified_at:new Date(now-1000).toISOString(),
    expires_at:new Date(now+86400000).toISOString(),
    evidence_ref:'runtime://source-control-offline-proof',
    source_sha:sha,
  });
  const request=()=>new Request('https://mel.test/api/internal/release-launch-bootstrap?refresh=source_control',{
    method:'POST',
    headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
    body:JSON.stringify({phase:'sovereignty-proof'}),
  });

  for (const [sourceSha,expectedStatus,expectedReuse] of [
    [deployedSha,200,true],
    ['5'.repeat(40),409,false],
  ]) {
    const DB=sqliteD1();
    try {
      const store=new D1AlternativeRegistryStore(DB);
      await store.save(createAlternativeRegistry([{
        id:'source.offline',
        layer:'source_control',
        provider:'local-companion-git',
        adapter_id:'companion-local-git',
        added_cost_eur:0,
        proof:proofSha(sourceSha),
      }],{now}));

      const response=await maybeHandleReleaseLaunchBootstrap(request(),{
        MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,
        MEL_DEPLOYED_GIT_SHA:deployedSha,
        DB,
      });
      assert.equal(response.status,expectedStatus);
      const body=await response.json();
      assert.equal(body.autonomy_started,false);
      assert.equal(body.secret_values_exposed,false);
      assert.equal(body.deployed_sha,deployedSha);
      if(expectedReuse){
        assert.equal(body.ok,true);
        assert.equal(body.status,'MEL_SOV_01_REFRESH_STEP_VERIFIED');
        assert.equal(body.refresh?.status,'EXACT_SHA_PREVALIDATED_REUSED');
        assert.equal(body.refresh?.reused_exact_sha_prevalidation,true);
        assert.equal(body.refresh?.proof_source_sha,deployedSha);
      }else{
        assert.equal(body.ok,false);
        assert.equal(body.status,'MEL_SOV_01_REFRESH_STEP_FAILED');
        assert.notEqual(body.refresh?.reused_exact_sha_prevalidation,true);
      }
    } finally {
      DB.close();
    }
  }
});

test('AI sovereignty refresh fails closed when no concrete prevalidated AI alternative is produced', async () => {
  const deployedSha='6'.repeat(40);
  const DB=sqliteD1();
  try {
    const response=await maybeHandleReleaseLaunchBootstrap(
      new Request('https://mel.test/api/internal/release-launch-bootstrap?refresh=ai_local',{
        method:'POST',
        headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
        body:JSON.stringify({phase:'sovereignty-proof'}),
      }),
      {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,MEL_DEPLOYED_GIT_SHA:deployedSha,DB},
    );
    assert.equal(response.status,409);
    const body=await response.json();
    assert.equal(body.ok,false);
    assert.equal(body.status,'MEL_SOV_01_REFRESH_STEP_FAILED');
    assert.equal(body.refresh_target,'ai_local');
    assert.equal(body.refresh?.verified,false);
    assert.equal(Number(body.refresh?.prevalidated||0),0);
    assert.equal(body.autonomy_started,false);
  } finally {
    DB.close();
  }
});

test('release bootstrap pauses inherited autonomy before preparing exact-SHA launch evidence', async () => {
  const calls=[];
  const readiness={
    ok:true,
    status:'GO_FOR_SUPERVISED_AUTONOMY',
    launch_ready:true,
    candidate_branch:'candidate/mel-clean-autonomy',
    candidate_sha:'c'.repeat(40),
    gate_digest:'d'.repeat(64),
    gates:{verified_restore_dry_run:true,shardvault_critical_survival:true},
    blockers:[],
    failure_hygiene:{ok:true,retry_cap:3,historical_failed_count:94,unbounded_failed_count:0,code:'FAILURE_HISTORY_BOUNDED'},
    restore:{ok:true,status:'LATEST_SYSTEM_BACKUP_RESTORE_VERIFIED',snapshot_id:'system-1',deployed_sha:'c'.repeat(40),backup_deployed_sha:'c'.repeat(40),sha_matches:true},
    shardvault:{ok:true,status:'SHARDVAULT_7X_CODE_SURVIVAL_VERIFIED',recoverable:true,active_external_count:7,external_code_status:'COPIED',external_code_endpoints:7,target_count:7},
  };
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN},
    }),
    {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB:{}},
    {
      setControl:async(_db,input)=>{calls.push(['control',input]); return input;},
      prepare:async()=>{calls.push(['prepare']); return {ok:true,status:'LAUNCH_EVIDENCE_READY',readiness};},
    },
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.autonomy_started,false);
  assert.equal(body.owner_launch_required,true);
  assert.equal(body.readiness.launch_ready,true);
  assert.equal(body.readiness.restore.sha_matches,true);
  assert.equal(body.readiness.shardvault.external_code_endpoints,7);
  assert.equal(calls[0][0],'control');
  assert.equal(calls[0][1].paused,true);
  assert.equal(calls[0][1].max_autonomy,false);
  assert.equal(calls[0][1].launch_approved_sha,null);
  assert.deepEqual(calls[1],['prepare']);
});

test('release bootstrap returns 409 and leaves autonomy paused when evidence is incomplete', async () => {
  const controls=[];
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN},
    }),
    {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB:{}},
    {
      setControl:async(_db,input)=>{controls.push(input);},
      prepare:async()=>({ok:false,status:'LAUNCH_EVIDENCE_INCOMPLETE',readiness:{
        ok:true,status:'NO_GO',launch_ready:false,blockers:['SHARDVAULT_LAUNCH_PROOF_INCOMPLETE'],
        gates:{shardvault_critical_survival:false},
      }}),
    },
  );
  assert.equal(response.status,409);
  const body=await response.json();
  assert.equal(body.ok,false);
  assert.equal(body.owner_launch_required,true);
  assert.equal(controls[0].paused,true);
});


test('release backup phase reuses exact SHA-bound restore proof without rebuilding backup', async () => {
  const sha='e'.repeat(40);
  let backupCalls=0;
  const readiness={
    ok:true,
    status:'GO_FOR_SUPERVISED_AUTONOMY',
    launch_ready:true,
    candidate_sha:sha,
    gates:{verified_restore_dry_run:true,shardvault_critical_survival:true},
    blockers:[],
    failure_hygiene:{ok:true,retry_cap:3,historical_failed_count:0,unbounded_failed_count:0,code:'FAILURE_HISTORY_BOUNDED'},
    restore:{ok:true,status:'LATEST_SYSTEM_BACKUP_RESTORE_PROOF_VERIFIED',snapshot_id:'system-existing',deployed_sha:sha,backup_deployed_sha:sha,sha_matches:true},
    shardvault:{ok:true,status:'PAUSED_FOR_ROADMAP',paused:true,temporary:true,resume_condition:'ROADMAP_COMPLETE',recoverable:false,active_external_count:0,external_code_status:'PAUSED_FOR_ROADMAP',external_code_endpoints:0,target_count:7},
  };
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
      body:JSON.stringify({phase:'backup'}),
    }),
    {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,MEL_DEPLOYED_GIT_SHA:sha,DB:{}},
    {
      setControl:async()=>({}),
      readReadiness:async()=>readiness,
      prepareBackup:async()=>{backupCalls+=1; throw new Error('HEAVY_BACKUP_MUST_NOT_RUN');},
    },
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.status,'REUSED_VERIFIED_SHA_BOUND_BACKUP');
  assert.equal(body.backup.status,'REUSED_VERIFIED_SHA_BOUND_BACKUP');
  assert.equal(body.backup.id,'system-existing');
  assert.equal(body.backup.deployed_sha,sha);
  assert.equal(backupCalls,0);
});

test('release readiness phase persists a fresh exact-SHA public proof cache', async () => {
  const DB=sqliteD1();
  const sha='d'.repeat(40);
  const readiness={
    ok:true,
    status:'GO_FOR_SUPERVISED_AUTONOMY',
    launch_ready:true,
    candidate_branch:'candidate/mel-clean-autonomy',
    candidate_sha:sha,
    gate_digest:'e'.repeat(64),
    gates:{verified_restore_dry_run:true,shardvault_critical_survival:true},
    blockers:[],
    failure_hygiene:{ok:true,retry_cap:3,historical_failed_count:0,unbounded_failed_count:0,code:'FAILURE_HISTORY_BOUNDED'},
    restore:{ok:true,status:'RELEASE_BOUND_SYSTEM_BACKUP_RESTORE_PROOF_VERIFIED',snapshot_id:'system-cache',deployed_sha:sha,backup_deployed_sha:sha,sha_matches:true},
    shardvault:{ok:true,status:'SHARDVAULT_QUORUM_CODE_SURVIVAL_VERIFIED',recoverable:true,active_external_count:5,external_code_status:'QUORUM_COPIED',external_code_endpoints:5,target_count:7,release_quorum:5,code_reconstruction_verified:true},
    evaluated_at:new Date().toISOString(),
  };
  try {
    const response=await maybeHandleReleaseLaunchBootstrap(
      new Request('https://mel.test/api/internal/release-launch-bootstrap',{
        method:'POST',
        headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
        body:JSON.stringify({phase:'readiness'}),
      }),
      {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,MEL_DEPLOYED_GIT_SHA:sha,DB},
      {
        setControl:async()=>({paused:true,max_autonomy:false}),
        readReadiness:async()=>readiness,
        prepareBackup:async()=>{throw new Error('CACHE_TEST_MUST_NOT_REPAIR_BACKUP');},
      },
    );
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.public_cache?.ok,true);
    assert.equal(body.public_cache?.candidate_sha,sha);

    const cached=await readAutonomyLaunchReadinessPublicCache({DB,MEL_DEPLOYED_GIT_SHA:sha});
    assert.equal(cached.ok,true,JSON.stringify(cached));
    assert.equal(cached.readiness?.launch_ready,true);
    assert.equal(cached.readiness?.candidate_sha,sha);
    assert.equal(cached.readiness?.status,'GO_FOR_SUPERVISED_AUTONOMY');
  } finally {
    DB.close();
  }
});

test('release bootstrap exposes bounded pause, backup, code-sync and readiness phases', async () => {
  const calls=[];
  const ready={
    ok:true,
    status:'GO_FOR_SUPERVISED_AUTONOMY',
    launch_ready:true,
    candidate_sha:'d'.repeat(40),
    gates:{verified_restore_dry_run:true,shardvault_critical_survival:true},
    blockers:[],
    failure_hygiene:{ok:true,retry_cap:3,historical_failed_count:0,unbounded_failed_count:0,code:'FAILURE_HISTORY_BOUNDED'},
    restore:{ok:true,status:'LATEST_SYSTEM_BACKUP_RESTORE_VERIFIED',deployed_sha:'d'.repeat(40),backup_deployed_sha:'d'.repeat(40),sha_matches:true},
    shardvault:{ok:true,status:'SHARDVAULT_7X_CODE_SURVIVAL_VERIFIED',recoverable:true,active_external_count:7,external_code_status:'COPIED',external_code_endpoints:7,target_count:7},
  };
  const deps={
    setControl:async(_db,input)=>{calls.push(['control',input.reason]); return input;},
    prepare:async()=>{throw new Error('legacy all phase must not run');},
    prepareBackup:async()=>({ok:true,status:'CREATED_VERIFIED',id:'system-test'}),
    prepareCodeSync:async()=>({ok:true,complete:true,status:'COPIED',code_sync:{ok:true,complete:true,status:'COPIED',endpoints:Array(7).fill('x')}}),
    readReadiness:async()=>ready,
  };
  const request=phase=>new Request('https://mel.test/api/internal/release-launch-bootstrap',{
    method:'POST',
    headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
    body:JSON.stringify({phase}),
  });

  const pause=await maybeHandleReleaseLaunchBootstrap(request('pause'),{MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB:{}},deps);
  assert.equal(pause.status,200);
  const pauseBody=await pause.json();
  assert.equal(pauseBody.status,'RELEASE_PAUSED');
  assert.equal(pauseBody.paused,true);
  assert.equal(pauseBody.max_autonomy,false);
  assert.equal(pauseBody.autonomy_started,false);

  const backup=await maybeHandleReleaseLaunchBootstrap(request('backup'),{MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB:{}},deps);
  assert.equal(backup.status,200);
  assert.equal((await backup.json()).backup.id,'system-test');

  const sync=await maybeHandleReleaseLaunchBootstrap(request('code-sync'),{MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB:{}},deps);
  assert.equal(sync.status,200);
  assert.equal((await sync.json()).complete,true);

  const readiness=await maybeHandleReleaseLaunchBootstrap(request('readiness'),{MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB:{}},deps);
  assert.equal(readiness.status,200);
  assert.equal((await readiness.json()).readiness.launch_ready,true);
  assert.equal(calls.length,4);
  assert.ok(calls.every(row=>row[1]==='NEW_RELEASE_AWAITING_OWNER_LAUNCH'));
});


test('readiness repairs one transient release backup SHA binding mismatch then rechecks the gate', async () => {
  const sha='9'.repeat(40);
  let reads=0;
  let repairs=0;
  const mismatch={
    ok:true,
    status:'NO_GO',
    launch_ready:false,
    candidate_sha:sha,
    blockers:['SYSTEM_BACKUP_DEPLOYED_SHA_MISMATCH'],
    gates:{verified_restore_dry_run:false,shardvault_critical_survival:true},
    restore:{ok:false,status:'SYSTEM_BACKUP_DEPLOYED_SHA_MISMATCH',deployed_sha:sha,backup_deployed_sha:'8'.repeat(40),sha_matches:false},
    shardvault:{ok:true,status:'PAUSED_FOR_ROADMAP',paused:true,temporary:true,resume_condition:'ROADMAP_COMPLETE',recoverable:false,active_external_count:0,external_code_status:'PAUSED_FOR_ROADMAP',external_code_endpoints:0,target_count:7},
  };
  const ready={
    ...mismatch,
    status:'GO_FOR_SUPERVISED_AUTONOMY',
    launch_ready:true,
    blockers:[],
    gates:{verified_restore_dry_run:true,shardvault_critical_survival:true},
    restore:{ok:true,status:'RELEASE_BOUND_SYSTEM_BACKUP_RESTORE_PROOF_VERIFIED',snapshot_id:'system-bound',deployed_sha:sha,backup_deployed_sha:sha,snapshot_deployed_sha:'8'.repeat(40),sha_matches:true},
  };
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
      body:JSON.stringify({phase:'readiness'}),
    }),
    {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,MEL_DEPLOYED_GIT_SHA:sha,DB:{}},
    {
      setControl:async()=>({}),
      readReadiness:async()=>{reads+=1; return reads===1?mismatch:ready;},
      prepareBackup:async()=>{repairs+=1; return {ok:true,status:'RELEASE_BOUND_VERIFIED_BACKUP',id:'system-bound',deployedSha:sha};},
    },
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.readiness.launch_ready,true);
  assert.equal(body.backup_repair?.attempted,true);
  assert.equal(body.backup_repair?.ok,true);
  assert.equal(body.backup_repair?.status,'RELEASE_BOUND_VERIFIED_BACKUP');
  assert.equal(repairs,1);
  assert.equal(reads,2);
});

test('readiness backup binding repair remains fail-closed when mismatch persists', async () => {
  const sha='a'.repeat(40);
  let reads=0;
  let repairs=0;
  const mismatch={
    ok:true,
    status:'NO_GO',
    launch_ready:false,
    candidate_sha:sha,
    blockers:['SYSTEM_BACKUP_DEPLOYED_SHA_MISMATCH'],
    gates:{verified_restore_dry_run:false,shardvault_critical_survival:true},
    restore:{ok:false,status:'SYSTEM_BACKUP_DEPLOYED_SHA_MISMATCH',deployed_sha:sha,backup_deployed_sha:'b'.repeat(40),sha_matches:false},
    shardvault:{ok:true,status:'PAUSED_FOR_ROADMAP',paused:true,temporary:true,resume_condition:'ROADMAP_COMPLETE',recoverable:false,active_external_count:0,external_code_status:'PAUSED_FOR_ROADMAP',external_code_endpoints:0,target_count:7},
  };
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
      body:JSON.stringify({phase:'readiness'}),
    }),
    {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,MEL_DEPLOYED_GIT_SHA:sha,DB:{}},
    {
      setControl:async()=>({}),
      readReadiness:async()=>{reads+=1; return mismatch;},
      prepareBackup:async()=>{repairs+=1; return {ok:false,status:'NO_RECENT_VERIFIED_SYSTEM_BACKUP'};},
    },
  );
  assert.equal(response.status,409);
  const body=await response.json();
  assert.equal(body.ok,false);
  assert.equal(body.readiness.launch_ready,false);
  assert.equal(body.backup_repair?.attempted,true);
  assert.equal(body.backup_repair?.ok,false);
  assert.equal(repairs,1);
  assert.equal(reads,1);
});

test('release bootstrap rejects unknown phase before running preparation', async () => {
  let prepared=false;
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
      body:JSON.stringify({phase:'huge-all-at-once'}),
    }),
    {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN},
    {prepare:async()=>{prepared=true;}},
  );
  assert.equal(response.status,400);
  assert.equal((await response.json()).code,'BOOTSTRAP_PHASE_INVALID');
  assert.equal(prepared,false);
});

test('release bootstrap capability-watch proof requires a real waiting Teacher handoff and never auto-approves', async () => {
  const request=()=>new Request('https://mel.test/api/internal/release-launch-bootstrap',{
    method:'POST',
    headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
    body:JSON.stringify({phase:'capability-watch-proof'}),
  });
  const calls=[];
  const env={MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB:{}};
  const ok=await maybeHandleReleaseLaunchBootstrap(request(),env,{
    setControl:async(_db,input)=>{calls.push(input);},
    proveCapabilityWatch:async()=>({
      ok:true,
      status:'GEN2_42_TEACHER_HANDOFF_READY',
      active_teacher_handoff_count:1,
      job_id:'ecosystem-watch-live',
      teacher_request_id:'req-live',
      candidate_sha:'a'.repeat(40),
      production_activation_allowed:false,
      auto_approval_allowed:false,
    }),
  });
  assert.equal(ok.status,200);
  const body=await ok.json();
  assert.equal(body.ok,true);
  assert.equal(body.status,'GEN2_42_TEACHER_HANDOFF_READY');
  assert.equal(body.job_id,'ecosystem-watch-live');
  assert.equal(body.teacher_request_id,'req-live');
  assert.equal(body.production_activation_allowed,false);
  assert.equal(body.auto_approval_allowed,false);
  assert.equal(body.autonomy_started,false);
  assert.equal(calls[0].paused,true);

  const blocked=await maybeHandleReleaseLaunchBootstrap(request(),env,{
    setControl:async()=>{},
    proveCapabilityWatch:async()=>({
      ok:false,
      status:'GEN2_42_TEACHER_HANDOFF_NOT_READY',
      active_teacher_handoff_count:0,
    }),
  });
  assert.equal(blocked.status,409);
  assert.equal((await blocked.json()).ok,false);

  const progress=await maybeHandleReleaseLaunchBootstrap(request(),env,{
    setControl:async()=>{},
    proveCapabilityWatch:async()=>({
      ok:true,
      status:'GEN2_42_TEACHER_HANDOFF_PROGRESS_VERIFIED',
      progress_verified:true,
      open_handoff_count:2,
      active_teacher_handoff_count:0,
      teacher_proven_handoff_count:2,
      blocked_open_handoff_count:0,
      job_id:'ecosystem-watch-approved',
      teacher_request_id:'req-approved',
      production_activation_allowed:false,
      auto_approval_allowed:false,
    }),
  });
  assert.equal(progress.status,200);
  assert.equal((await progress.json()).status,'GEN2_42_TEACHER_HANDOFF_PROGRESS_VERIFIED');

  const idle=await maybeHandleReleaseLaunchBootstrap(request(),env,{
    setControl:async()=>{},
    proveCapabilityWatch:async()=>({
      ok:true,
      status:'GEN2_42_TEACHER_HANDOFF_IDLE_VERIFIED',
      idle_verified:true,
      open_handoff_count:0,
      active_teacher_handoff_count:0,
      teacher_proven_handoff_count:0,
      blocked_open_handoff_count:0,
      production_activation_allowed:false,
      auto_approval_allowed:false,
    }),
  });
  assert.equal(idle.status,200);
  assert.equal((await idle.json()).status,'GEN2_42_TEACHER_HANDOFF_IDLE_VERIFIED');
});


test('Provider Escape accepts an exact release binding without rereading the backup payload', async () => {
  const DB=sqliteD1();
  const objects=new Map();
  let getCount=0;
  const MEDIA_BUCKET={
    async put(key,value){ objects.set(String(key),String(value)); },
    async get(key){
      getCount+=1;
      if(!objects.has(String(key))) return null;
      const value=objects.get(String(key));
      return {
        async text(){ return value; },
        async arrayBuffer(){ return new TextEncoder().encode(value).buffer; },
      };
    },
    async delete(key){ objects.delete(String(key)); },
    async list({prefix=''}={}){
      const rows=[...objects.entries()]
        .filter(([key])=>String(key).startsWith(String(prefix||'')))
        .map(([key,value])=>({key,size:new TextEncoder().encode(value).byteLength,etag:'test',uploaded:new Date(0)}));
      return {objects:rows,truncated:false};
    },
  };
  const oldSha='1'.repeat(40);
  const newSha='2'.repeat(40);
  const env={
    MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,
    DB,
    MEDIA_BUCKET,
    AI:{run:async()=>({response:'ok'})},
    MEL_DEPLOYED_GIT_SHA:oldSha,
    MEL_DEPLOYED_GIT_BRANCH:'release/test',
    MEL_SHARDVAULT_ROADMAP_PAUSED:'true',
  };
  const request=phase=>new Request('https://mel.test/api/internal/release-launch-bootstrap',{
    method:'POST',
    headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
    body:JSON.stringify({phase}),
  });
  try {
    const initial=await maybeHandleReleaseLaunchBootstrap(request('backup'),env);
    assert.equal(initial.status,200);
    const initialBody=await initial.json();
    assert.equal(initialBody.backup.ok,true);

    env.MEL_DEPLOYED_GIT_SHA=newSha;
    const rebound=await maybeHandleReleaseLaunchBootstrap(request('backup'),env);
    assert.equal(rebound.status,200);
    const reboundBody=await rebound.json();
    assert.equal(reboundBody.backup.ok,true);
    assert.equal(reboundBody.backup.status,'RELEASE_BOUND_VERIFIED_BACKUP');

    getCount=0;
    const response=await maybeHandleReleaseLaunchBootstrap(request('provider-escape-proof'),env);
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.status,'MEL_RES_03_PRODUCTION_MANIFEST_VERIFIED');
    assert.equal(body.backup_id,reboundBody.backup.id);
    assert.equal(body.backup_verified,true);
    assert.equal(body.release_bound,true);
    assert.equal(body.snapshot_deployed_sha,oldSha);
    assert.match(body.release_binding_sha256,/^[0-9a-f]{64}$/);
    assert.equal(getCount,0,'Provider Escape release-bound proof must remain metadata-only');
  } finally {
    DB.close();
  }
});

test('release bootstrap Skill Registry proof persists, restores, rolls back and is replay-safe', async () => {
  const DB=sqliteD1();
  const env={MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB,MEL_DEPLOYED_GIT_SHA:'e'.repeat(40)};
  const request=()=>new Request('https://mel.test/api/internal/release-launch-bootstrap',{
    method:'POST',
    headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
    body:JSON.stringify({phase:'skill-registry-proof'}),
  });
  try {
    for(let attempt=0;attempt<2;attempt+=1){
      const response=await maybeHandleReleaseLaunchBootstrap(request(),env);
      assert.equal(response.status,200);
      const body=await response.json();
      assert.equal(body.ok,true);
      assert.equal(body.status,'MEL_EVOL_05_PRODUCTION_D1_VERIFIED');
      assert.equal(body.restored_before_rollback,'1.1.0');
      assert.equal(body.restored_after_rollback,'1.0.0');
    }
  } finally {
    DB.close();
  }
});


test('release bootstrap backend proof drills are durable and replay-safe', async () => {
  const DB=sqliteD1();
  const env={
    MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,
    DB,
    MEL_DEPLOYED_GIT_SHA:'f'.repeat(40),
    MEL_DEPLOYED_GIT_BRANCH:'release/test',
  };
  const request=phase=>new Request('https://mel.test/api/internal/release-launch-bootstrap',{
    method:'POST',
    headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
    body:JSON.stringify({phase}),
  });
  try {
    for (const phase of ['plugin-sdk-proof','evolution-ledger-proof','agent-automation-proof']) {
      const first=await maybeHandleReleaseLaunchBootstrap(request(phase),env);
      assert.equal(first.status,200,phase+' first');
      const firstBody=await first.json();
      assert.equal(firstBody.ok,true,phase+' first ok');

      const second=await maybeHandleReleaseLaunchBootstrap(request(phase),env);
      assert.equal(second.status,200,phase+' replay');
      const secondBody=await second.json();
      assert.equal(secondBody.ok,true,phase+' replay ok');

      if (phase==='plugin-sdk-proof') {
        assert.equal(secondBody.status,'GEN2_15_PRODUCTION_D1_VERIFIED');
        assert.equal(secondBody.active_version,'1.0.0');
        assert.equal(secondBody.replay_safe,true);
        assert.ok(secondBody.activation_history_count>=4);
      }
      if (phase==='evolution-ledger-proof') {
        assert.equal(secondBody.status,'MEL_EVOL_04_PRODUCTION_LEDGER_VERIFIED');
        assert.equal(secondBody.proof_event_count,2);
        assert.equal(secondBody.replay_safe,true);
      }
      if (phase==='agent-automation-proof') {
        assert.equal(secondBody.status,'GEN2_39_PRODUCTION_D1_VERIFIED');
        assert.equal(secondBody.run_status,'COMPLETED');
        assert.equal(secondBody.persisted_across_adapter_recreation,true);
      }
    }
  } finally {
    DB.close();
  }
});


test('release bootstrap builds a Provider Escape Capsule from a freshly verified backup', async () => {
  const DB=sqliteD1();
  const objects=new Map();
  const MEDIA_BUCKET={
    async put(key,value){ objects.set(String(key),String(value)); },
    async get(key){
      if(!objects.has(String(key))) return null;
      const value=objects.get(String(key));
      return {
        async text(){ return value; },
        async arrayBuffer(){ return new TextEncoder().encode(value).buffer; },
      };
    },
    async delete(key){ objects.delete(String(key)); },
    async list({prefix=''}={}){
      const rows=[...objects.entries()]
        .filter(([key])=>String(key).startsWith(String(prefix||'')))
        .map(([key,value])=>({key,size:new TextEncoder().encode(value).byteLength,etag:'test',uploaded:new Date(0)}));
      return {objects:rows,truncated:false};
    },
  };
  try {
    const env={
      MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,
      DB,
      MEDIA_BUCKET,
      AI:{run:async()=>({response:'ok'})},
      MEL_DEPLOYED_GIT_SHA:'1'.repeat(40),
      MEL_DEPLOYED_GIT_BRANCH:'release/test',
    };
    const request=phase=>new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
      body:JSON.stringify({phase}),
    });

    const backupResponse=await maybeHandleReleaseLaunchBootstrap(request('backup'),env);
    assert.equal(backupResponse.status,200);
    const backupBody=await backupResponse.json();
    assert.equal(backupBody.ok,true);
    assert.equal(backupBody.backup.ok,true);
    assert.ok(backupBody.backup.id);

    const response=await maybeHandleReleaseLaunchBootstrap(request('provider-escape-proof'),env);
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.status,'MEL_RES_03_PRODUCTION_MANIFEST_VERIFIED');
    assert.equal(body.backup_id,backupBody.backup.id);
    assert.equal(body.backup_verified,true);
    assert.match(body.backup_integrity_sha256,/^[0-9a-f]{64}$/);
    assert.equal(body.backup_encrypted,false);
    assert.equal(body.ready_to_escape,true);
    assert.deepEqual(body.ready_layers,['ai','storage','runtime']);
    assert.ok(body.alternative_adapter_count>=3);
    assert.equal(body.validation_issue_count,0);
    assert.equal(body.execution_started,false);
    assert.equal(body.activation_allowed,false);
  } finally {
    DB.close();
  }
});


test('release bootstrap proves long-context compression on a real-shaped archived conversation without returning content', async () => {
  const DB=sqliteD1();
  try {
    await DB.prepare(`CREATE TABLE archive_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      device_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments_json TEXT,
      model TEXT,
      capabilities_used_json TEXT,
      system_prompt_version TEXT,
      timestamp INTEGER NOT NULL,
      provenance TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}'
    )`).run();
    for (let i=0;i<24;i+=1) {
      const role=i%2===0?'user':'assistant';
      const decision=i===2
        ? 'Décision importante : il faut conserver cette contrainte de production avant le prochain lot. '
        : '';
      const content=decision + ('x'.repeat(3600)) + ' message-' + i;
      await DB.prepare('INSERT INTO archive_messages(id,conversation_id,role,content,timestamp) VALUES(?,?,?,?,?)')
        .bind('m-'+i,'real-long-conversation',role,content,i+1).run();
    }
    const env={
      MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,
      DB,
      MEL_DEPLOYED_GIT_SHA:'2'.repeat(40),
      MEL_DEPLOYED_GIT_BRANCH:'release/test',
    };
    const response=await maybeHandleReleaseLaunchBootstrap(
      new Request('https://mel.test/api/internal/release-launch-bootstrap',{
        method:'POST',
        headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
        body:JSON.stringify({phase:'long-context-proof'}),
      }),
      env,
    );
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.status,'MEL_CONTEXT_02_REAL_LONG_CONVERSATION_VERIFIED');
    assert.ok(body.proof.total_chars>65000);
    assert.ok(body.proof.omitted_message_count>0);
    assert.ok(body.proof.decision_anchor_count>0);
    assert.equal(body.proof.anchor_preserved,true);
    assert.equal(body.proof.current_turn_preserved_exactly,true);
    assert.equal(body.private_content_returned,false);
    assert.match(body.proof.source_key_sha256,/^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(body).includes('Décision importante'),false);
  } finally {
    DB.close();
  }
});


test('GEN2-42 R2 bootstrap challenge uses D1 as an atomic replay ledger', async () => {
  const DB=sqliteD1();
  const objects=new Map();
  const bucket={
    async put(key,value){ objects.set(String(key),String(value)); },
    async get(key){
      const value=objects.get(String(key));
      if(value==null)return null;
      return {
        async text(){return value;},
        async json(){return JSON.parse(value);},
      };
    },
    async delete(key){objects.delete(String(key));},
  };
  const token='r'.repeat(64);
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const hash=[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  const now=Date.now();
  const key='bootstrap-challenges/gen2-42-runtime-tick/'+hash+'.json';
  await bucket.put(key,JSON.stringify({
    schema:'mel.gen2-42-bootstrap-challenge/v2',
    token_hash:hash,
    scope:'gen2-42-runtime-tick',
    expires_at:now+60000,
    created_at:now,
  }));
  try {
    let ticks=0;
    const request=()=>new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-gen2-42-bootstrap':token,'content-type':'application/json'},
      body:JSON.stringify({phase:'gen2-42-runtime-tick'}),
    });
    const env={DB,MEDIA_BUCKET:bucket};
    const first=await maybeHandleReleaseLaunchBootstrap(request(),env,{
      runAutonomyTick:async()=>{ticks+=1;return{ok:true,status:'ACTIVE',advanced:false,control:{paused:false,max_autonomy:true}};},
    });
    assert.equal(first.status,200);
    assert.equal(ticks,1);
    assert.equal(objects.has(key),false);

    // Even if the R2 challenge is maliciously/restored later, D1 blocks replay.
    await bucket.put(key,JSON.stringify({
      token_hash:hash,
      scope:'gen2-42-runtime-tick',
      expires_at:now+60000,
    }));
    const replay=await maybeHandleReleaseLaunchBootstrap(request(),env,{
      runAutonomyTick:async()=>{ticks+=1;return{ok:true};},
    });
    assert.equal(replay.status,401);
    assert.equal(ticks,1);
  } finally {
    DB.close();
  }
});


test('GEN2-42 D1 bootstrap challenge is scoped, expiring and one-shot', async () => {
  const DB=sqliteD1();
  const token='z'.repeat(64);
  const hashBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const tokenHash=[...new Uint8Array(hashBytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  const now=Date.now();
  try {
    await DB.prepare(`CREATE TABLE mel_bootstrap_challenges (
      token_hash TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    )`).run();
    await DB.prepare('INSERT INTO mel_bootstrap_challenges(token_hash,scope,expires_at,consumed_at,created_at) VALUES(?,?,?,?,?)')
      .bind(tokenHash,'gen2-42-runtime-tick',now+60000,null,now).run();

    let ticks=0;
    const request=()=>new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-gen2-42-bootstrap':token,'content-type':'application/json'},
      body:JSON.stringify({phase:'gen2-42-runtime-tick'}),
    });
    const first=await maybeHandleReleaseLaunchBootstrap(request(),{DB},{
      runAutonomyTick:async()=>{ticks+=1;return{ok:true,status:'ACTIVE',advanced:false,control:{paused:false,max_autonomy:true}};},
    });
    assert.equal(first.status,200);
    assert.equal((await first.json()).status,'GEN2_42_RUNTIME_TICK_EXECUTED');
    assert.equal(ticks,1);

    const replay=await maybeHandleReleaseLaunchBootstrap(request(),{DB},{
      runAutonomyTick:async()=>{ticks+=1;return{ok:true};},
    });
    assert.equal(replay.status,401);
    assert.equal((await replay.json()).code,'BOOTSTRAP_AUTH_REQUIRED');
    assert.equal(ticks,1);

    const row=await DB.prepare('SELECT consumed_at FROM mel_bootstrap_challenges WHERE token_hash=?').bind(tokenHash).first();
    assert.ok(Number(row.consumed_at)>=now);
  } finally {
    DB.close();
  }
});

test('GEN2-42 D1 bootstrap challenge rejects wrong scope and expired tokens', async () => {
  for (const [scope,expiresDelta] of [['wrong-scope',60000],['gen2-42-runtime-tick',-1]]) {
    const DB=sqliteD1();
    const token=(scope==='wrong-scope'?'x':'y').repeat(64);
    const hashBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
    const tokenHash=[...new Uint8Array(hashBytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    const now=Date.now();
    try {
      await DB.prepare(`CREATE TABLE mel_bootstrap_challenges (
        token_hash TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER,
        created_at INTEGER NOT NULL
      )`).run();
      await DB.prepare('INSERT INTO mel_bootstrap_challenges(token_hash,scope,expires_at,consumed_at,created_at) VALUES(?,?,?,?,?)')
        .bind(tokenHash,scope,now+expiresDelta,null,now).run();
      const response=await maybeHandleReleaseLaunchBootstrap(
        new Request('https://mel.test/api/internal/release-launch-bootstrap',{
          method:'POST',
          headers:{'x-mel-gen2-42-bootstrap':token,'content-type':'application/json'},
          body:JSON.stringify({phase:'gen2-42-runtime-tick'}),
        }),
        {DB},
        {runAutonomyTick:async()=>{throw new Error('must not run');}},
      );
      assert.equal(response.status,401);
    } finally {
      DB.close();
    }
  }
});


test('GEN2-42 runtime tick phase preserves autonomy control and delegates to canonical runtime', async () => {
  let controlCalls=0;
  let tickCalls=0;
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
      body:JSON.stringify({phase:'gen2-42-runtime-tick'}),
    }),
    {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB:{}},
    {
      setControl:async()=>{controlCalls+=1; throw new Error('GEN2_42_TICK_MUST_NOT_TOUCH_CONTROL');},
      runAutonomyTick:async()=>{
        tickCalls+=1;
        return {
          ok:true,
          status:'ACTIVE',
          advanced:true,
          control:{paused:false,max_autonomy:true},
          completions:{
            ok:true,
            completed:[{job_id:'ecosystem-watch-fixture',candidate_sha:'a'.repeat(40),ci_run_id:123}],
            rejected:[],
          },
        };
      },
    },
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.status,'GEN2_42_RUNTIME_TICK_EXECUTED');
  assert.equal(body.control_unchanged_by_bootstrap,true);
  assert.equal(body.paused,false);
  assert.equal(body.max_autonomy,true);
  assert.equal(body.completed.length,1);
  assert.equal(body.completed[0].job_id,'ecosystem-watch-fixture');
  assert.equal(tickCalls,1);
  assert.equal(controlCalls,0);
});


test('GEN2-42 owner MAX bootstrap fails closed when exact launch readiness is not green', async () => {
  let controlCalls=0;
  let tickCalls=0;
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
      body:JSON.stringify({phase:'gen2-42-owner-max'}),
    }),
    {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB:{}},
    {
      prepare:async()=>({ok:false,status:'LAUNCH_EVIDENCE_INCOMPLETE',readiness:{
        ok:true,status:'NO_GO',launch_ready:false,candidate_sha:'c'.repeat(40),blockers:['EXACT_GATE_NOT_READY'],
      }}),
      setControl:async()=>{controlCalls+=1; throw new Error('OWNER_MAX_CONTROL_MUST_NOT_RUN');},
      runAutonomyTick:async()=>{tickCalls+=1; throw new Error('OWNER_MAX_TICK_MUST_NOT_RUN');},
    },
  );
  assert.equal(response.status,409);
  const body=await response.json();
  assert.equal(body.ok,false);
  assert.equal(body.code,'GEN2_42_OWNER_MAX_LAUNCH_GATE_BLOCKED');
  assert.equal(controlCalls,0);
  assert.equal(tickCalls,0);
});

test('GEN2-42 owner MAX bootstrap approves only the gated SHA then runs one canonical tick', async () => {
  const sha='7'.repeat(40);
  const digest='8'.repeat(64);
  const controls=[];
  let tickCalls=0;
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
      body:JSON.stringify({phase:'gen2-42-owner-max'}),
    }),
    {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB:{}},
    {
      prepare:async()=>({ok:true,status:'LAUNCH_EVIDENCE_READY',readiness:{
        ok:true,
        status:'GO_FOR_SUPERVISED_AUTONOMY',
        launch_ready:true,
        candidate_branch:'candidate/mel-clean-autonomy',
        candidate_sha:sha,
        evaluated_at:'2026-09-27T22:30:00.000Z',
        gate_digest:digest,
        blockers:[],
        gates:{verified_restore_dry_run:true},
      }}),
      setControl:async(_db,input)=>{
        controls.push(input);
        return {
          paused:input.paused,
          max_autonomy:input.max_autonomy,
          launch_approved_sha:input.launch_approved_sha,
        };
      },
      runAutonomyTick:async()=>{
        tickCalls+=1;
        return {
          ok:true,
          status:'ACTIVE',
          advanced:true,
          control:{paused:false,max_autonomy:true},
          completions:{
            ok:true,
            completed:[{job_id:'ecosystem-watch-fixture',candidate_sha:sha,ci_run_id:12345}],
            rejected:[],
          },
        };
      },
    },
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.status,'GEN2_42_OWNER_MAX_EXECUTED');
  assert.equal(body.paused,false);
  assert.equal(body.max_autonomy,true);
  assert.equal(body.launch_approved_sha,sha);
  assert.equal(body.completed.length,1);
  assert.equal(body.completed[0].candidate_sha,sha);
  assert.equal(body.owner_authorized_bootstrap,true);
  assert.equal(tickCalls,1);
  assert.equal(controls.length,1);
  assert.equal(controls[0].paused,false);
  assert.equal(controls[0].max_autonomy,true);
  assert.equal(controls[0].source,'owner-authorized-bootstrap');
  assert.equal(controls[0].launch_approved_sha,sha);
  assert.equal(controls[0].launch_gate_digest,digest);
});

test('release rollback restore is OIDC-scoped, exact-SHA bound and never reopens candidate launch gates', async () => {
  const sha='9'.repeat(40);
  const controls=[];
  const oidc=[];
  let prepareCalls=0;
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap?expected_sha='+sha+'&paused=false&max=true',{
      method:'POST',
      headers:{'x-mel-github-oidc':'fixture-oidc','content-type':'application/json'},
      body:JSON.stringify({phase:'release-rollback-restore'}),
    }),
    {MEL_DEPLOYED_GIT_SHA:sha,MEL_DEPLOYED_GIT_BRANCH:'release/mel-hardware-v0.1.0',DB:{prepare(){}}},
    {
      authorizeOidc:async(_request,_env,options)=>{oidc.push(options);return {ok:true};},
      prepare:async()=>{prepareCalls+=1;throw new Error('rollback restore must not reopen candidate readiness');},
      setControl:async(_db,input)=>{controls.push(input);return input;},
    },
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.status,'RELEASE_ROLLBACK_AUTONOMY_RESTORED');
  assert.equal(body.deployed_sha,sha);
  assert.equal(body.paused,false);
  assert.equal(body.max_autonomy,true);
  assert.equal(body.launch_approved_sha,sha);
  assert.equal(body.oidc_authorized,true);
  assert.deepEqual(oidc[0].allowedWorkflows,['deploy-cloudflare-release.yml']);
  assert.deepEqual(oidc[0].allowedWorkflowBranches,['main','release/mel-hardware-v0.1.0']);
  assert.deepEqual(oidc[0].allowedEvents,['push','workflow_dispatch']);
  assert.equal(prepareCalls,0);
  assert.equal(controls.length,1);
  assert.equal(controls[0].source,'release-rollback-restore');
  assert.equal(controls[0].launch_approved_sha,sha);
  assert.equal(controls[0].launch_gate_digest,null);
  assert.ok(controls[0].launch_approved_at);
  assert.equal(body.restore_sha,sha);
});

test('release rollback restore can stage the previous stable SHA while the candidate is still deployed', async () => {
  const candidate='8'.repeat(40);
  const previous='7'.repeat(40);
  const digest='b'.repeat(64);
  const controls=[];
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap?expected_sha='+candidate+'&restore_sha='+previous+'&paused=false&max=true',{
      method:'POST',
      headers:{'x-mel-github-oidc':'fixture-oidc','content-type':'application/json'},
      body:JSON.stringify({phase:'release-rollback-restore'}),
    }),
    {MEL_DEPLOYED_GIT_SHA:candidate,DB:{prepare(){}}},
    {
      authorizeOidc:async()=>({ok:true}),
      prepare:async()=>{throw new Error('candidate launch gates must not block rollback staging');},
      setControl:async(_db,input)=>{controls.push(input);return input;},
    },
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.deployed_sha,candidate);
  assert.equal(body.restore_sha,previous);
  assert.equal(body.launch_approved_sha,previous);
  assert.equal(body.paused,false);
  assert.equal(body.max_autonomy,true);
  assert.equal(controls.length,1);
  assert.equal(controls[0].launch_approved_sha,previous);
  assert.equal(controls[0].launch_gate_digest,null);
  assert.ok(controls[0].launch_approved_at);
});

test('release rollback restore refuses SHA mismatch before touching readiness or control', async () => {
  const deployed='1'.repeat(40),expected='2'.repeat(40);
  let prepareCalls=0,controlCalls=0;
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap?expected_sha='+expected+'&paused=false&max=true',{
      method:'POST',
      headers:{'x-mel-github-oidc':'fixture-oidc','content-type':'application/json'},
      body:JSON.stringify({phase:'release-rollback-restore'}),
    }),
    {MEL_DEPLOYED_GIT_SHA:deployed,DB:{prepare(){}}},
    {
      authorizeOidc:async()=>({ok:true}),
      prepare:async()=>{prepareCalls+=1;throw new Error('must not run');},
      setControl:async()=>{controlCalls+=1;throw new Error('must not run');},
    },
  );
  assert.equal(response.status,409);
  const body=await response.json();
  assert.equal(body.code,'ROLLBACK_RESTORE_SHA_MISMATCH');
  assert.equal(body.deployed_sha,deployed);
  assert.equal(body.expected_sha,expected);
  assert.equal(prepareCalls,0);
  assert.equal(controlCalls,0);
});

test('release rollback restore can preserve an already-paused stable release without reopening readiness', async () => {
  const sha='3'.repeat(40);
  let prepareCalls=0;
  const controls=[];
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap?expected_sha='+sha+'&paused=true&max=false',{
      method:'POST',
      headers:{'x-mel-github-oidc':'fixture-oidc','content-type':'application/json'},
      body:JSON.stringify({phase:'release-rollback-restore'}),
    }),
    {MEL_DEPLOYED_GIT_SHA:sha,DB:{prepare(){}}},
    {
      authorizeOidc:async()=>({ok:true}),
      prepare:async()=>{prepareCalls+=1;throw new Error('paused restore must not prepare');},
      setControl:async(_db,input)=>{controls.push(input);return input;},
    },
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.paused,true);
  assert.equal(body.max_autonomy,false);
  assert.equal(prepareCalls,0);
  assert.equal(controls.length,1);
  assert.equal(controls[0].launch_approved_sha,null);
});

test('release identity phase returns exact deployed SHA without touching autonomy or providers', async () => {
  const sha='4'.repeat(40);
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
      body:JSON.stringify({phase:'identity'}),
    }),
    {
      MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,
      MEL_DEPLOYED_GIT_SHA:sha,
      MEL_DEPLOYED_GIT_BRANCH:'release/mel-hardware-v0.1.0',
    },
    {
      setControl:async()=>{throw new Error('identity must not touch autonomy control');},
      connectionHandler:async()=>{throw new Error('identity must not touch providers');},
    },
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.status,'RELEASE_IDENTITY_VERIFIED');
  assert.equal(body.deployed_sha,sha);
  assert.equal(body.deployed_branch,'release/mel-hardware-v0.1.0');
  assert.equal(body.autonomy_started,false);
});

test('connection proof promotes only connectors that pass real live probes and keeps account details private', async () => {
  const connectionHandler=async(request,_env,url)=>{
    if(url.pathname.endsWith('/google/test')) return Response.json({ok:true,live_probe:true});
    if(url.pathname.endsWith('/pipedream/test')) return Response.json({ok:true,authenticated:true});
    if(url.pathname.endsWith('/pipedream/accounts')) return Response.json({
      ok:true,
      connected_apps:['microsoft_outlook','microsoft_onedrive','sharepoint','imap'],
      accounts:[{id:'private-id',name:'private@example.test',app:'imap',healthy:true}],
    });
    if(url.pathname.endsWith('/vercel/test')) return Response.json({ok:true,authenticated:true,target_ready:true,deployment_count:1});
    if(url.pathname.endsWith('/yahoo-imap/test')) return Response.json({ok:false,code:'YAHOO_IMAP_IMAP_AUTH_REJECTED'},{status:409});
    return Response.json({ok:false,code:'UNEXPECTED'},{status:404});
  };
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
      body:JSON.stringify({phase:'connection-proof'}),
    }),
    {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,MEL_DEPLOYED_GIT_SHA:'9'.repeat(40),DB:{}},
    {connectionHandler,setControl:async()=>{throw new Error('must not touch autonomy control');}},
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body.verified_roadmap_ids,['GEN2-33','GEN2-34','GEN2-35','GEN2-36','MEL-CONN-03']);
  assert.deepEqual(body.pending_roadmap_ids,[]);
  assert.equal(body.proof.yahoo_ymail.verified,true);
  assert.equal(body.proof.yahoo_ymail.via,'pipedream-imap');
  assert.equal(body.private_content_returned,false);
  assert.equal(JSON.stringify(body).includes('private-id'),false);
  assert.equal(JSON.stringify(body).includes('private@example.test'),false);
});


test('release bootstrap sovereignty proof reads only sanitized 10-layer status and never starts autonomy', async () => {
  const DB=sqliteD1();
  const now=Date.now();
  const proof={
    isolated_test:true,smoke:true,rollback:true,export:true,import:true,activate:true,
    verified_at:new Date(now-1000).toISOString(),
    expires_at:new Date(now+86400000).toISOString(),
    evidence_ref:'test://live',
    source_sha:'a'.repeat(40),
  };
  const layers=['ai','runtime','storage','database','source_control','ci_cd','secrets_identity','scheduler','observability','backup_restore'];
  const all=layers.map((layer,i)=>({
    id:'alt-'+layer,
    layer,
    provider:'provider-'+i,
    adapter_id:'adapter-'+i,
    added_cost_eur:0,
    low_refusal:layer==='ai',
    proof,
  }));
  await DB.prepare(`CREATE TABLE IF NOT EXISTS mel_alternative_registry (
    id TEXT PRIMARY KEY,
    registry_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await DB.prepare('INSERT INTO mel_alternative_registry(id,registry_json,updated_at) VALUES(?,?,?)')
    .bind('technical-sovereignty-alternatives',JSON.stringify({all}),now).run();
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
      body:JSON.stringify({phase:'sovereignty-proof'}),
    }),
    {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB,MEL_DEPLOYED_GIT_SHA:'b'.repeat(40)},
    {setControl:async()=>{throw new Error('sovereignty proof must not touch autonomy control');}},
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.status,'MEL_SOV_01_DONE_VERIFIED_ELIGIBLE');
  assert.equal(body.done_verified_eligible,true);
  assert.equal(body.ready_layer_count,10);
  assert.equal(body.registry_count,10);
  assert.deepEqual(body.prevalidation_refresh,{});
  assert.equal(body.ai_low_refusal_ready,true);
  assert.equal(body.secret_values_exposed,false);
  assert.equal(body.autonomy_started,false);
  DB.close();
});


test('release bootstrap sovereignty refresh rejects unknown targets without running autonomy', async () => {
  const response=await maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap?refresh=unknown-layer',{
      method:'POST',
      headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
      body:JSON.stringify({phase:'sovereignty-proof'}),
    }),
    {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB:sqliteD1()},
    {setControl:async()=>{throw new Error('refresh proof must not touch autonomy control');}},
  );
  assert.equal(response.status,400);
  const body=await response.json();
  assert.equal(body.code,'MEL_SOV_01_REFRESH_TARGET_INVALID');
  assert.deepEqual(body.allowed_refresh_targets,['ai','ai_local','source_control','infrastructure','backup_restore']);
  assert.equal(body.autonomy_started,false);
});

test('GEN2-42 runtime tick exposes a READY package for cloud fallback when local bridge is stale', async () => {
  const DB=sqliteD1();
  try {
    await DB.prepare('CREATE TABLE dev_bridge_state(bridge_id TEXT PRIMARY KEY,last_seen INTEGER NOT NULL,status TEXT NOT NULL,metadata_json TEXT)').run();
    await DB.prepare('INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)')
      .bind('primary',Date.now()-120000,'ONLINE','{}').run();

    const response=await maybeHandleReleaseLaunchBootstrap(
      new Request('https://mel.test/api/internal/release-launch-bootstrap',{
        method:'POST',
        headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
        body:JSON.stringify({phase:'gen2-42-runtime-tick'}),
      }),
      {MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,DB},
      {
        runAutonomyTick:async()=>({
          ok:true,
          status:'ACTIVE',
          advanced:true,
          control:{paused:false,max_autonomy:true},
          job:{id:'mel-ui-06-ready',status:'TEACHER_APPROVED',roadmap_id:'MEL-UI-06'},
          bridge_preparation:{status:'READY'},
          completions:{completed:[],rejected:[]},
        }),
      },
    );
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.bridge_preparation_ready,true);
    assert.equal(body.bridge_job.job_id,'mel-ui-06-ready');
    assert.equal(body.bridge_job.status,'TEACHER_APPROVED');
    assert.equal(body.bridge_executor.online,false);
    assert.equal(body.bridge_executor.status,'ONLINE');
    assert.ok(body.bridge_executor.last_seen_age_ms>=60000);
  } finally {
    DB.close();
  }
});


test('GEN2-42 runtime tick uses a dedicated bootstrap token without opening other release phases', async () => {
  const dedicated='g'.repeat(64);
  const env={MEL_GEN2_42_BOOTSTRAP_TOKEN:dedicated};
  const request=phase=>new Request('https://mel.test/api/internal/release-launch-bootstrap',{
    method:'POST',
    headers:{'x-mel-gen2-42-bootstrap':dedicated,'content-type':'application/json'},
    body:JSON.stringify({phase}),
  });
  const tick=await maybeHandleReleaseLaunchBootstrap(request('gen2-42-runtime-tick'),env,{
    runAutonomyTick:async()=>({
      ok:true,
      status:'IDLE',
      advanced:false,
      paused:false,
      control:{paused:false,max_autonomy:true},
      completions:{completed:[],rejected:[]},
    }),
  });
  assert.equal(tick.status,200);
  const tickBody=await tick.json();
  assert.equal(tickBody.ok,true);
  assert.equal(tickBody.phase,'gen2-42-runtime-tick');
  assert.equal(tickBody.max_autonomy,true);

  const denied=await maybeHandleReleaseLaunchBootstrap(request('identity'),env);
  assert.equal(denied.status,403);
  assert.equal((await denied.json()).code,'BOOTSTRAP_SCOPE_DENIED');
});


test('parallel production proof token can read exact identity but cannot mutate launch state', async () => {
  const parallelToken='p'.repeat(64);
  const sha='e'.repeat(40);
  const env={MEL_PARALLEL_PROOF_TOKEN:parallelToken,MEL_DEPLOYED_GIT_SHA:sha,DB:{}};
  const call=phase=>maybeHandleReleaseLaunchBootstrap(
    new Request('https://mel.test/api/internal/release-launch-bootstrap',{
      method:'POST',
      headers:{'x-mel-parallel-proof':parallelToken,'content-type':'application/json'},
      body:JSON.stringify({phase}),
    }),
    env,
  );

  const identity=await call('identity');
  assert.equal(identity.status,200);
  const body=await identity.json();
  assert.equal(body.deployed_sha,sha);
  assert.equal(body.autonomy_started,false);

  const denied=await call('pause');
  assert.equal(denied.status,403);
  assert.equal((await denied.json()).code,'BOOTSTRAP_SCOPE_DENIED');
});


test('release bootstrap media proof requires exact-SHA 12/12 live execution and never starts autonomy', async () => {
  const sha='4'.repeat(40);
  const request=()=>new Request('https://mel.test/api/internal/release-launch-bootstrap',{
    method:'POST',
    headers:{'x-mel-launch-bootstrap':TOKEN,'content-type':'application/json'},
    body:JSON.stringify({phase:'media-proof'}),
  });

  const ok=await maybeHandleReleaseLaunchBootstrap(request(),{
    MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,
    MEL_DEPLOYED_GIT_SHA:sha,
  },{
    proveMedia:async(_env,{sourceSha})=>({
      ok:true,
      status:'MEL_MEDIA_02_DONE_VERIFIED_ELIGIBLE',
      done_verified_eligible:true,
      source_sha:sourceSha,
      capability_count:12,
      required_capabilities:Array.from({length:12},(_,i)=>'media.test.'+i),
      executions:Array.from({length:12},(_,i)=>({id:'media.test.'+i,ok:true})),
      secret_values_exposed:false,
      autonomy_started:false,
    }),
  });
  assert.equal(ok.status,200);
  const body=await ok.json();
  assert.equal(body.ok,true);
  assert.equal(body.status,'MEL_MEDIA_02_DONE_VERIFIED_ELIGIBLE');
  assert.equal(body.done_verified_eligible,true);
  assert.equal(body.capability_count,12);
  assert.equal(body.deployed_sha,sha);
  assert.equal(body.autonomy_started,false);
  assert.equal(body.secret_values_exposed,false);

  const incomplete=await maybeHandleReleaseLaunchBootstrap(request(),{
    MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,
    MEL_DEPLOYED_GIT_SHA:sha,
  },{
    proveMedia:async()=>({
      ok:true,
      status:'MEL_MEDIA_02_DONE_VERIFIED_ELIGIBLE',
      done_verified_eligible:true,
      source_sha:sha,
      capability_count:11,
    }),
  });
  assert.equal(incomplete.status,409);
  assert.equal((await incomplete.json()).ok,false);

  const failed=await maybeHandleReleaseLaunchBootstrap(request(),{
    MEL_LAUNCH_BOOTSTRAP_TOKEN:TOKEN,
    MEL_DEPLOYED_GIT_SHA:sha,
  },{
    proveMedia:async()=>{throw Object.assign(new Error('MEDIA_FAILURE'),{code:'MEDIA_FAILURE',status:503,capability:'media.video.generate'});},
  });
  assert.equal(failed.status,503);
  const failedBody=await failed.json();
  assert.equal(failedBody.ok,false);
  assert.equal(failedBody.status,'MEL_MEDIA_02_NOT_VERIFIED');
  assert.equal(failedBody.capability,'media.video.generate');
  assert.equal(failedBody.autonomy_started,false);
});
