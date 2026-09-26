import test from 'node:test';
import assert from 'node:assert/strict';

import { maybeHandleReleaseLaunchBootstrap, __launchBootstrapTest } from '../src/evolution/release-launch-bootstrap.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

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
  assert.equal((await pause.json()).status,'RELEASE_PAUSED');

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


test('release bootstrap resolves compiled Wrangler deployment identity when env bindings are absent', () => {
  const previousSha=globalThis.MEL_DEPLOYED_GIT_SHA;
  const previousBranch=globalThis.MEL_DEPLOYED_GIT_BRANCH;
  try {
    globalThis.MEL_DEPLOYED_GIT_SHA='a'.repeat(40);
    globalThis.MEL_DEPLOYED_GIT_BRANCH='release/mel-hardware-v0.1.0';
    assert.equal(__launchBootstrapTest.resolveDeployedSha({}),'a'.repeat(40));
    assert.equal(__launchBootstrapTest.resolveDeployedBranch({}),'release/mel-hardware-v0.1.0');
  } finally {
    if (previousSha===undefined) delete globalThis.MEL_DEPLOYED_GIT_SHA;
    else globalThis.MEL_DEPLOYED_GIT_SHA=previousSha;
    if (previousBranch===undefined) delete globalThis.MEL_DEPLOYED_GIT_BRANCH;
    else globalThis.MEL_DEPLOYED_GIT_BRANCH=previousBranch;
  }
});
