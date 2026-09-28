import { SovereigntyCandidateStore } from './sovereignty-candidate-store.js';
import { D1AlternativeRegistryStore } from './d1-alternative-registry-store.js';
import { eligibleAlternatives } from './prevalidated-alternative-registry.js';
import { prevalidateInfrastructureAlternative } from './infrastructure-alternative-prevalidator.js';
import { createCompanionSourceControlAdapter } from './companion-source-control-adapter.js';
import {
  createCompanionSovereigntyExecutor,
  selectOnlineSovereigntyCompanion,
} from './companion-sovereignty-command-bridge.js';

const STATE_ID='companion-git-sovereignty-runtime';
const DEFAULT_INTERVAL_MS=6*60*60*1000;
const CANDIDATE_ID='local.companion.git';

function deployedSha(env={}){
  const value=typeof MEL_DEPLOYED_GIT_SHA!=='undefined'
    ? String(MEL_DEPLOYED_GIT_SHA||'')
    : String(env?.MEL_DEPLOYED_GIT_SHA||'');
  return /^[0-9a-f]{40}$/i.test(value.trim())?value.trim().toLowerCase():'';
}

function repositoryName(env={}){
  const full=String(env?.MEL_GITHUB_REPOSITORY||'adrienlopezcarreras-pixel/meliturgos-cloudflare').trim();
  return (full.split('/').filter(Boolean).at(-1)||'meliturgos-cloudflare').replace(/[^A-Za-z0-9_.-]/g,'').slice(0,200);
}

