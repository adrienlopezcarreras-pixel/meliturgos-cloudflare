import { createCompanionSovereigntyExecutor } from './companion-sovereignty-executor.js';
import { createCompanionRuntimeProviderAdapter } from './companion-runtime-provider-adapter.js';
import { createCompanionObjectStorageAdapter } from './companion-object-storage-adapter.js';
import { createCompanionDatabaseAdapter } from './companion-database-adapter.js';
import { createCompanionCiProviderAdapter } from './companion-ci-provider-adapter.js';
import { createCompanionSecretStoreAdapter } from './companion-secret-store-adapter.js';
import { createCompanionSchedulerAdapter } from './companion-scheduler-adapter.js';
import { createCompanionObservabilityAdapter } from './companion-observability-adapter.js';
import { proveCompanionBackupRestoreAlternative } from './companion-backup-restore-prevalidation.js';
import { SovereigntyCandidateStore, scopeSovereigntyCandidateStore } from './sovereignty-candidate-store.js';
import { D1AlternativeRegistryStore } from './d1-alternative-registry-store.js';
import { validateSovereigntyCandidates } from './sovereignty-candidate-validator.js';

const STATE_ID='companion-infrastructure-prevalidation';
const DEFAULT_INTERVAL_MS=60*60*1000;

const LOCAL_CANDIDATES=Object.freeze([
  {layer:'runtime',id:'companion-local-runtime',provider:'local-companion-runtime'},
  {layer:'storage',id:'companion-local-storage',provider:'local-companion-storage'},
  {layer:'database',id:'companion-local-db',provider:'local-companion-db'},
  {layer:'ci_cd',id:'companion-local-ci',provider:'local-companion-ci'},
  {layer:'secrets_identity',id:'companion-local-secrets',provider:'local-companion-secret-vault'},
  {layer:'scheduler',id:'companion-local-scheduler',provider:'local-companion-scheduler'},
  {layer:'observability',id:'companion-local-observability',provider:'local-companion-observability'},
  {layer:'backup_restore',id:'companion-local-backup-restore',provider:'local-companion-backup-restore'},
]);

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

function descriptor(candidate){
  return{
    id:candidate.id,
    provider:candidate.provider,
    adapter_id:candidate.id,
    endpoint_class:'local-companion',
    added_cost_eur:0,
    cost_provenance:{
      verified:true,
      addedCost:0,
      source:'existing-owner-hardware-no-added-service-cost',
      authorization:{approved:true,policy:'ZERO_EURO',authority:'owner'},
    },
  };
}

