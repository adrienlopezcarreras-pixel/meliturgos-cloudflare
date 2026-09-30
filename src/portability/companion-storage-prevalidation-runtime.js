import { createCompanionSovereigntyExecutor } from './companion-sovereignty-executor.js';
import { createCompanionObjectStorageAdapter } from './companion-object-storage-adapter.js';
import { SovereigntyCandidateStore } from './sovereignty-candidate-store.js';
import { D1AlternativeRegistryStore } from './d1-alternative-registry-store.js';
import { prevalidateInfrastructureAlternative } from './infrastructure-alternative-prevalidator.js';
import { eligibleAlternatives } from './prevalidated-alternative-registry.js';

const STATE_ID='companion-storage-prevalidation';
const CANDIDATE_ID='companion-local-storage';
const DEFAULT_INTERVAL_MS=6*60*60*1000;

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
async function onlineWindows(db,{now=Date.now(),onlineWithinMs=15000}={}){
  return db.prepare(`SELECT id,last_seen_at,halted,platform FROM computer_devices
    WHERE lower(platform)='windows' AND halted=0 AND last_seen_at>=?
    ORDER BY last_seen_at DESC LIMIT 1`).bind(now-onlineWithinMs).first();
}
async function upsertCandidate(store,{now,status='UNVERIFIED',metadata={}}={}){
  await store.upsertFromWatch({results:[{
    layer:'storage',
    candidate_hints:[{
      id:CANDIDATE_ID,
      provider_hint:'local-companion-storage',
      source_url:null,
      source_title:'Paired Windows MEL Companion local storage',
      status:'UNVERIFIED',
    }],
  }]},{now});
  if(status!=='UNVERIFIED'){
    await store.setStatus({layer:'storage',id:CANDIDATE_ID,status,metadata});
  }
}

export async function runCompanionStoragePrevalidationRuntime(env,{
  now=Date.now(),
  force=false,
  intervalMs=Number(env?.MEL_LOCAL_STORAGE_REVALIDATE_INTERVAL_MS)||DEFAULT_INTERVAL_MS,
}={}){
  if(!env?.DB)return{ok:true,skipped:true,reason:'DB_NOT_CONFIGURED'};

  const registryStore=new D1AlternativeRegistryStore(env.DB);
  const registry=await registryStore.load();
  const fresh=eligibleAlternatives(registry,'storage',{maxAddedCostEur:0,now})
    .find(row=>row.id===CANDIDATE_ID);
  if(!force&&fresh)return{ok:true,skipped:true,reason:'PROOF_FRESH',proof_expires_at:fresh.proof.expires_at};

  const prior=await loadState(env.DB);
  const last=Number(prior.last_run_at||0);
  if(!force&&last>0&&now-last<intervalMs){
    return{ok:true,skipped:true,reason:'INTERVAL_NOT_DUE',next_due_at:last+intervalMs};
  }

  let device=null;
  try{device=await onlineWindows(env.DB,{now});}catch{}
  if(!device){
    await saveState(env.DB,{last_run_at:now,status:'WAITING_FOR_COMPANION'});
    return{ok:true,skipped:true,reason:'COMPANION_OFFLINE'};
  }

  const candidateStore=new SovereigntyCandidateStore(env.DB);
  await upsertCandidate(candidateStore,{now,status:'TESTING',metadata:{device_id:device.id}});

  const execute=createCompanionSovereigntyExecutor(env,{
    deviceId:device.id,
    timeoutMs:Number(env?.MEL_LOCAL_SOVEREIGNTY_COMMAND_TIMEOUT_MS)||20000,
  });
  const adapter=createCompanionObjectStorageAdapter({
    execute,
    namespace:'mel-sovereignty',
  });
  const descriptor={
    id:CANDIDATE_ID,
    provider:'local-companion-storage',
    adapter_id:'companion-local-storage',
    added_cost_eur:0,
    cost_provenance:{
      verified:true,
      addedCost:0,
      source:'existing-owner-hardware-no-added-service-cost',
      authorization:{approved:true,policy:'ZERO_EURO',authority:'owner'},
    },
  };

  const validation=await prevalidateInfrastructureAlternative({
    layer:'storage',
    descriptor,
    adapter,
    registry,
    now,
  });

  if(validation?.ok!==true){
    await upsertCandidate(candidateStore,{now,status:'BLOCKED',metadata:{
      device_id:device.id,
      reason:validation?.status||'LOCAL_STORAGE_PROOF_FAILED',
      code:validation?.code||null,
    }});
    const state={last_run_at:now,status:'BLOCKED',device_id:device.id,code:validation?.code||validation?.status||'LOCAL_STORAGE_PROOF_FAILED'};
    await saveState(env.DB,state);
    return{ok:false,...state};
  }

  await registryStore.save(validation.registry);
  await upsertCandidate(candidateStore,{now,status:'PREVALIDATED',metadata:{
    device_id:device.id,
    validated_at:new Date(now).toISOString(),
  }});
  const state={last_run_at:now,status:'PREVALIDATED',device_id:device.id,candidate_id:CANDIDATE_ID};
  await saveState(env.DB,state);
  return{ok:true,skipped:false,...state};
}

export const COMPANION_STORAGE_PREVALIDATION_STATE_ID=STATE_ID;