async function ensureState(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS mel_sovereignty_runtime_state (
    id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
}

async function loadState(db){
  await ensureState(db);
  const row=await db.prepare('SELECT state_json FROM mel_sovereignty_runtime_state WHERE id=?')
    .bind(STATE_ID).first();
  if(!row?.state_json)return{last_run_at:0};
  try{return JSON.parse(row.state_json);}catch{return{last_run_at:0};}
}

async function saveState(db,state){
  await ensureState(db);
  await db.prepare(`INSERT INTO mel_sovereignty_runtime_state(id,state_json,updated_at)
    VALUES(?,?,?)
    ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`)
    .bind(STATE_ID,JSON.stringify(state),Date.now()).run();
}

async function persistCandidate(candidateStore,{now,status='UNVERIFIED',metadata={}}={}){
  await candidateStore.upsertFromWatch({
    results:[{
      layer:'source_control',
      candidate_hints:[{
        id:CANDIDATE_ID,
        provider_hint:'local-companion-git',
        source_url:null,
        source_title:'MEL Companion local Git mirror',
        status:'UNVERIFIED',
      }],
    }],
  },{now});
  if(status!=='UNVERIFIED'){
    await candidateStore.setStatus({
      layer:'source_control',
      id:CANDIDATE_ID,
      status,
      metadata,
    });
  }
}

export async function runCompanionGitSovereigntyRuntime(env,{
  now=Date.now(),
  force=false,
  intervalMs=Number(env?.MEL_LOCAL_GIT_REVALIDATE_INTERVAL_MS)||DEFAULT_INTERVAL_MS,
  deviceId=null,
  commandWaitMs=Number(env?.MEL_LOCAL_SOVEREIGNTY_COMMAND_WAIT_MS)||10000,
}={}){
  if(!env?.DB)return{ok:true,skipped:true,reason:'DB_NOT_CONFIGURED'};
  const sha=deployedSha(env);
  if(!sha)return{ok:true,skipped:true,reason:'DEPLOYED_SHA_UNAVAILABLE'};

  const registryStore=new D1AlternativeRegistryStore(env.DB);
  const registry=await registryStore.load();
  const fresh=eligibleAlternatives(registry,'source_control',{maxAddedCostEur:0,now})
    .find(row=>row.id===CANDIDATE_ID);
  if(!force&&fresh){
    return{
      ok:true,skipped:true,reason:'PROOF_FRESH',
      candidate_id:CANDIDATE_ID,
      proof_expires_at:fresh.proof.expires_at,
    };
  }

  const prior=await loadState(env.DB);
  const last=Number(prior.last_run_at||0);
  if(!force&&last>0&&now-last<intervalMs){
    return{ok:true,skipped:true,reason:'INTERVAL_NOT_DUE',next_due_at:last+intervalMs};
  }

  const candidateStore=new SovereigntyCandidateStore(env.DB);
  await persistCandidate(candidateStore,{now});

  let device;
  try{
    device=await selectOnlineSovereigntyCompanion(env,{deviceId,now});
  }catch(error){
    const state={
      last_run_at:now,status:'DEVICE_OFFLINE',
      candidate_id:CANDIDATE_ID,
      code:error?.code||error?.message||'COMPANION_SOVEREIGNTY_DEVICE_OFFLINE',
    };
    await saveState(env.DB,state);
    return{ok:true,skipped:true,reason:'DEVICE_OFFLINE',...state};
  }

  const repository=repositoryName(env);
  const execute=createCompanionSovereigntyExecutor(env,{
    deviceId:device.id,
    waitMs:commandWaitMs,
    pollMs:300,
  });

  await persistCandidate(candidateStore,{
    now,status:'TESTING',
    metadata:{device_id:device.id,source_sha:sha,started_at:new Date(now).toISOString()},
  });

  const seed=await execute({
    capability:'sovereignty.source_control',
    action:'seed',
    repository,
    payload:{expected_sha:sha},
  });
  if(seed?.ok!==true){
    await persistCandidate(candidateStore,{
      now,status:'BLOCKED',
      metadata:{reason:seed?.code||'LOCAL_GIT_SEED_FAILED',device_id:device.id,source_sha:sha},
    });
    const state={
      last_run_at:now,status:'SEED_FAILED',
      candidate_id:CANDIDATE_ID,device_id:device.id,source_sha:sha,
      code:seed?.code||'LOCAL_GIT_SEED_FAILED',
    };
    await saveState(env.DB,state);
    return{ok:false,...state};
  }

  if(String(seed.source_sha||'').toLowerCase()!==sha||seed.external_reconstruction_verified!==true){
    await persistCandidate(candidateStore,{
      now,status:'BLOCKED',
      metadata:{reason:'LOCAL_GIT_SEED_PROVENANCE_INVALID',device_id:device.id,source_sha:sha},
    });
    return{ok:false,status:'SEED_PROVENANCE_INVALID',candidate_id:CANDIDATE_ID};
  }

  const adapter=createCompanionSourceControlAdapter({
    execute,
    repository,
    id:'companion-local-git',
    provider:'local-companion-git',
  });
  const descriptor={
    id:CANDIDATE_ID,
    provider:'local-companion-git',
    adapter_id:'companion-local-git',
    added_cost_eur:0,
    cost_provenance:{
      verified:true,
      addedCost:0,
      source:'owner-owned-companion-no-added-provider-fee',
      authorization:{
        approved:true,
        policy:'ZERO_EURO',
        authority:'owner-zero-cost-policy',
      },
    },
  };

  const validation=await prevalidateInfrastructureAlternative({
    layer:'source_control',
    descriptor,
    adapter,
    registry,
    context:{sourceSha:sha,scratchPrefix:'mel-local-sovereignty-proof'},
    now,
  });

  if(validation?.ok!==true){
    await persistCandidate(candidateStore,{
      now,status:'BLOCKED',
      metadata:{
        reason:validation?.status||'LOCAL_GIT_PROOF_FAILED',
        code:validation?.code||null,
        device_id:device.id,
        source_sha:sha,
      },
    });
    const state={
      last_run_at:now,status:'PROOF_FAILED',
      candidate_id:CANDIDATE_ID,device_id:device.id,source_sha:sha,
      code:validation?.code||validation?.status||'LOCAL_GIT_PROOF_FAILED',
    };
    await saveState(env.DB,state);
    return{ok:false,...state};
  }

  await registryStore.save(validation.registry);
  await persistCandidate(candidateStore,{
    now,status:'PREVALIDATED',
    metadata:{
      device_id:device.id,
      source_sha:sha,
      local_commit_sha:seed.local_commit_sha||null,
      archive_sha256:seed.archive_sha256||null,
      external_reconstruction_verified:true,
      validated_at:new Date(now).toISOString(),
    },
  });
  const state={
    last_run_at:now,
    status:'PREVALIDATED',
    candidate_id:CANDIDATE_ID,
    device_id:device.id,
    source_sha:sha,
    local_commit_sha:seed.local_commit_sha||null,
    archive_sha256:seed.archive_sha256||null,
  };
  await saveState(env.DB,state);
  return{ok:true,skipped:false,...state};
}

export const COMPANION_GIT_SOVEREIGNTY_STATE_ID=STATE_ID;
export const COMPANION_GIT_CANDIDATE_ID=CANDIDATE_ID;