export async function runCompanionInfrastructurePrevalidationRuntime(env,{
  now=Date.now(),
  force=false,
  intervalMs=Number(env?.MEL_LOCAL_INFRA_REVALIDATE_INTERVAL_MS)||DEFAULT_INTERVAL_MS,
  sourceSha=String(env?.MEL_DEPLOYED_GIT_SHA||env?.MEL_SOURCE_SHA||'').trim().toLowerCase(),
  repository=String(env?.MEL_SOVEREIGNTY_LOCAL_REPOSITORY||'meliturgos-cloudflare').trim(),
}={}){
  if(!env?.DB)return{ok:true,skipped:true,reason:'DB_NOT_CONFIGURED'};

  const prior=await loadState(env.DB);
  const last=Number(prior.last_run_at||0);
  if(!force&&last>0&&now-last<intervalMs){
    return{ok:true,skipped:true,reason:'INTERVAL_NOT_DUE',next_due_at:last+intervalMs};
  }

  const candidateStore=new SovereigntyCandidateStore(env.DB);
  await candidateStore.upsertFromWatch({
    results:LOCAL_CANDIDATES.map(candidate=>({
      layer:candidate.layer,
      candidate_hints:[{
        id:candidate.id,
        provider_hint:candidate.provider,
        source_url:null,
        source_title:`Paired Windows MEL Companion ${candidate.layer}`,
        status:'UNVERIFIED',
      }],
    })),
  },{now});
  // Due/forced infrastructure refreshes must retest the exact local candidates.
  // The shared candidate table also contains discoveries for unrelated layers,
  // while PREVALIDATED rows are intentionally preserved by watch upserts.
  // Reset only this bounded local set and scope validation to it.
  for(const candidate of LOCAL_CANDIDATES){
    await candidateStore.setStatus({
      layer:candidate.layer,
      id:candidate.id,
      status:'UNVERIFIED',
      metadata:{prevalidated:false,activation_allowed:false,revalidation_requested:true,source_sha:/^[0-9a-f]{40}$/.test(sourceSha)?sourceSha:null},
    });
  }
  const scopedCandidateStore=scopeSovereigntyCandidateStore(candidateStore,{
    keys:LOCAL_CANDIDATES.map(candidate=>`${candidate.layer}::${candidate.id}`),
  });

  let device;
  try{device=await latestOnlineWindows(env.DB,{now});}catch{}
  if(!device){
    await saveState(env.DB,{
      last_run_at:now,
      status:'WAITING_FOR_COMPANION',
      candidate_count:LOCAL_CANDIDATES.length,
    });
    return{
      ok:true,
      skipped:true,
      reason:'COMPANION_OFFLINE',
      candidate_count:LOCAL_CANDIDATES.length,
    };
  }

  const registryStore=new D1AlternativeRegistryStore(env.DB);

  const execute=createCompanionSovereigntyExecutor(env,{
    deviceId:device.id,
    timeoutMs:Number(env?.MEL_LOCAL_SOVEREIGNTY_COMMAND_TIMEOUT_MS)||90000,
  });

  let seeded=false;
  async function ensureSeeded(){
    if(seeded)return;
    if(!/^[0-9a-f]{40}$/.test(sourceSha)){
      throw Object.assign(new Error('SOURCE_SHA_UNAVAILABLE'),{code:'SOURCE_SHA_UNAVAILABLE'});
    }
    const result=await execute({
      capability:'sovereignty.source_control',
      action:'sovereignty.source_control.seed',
      repository,
      payload:{expected_sha:sourceSha},
    });
    if(result?.ok!==true){
      throw Object.assign(new Error(result?.code||'LOCAL_GIT_SEED_FAILED'),{
        code:result?.code||'LOCAL_GIT_SEED_FAILED',
      });
    }
    seeded=true;
  }

  const result=await validateSovereigntyCandidates({
    candidateStore:scopedCandidateStore,
    registryStore,
    env,
    now,
    limit:LOCAL_CANDIDATES.length,
    resolveCandidate:async candidate=>{
      const local=LOCAL_CANDIDATES.find(row=>row.layer===candidate.layer&&row.id===candidate.id);
      if(!local)return{descriptor:null,adapter:null};
      const d=descriptor(local);

      if(candidate.layer==='runtime'){
        await ensureSeeded();
        return{
          descriptor:d,
          adapter:createCompanionRuntimeProviderAdapter({execute}),
          context:{
            sourceSha,
            artifact:{ref:repository,source_sha:sourceSha},
          },
        };
      }
      if(candidate.layer==='storage'){
        return{descriptor:d,adapter:createCompanionObjectStorageAdapter({execute})};
      }
      if(candidate.layer==='database'){
        return{descriptor:d,adapter:createCompanionDatabaseAdapter({execute})};
      }
      if(candidate.layer==='ci_cd'){
        await ensureSeeded();
        return{
          descriptor:d,
          adapter:createCompanionCiProviderAdapter({execute,repository}),
          context:{sourceSha,pipeline:'sovereignty-smoke'},
        };
      }
      if(candidate.layer==='secrets_identity'){
        return{descriptor:d,adapter:createCompanionSecretStoreAdapter({execute})};
      }
      if(candidate.layer==='scheduler'){
        return{descriptor:d,adapter:createCompanionSchedulerAdapter({execute})};
      }
      if(candidate.layer==='observability'){
        return{descriptor:d,adapter:createCompanionObservabilityAdapter({execute})};
      }
      if(candidate.layer==='backup_restore'){
        const storageAdapter=createCompanionObjectStorageAdapter({
          execute,
          id:'companion-backup-restore-storage',
          provider:'local-companion-backup-restore',
          namespace:'mel-sovereignty-backup-restore',
        });
        const sourceDatabaseAdapter=createCompanionDatabaseAdapter({
          execute,
          id:'companion-backup-source-db',
          provider:'local-companion-backup-restore',
          database:'mel-sovereignty-backup-source.sqlite',
        });
        const restoreDatabaseAdapter=createCompanionDatabaseAdapter({
          execute,
          id:'companion-backup-restore-db',
          provider:'local-companion-backup-restore',
          database:'mel-sovereignty-backup-restore.sqlite',
        });
        const proof=await proveCompanionBackupRestoreAlternative({
          storageAdapter,
          sourceDatabaseAdapter,
          restoreDatabaseAdapter,
          sourceSha,
          now,
        });
        return{
          descriptor:d,
          adapter:Object.freeze({id:local.id,provider:local.provider}),
          prevalidated:proof?.ok===true,
          proof,
        };
      }
      return{descriptor:null,adapter:null};
    },
  });

  const state={
    last_run_at:now,
    status:result.prevalidated===LOCAL_CANDIDATES.length?'PREVALIDATED_ALL'
      :result.prevalidated>0?'PREVALIDATED_PARTIAL'
      :result.blocked>0?'BLOCKED':'NOOP',
    device_id:device.id,
    source_sha:/^[0-9a-f]{40}$/.test(sourceSha)?sourceSha:null,
    processed:result.processed,
    prevalidated:result.prevalidated,
    blocked:result.blocked,
  };
  await saveState(env.DB,state);
  return{ok:true,skipped:false,...state,results:result.results};
}

export const COMPANION_INFRASTRUCTURE_PREVALIDATION_STATE_ID=STATE_ID;
export const COMPANION_INFRASTRUCTURE_LOCAL_CANDIDATES=LOCAL_CANDIDATES;
