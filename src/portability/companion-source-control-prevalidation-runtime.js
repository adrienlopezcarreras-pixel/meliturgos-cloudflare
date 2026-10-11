import { createCompanionSovereigntyExecutor } from './companion-sovereignty-executor.js';
import { createCompanionSourceControlAdapter } from './companion-source-control-adapter.js';
import { SovereigntyCandidateStore, scopeSovereigntyCandidateStore } from './sovereignty-candidate-store.js';
import { D1AlternativeRegistryStore } from './d1-alternative-registry-store.js';
import { validateSovereigntyCandidates } from './sovereignty-candidate-validator.js';

const STATE_ID='companion-source-control-prevalidation';
const DEFAULT_INTERVAL_MS=60*60*1000;

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

async function latestOnlineWindows(db,{now=Date.now(),onlineWithinMs=35000}={}){
  const rows=await db.prepare(`SELECT id,last_seen_at,halted,platform,metadata
    FROM computer_devices
    WHERE lower(platform)='windows' AND halted=0 AND last_seen_at>=?
    ORDER BY last_seen_at DESC LIMIT 5`)
    .bind(now-onlineWithinMs).all();
  return (rows?.results||[]).find(row=>{
    try{
      const metadata=JSON.parse(row.metadata||'{}');
      const engineHeartbeatAt=Number(metadata.engine_heartbeat_at||0);
      return engineHeartbeatAt>0&&now-engineHeartbeatAt<onlineWithinMs;
    }catch{return false;}
  })||null;
}

export async function runCompanionSourceControlPrevalidationRuntime(env,{
  now=Date.now(),
  force=false,
  intervalMs=Number(env?.MEL_LOCAL_GIT_REVALIDATE_INTERVAL_MS)||DEFAULT_INTERVAL_MS,
  repository=String(env?.MEL_SOVEREIGNTY_LOCAL_REPOSITORY||'meliturgos-cloudflare').trim(),
  sourceSha=String(env?.MEL_DEPLOYED_GIT_SHA||env?.MEL_SOURCE_SHA||'').trim().toLowerCase(),
}={}){
  if(!env?.DB)return{ok:true,skipped:true,reason:'DB_NOT_CONFIGURED'};
  if(!/^[0-9a-f]{40}$/.test(sourceSha)){
    return{ok:true,skipped:true,reason:'SOURCE_SHA_UNAVAILABLE'};
  }

  const prior=await loadState(env.DB);
  const last=Number(prior.last_run_at||0);
  if(!force&&last>0&&now-last<intervalMs){
    return{ok:true,skipped:true,reason:'INTERVAL_NOT_DUE',next_due_at:last+intervalMs};
  }

  const candidateStore=new SovereigntyCandidateStore(env.DB);
  await candidateStore.upsertFromWatch({
    results:[{
      layer:'source_control',
      candidate_hints:[{
        id:'companion-local-git',
        provider_hint:'local-companion-git',
        source_url:null,
        source_title:'Paired Windows MEL Companion local Git',
        status:'UNVERIFIED',
      }],
    }],
  },{now});
  // A forced or due revalidation must exercise this exact local adapter again.
  // PREVALIDATED candidates are otherwise intentionally preserved by the shared
  // store and would disappear from the validator's UNVERIFIED queue.
  await candidateStore.setStatus({
    layer:'source_control',
    id:'companion-local-git',
    status:'UNVERIFIED',
    metadata:{prevalidated:false,activation_allowed:false,revalidation_requested:true,source_sha:sourceSha},
  });
  const scopedCandidateStore=scopeSovereigntyCandidateStore(candidateStore,{
    keys:['source_control::companion-local-git'],
  });

  let device;
  try{device=await latestOnlineWindows(env.DB,{now});}catch{}
  if(!device){
    await saveState(env.DB,{
      last_run_at:now,
      status:'WAITING_FOR_COMPANION',
      candidate_count:1,
    });
    return{ok:true,skipped:true,reason:'COMPANION_OFFLINE',candidate_count:1};
  }

  const registryStore=new D1AlternativeRegistryStore(env.DB);

  const execute=createCompanionSovereigntyExecutor(env,{
    deviceId:device.id,
    timeoutMs:Number(env?.MEL_LOCAL_SOVEREIGNTY_COMMAND_TIMEOUT_MS)||90000,
  });

  const validation=await validateSovereigntyCandidates({
    candidateStore:scopedCandidateStore,
    registryStore,
    env,
    now,
    limit:1,
    resolveCandidate:async candidate=>{
      if(candidate.layer!=='source_control'||candidate.id!=='companion-local-git'){
        return{descriptor:null,adapter:null};
      }

      const seeded=await execute({
        capability:'sovereignty.source_control',
        action:'sovereignty.source_control.seed',
        repository,
        payload:{expected_sha:sourceSha},
      });
      if(seeded?.ok!==true){
        throw Object.assign(new Error(seeded?.code||'LOCAL_GIT_SEED_FAILED'),{
          code:seeded?.code||'LOCAL_GIT_SEED_FAILED',
        });
      }

      const descriptor={
        id:'companion-local-git',
        provider:'local-companion-git',
        adapter_id:'companion-local-git',
        added_cost_eur:0,
        cost_provenance:{
          verified:true,
          addedCost:0,
          source:'existing-owner-hardware-no-added-service-cost',
          authorization:{
            approved:true,
            policy:'ZERO_EURO',
            authority:'owner',
          },
        },
      };

      return{
        descriptor,
        adapter:createCompanionSourceControlAdapter({
          execute,
          repository,
        }),
        context:{
          sourceSha,
          scratchPrefix:'mel-local-sovereignty-proof',
        },
      };
    },
  });

  const blockedResult=(validation.results||[]).find(row=>row?.status==='BLOCKED')||null;
  const blockedReason=blockedResult
    ? String(blockedResult.code||blockedResult.validation_status||blockedResult.reason||'SOURCE_CONTROL_PREVALIDATION_BLOCKED').slice(0,180)
    : null;
  const state={
    last_run_at:now,
    status:validation.prevalidated>0?'PREVALIDATED':validation.blocked>0?'BLOCKED':'NOOP',
    reason:validation.prevalidated>0?null:blockedReason,
    device_id:device.id,
    source_sha:sourceSha,
    processed:validation.processed,
    prevalidated:validation.prevalidated,
    blocked:validation.blocked,
  };
  await saveState(env.DB,state);

  return{
    ok:true,
    skipped:false,
    ...state,
    results:validation.results,
  };
}

export const COMPANION_SOURCE_CONTROL_PREVALIDATION_STATE_ID=STATE_ID;
