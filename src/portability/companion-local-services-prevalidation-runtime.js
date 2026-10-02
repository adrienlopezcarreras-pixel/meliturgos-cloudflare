import { createCompanionSovereigntyExecutor } from './companion-sovereignty-executor.js';
import { createCompanionSchedulerAdapter } from './companion-scheduler-adapter.js';
import { createCompanionObservabilityAdapter } from './companion-observability-adapter.js';
import { createCompanionSecretStoreAdapter } from './companion-secret-store-adapter.js';
import { SovereigntyCandidateStore } from './sovereignty-candidate-store.js';
import { D1AlternativeRegistryStore } from './d1-alternative-registry-store.js';
import { eligibleAlternatives } from './prevalidated-alternative-registry.js';
import { prevalidateInfrastructureAlternative } from './infrastructure-alternative-prevalidator.js';

const STATE_ID='companion-local-services-prevalidation';
const DEFAULT_INTERVAL_MS=6*60*60*1000;

const SPECS=Object.freeze([
  Object.freeze({
    layer:'scheduler',
    id:'companion-local-scheduler',
    provider:'local-companion-scheduler',
    adapterId:'companion-local-scheduler',
    createAdapter:execute=>createCompanionSchedulerAdapter({execute}),
  }),
  Object.freeze({
    layer:'observability',
    id:'companion-local-observability',
    provider:'local-companion-observability',
    adapterId:'companion-local-observability',
    createAdapter:execute=>createCompanionObservabilityAdapter({execute}),
  }),
  Object.freeze({
    layer:'secrets_identity',
    id:'companion-local-secrets',
    provider:'local-companion-secret-vault',
    adapterId:'companion-local-secrets',
    createAdapter:execute=>createCompanionSecretStoreAdapter({execute}),
  }),
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
async function onlineWindows(db,{now=Date.now(),onlineWithinMs=35000}={}){
  const rows=await db.prepare(`SELECT id,last_seen_at,halted,platform,metadata FROM computer_devices
    WHERE lower(platform)='windows' AND halted=0 AND last_seen_at>=?
    ORDER BY last_seen_at DESC LIMIT 5`).bind(now-onlineWithinMs).all();
  return (rows?.results||[]).find(row=>{
    try{
      const metadata=JSON.parse(row.metadata||'{}');
      const engineHeartbeatAt=Number(metadata.engine_heartbeat_at||0);
      return engineHeartbeatAt>0&&now-engineHeartbeatAt<onlineWithinMs;
    }catch{return false;}
  })||null;
}
async function markCandidate(store,spec,{now,status='UNVERIFIED',metadata={}}={}){
  await store.upsertFromWatch({results:[{
    layer:spec.layer,
    candidate_hints:[{
      id:spec.id,
      provider_hint:spec.provider,
      source_url:null,
      source_title:`Paired Windows MEL Companion ${spec.layer}`,
      status:'UNVERIFIED',
    }],
  }]},{now});
  if(status!=='UNVERIFIED'){
    await store.setStatus({layer:spec.layer,id:spec.id,status,metadata});
  }
}
function descriptor(spec){
  return{
    id:spec.id,
    provider:spec.provider,
    adapter_id:spec.adapterId,
    added_cost_eur:0,
    cost_provenance:{
      verified:true,
      addedCost:0,
      source:'existing-owner-hardware-no-added-service-cost',
      authorization:{approved:true,policy:'ZERO_EURO',authority:'owner'},
    },
  };
}

export async function runCompanionLocalServicesPrevalidationRuntime(env,{
  now=Date.now(),
  force=false,
  intervalMs=Number(env?.MEL_LOCAL_SERVICES_REVALIDATE_INTERVAL_MS)||DEFAULT_INTERVAL_MS,
}={}){
  if(!env?.DB)return{ok:true,skipped:true,reason:'DB_NOT_CONFIGURED'};

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

  const registryStore=new D1AlternativeRegistryStore(env.DB);
  let registry=await registryStore.load();
  const candidateStore=new SovereigntyCandidateStore(env.DB);
  const execute=createCompanionSovereigntyExecutor(env,{
    deviceId:device.id,
    timeoutMs:Number(env?.MEL_LOCAL_SOVEREIGNTY_COMMAND_TIMEOUT_MS)||20000,
  });
  const results=[];

  for(const spec of SPECS){
    const fresh=eligibleAlternatives(registry,spec.layer,{maxAddedCostEur:0,now})
      .find(row=>row.id===spec.id);
    if(!force&&fresh){
      results.push({layer:spec.layer,id:spec.id,status:'PROOF_FRESH',ok:true,skipped:true});
      continue;
    }

    await markCandidate(candidateStore,spec,{
      now,status:'TESTING',
      metadata:{device_id:device.id,started_at:new Date(now).toISOString()},
    });

    let validation;
    try{
      validation=await prevalidateInfrastructureAlternative({
        layer:spec.layer,
        descriptor:descriptor(spec),
        adapter:spec.createAdapter(execute),
        registry,
        now,
      });
    }catch(error){
      validation={ok:false,status:'LOCAL_PROVIDER_PROOF_EXCEPTION',code:error?.code||error?.message||'LOCAL_PROVIDER_PROOF_EXCEPTION'};
    }

    if(validation?.ok===true){
      registry=validation.registry;
      await registryStore.save(registry);
      await markCandidate(candidateStore,spec,{
        now,status:'PREVALIDATED',
        metadata:{device_id:device.id,validated_at:new Date(now).toISOString()},
      });
      results.push({layer:spec.layer,id:spec.id,status:'PREVALIDATED',ok:true});
    }else{
      await markCandidate(candidateStore,spec,{
        now,status:'BLOCKED',
        metadata:{
          device_id:device.id,
          reason:validation?.status||'LOCAL_PROVIDER_PROOF_FAILED',
          code:validation?.code||null,
        },
      });
      results.push({
        layer:spec.layer,id:spec.id,status:'BLOCKED',ok:false,
        code:validation?.code||validation?.status||'LOCAL_PROVIDER_PROOF_FAILED',
      });
    }
  }

  const state={
    last_run_at:now,
    status:results.some(row=>row.status==='BLOCKED')?'DEGRADED':'PREVALIDATED',
    device_id:device.id,
    prevalidated:results.filter(row=>row.status==='PREVALIDATED'||row.status==='PROOF_FRESH').length,
    blocked:results.filter(row=>row.status==='BLOCKED').length,
    results,
  };
  await saveState(env.DB,state);
  return{ok:state.blocked===0,skipped:false,...state};
}

export const COMPANION_LOCAL_SERVICES_PREVALIDATION_STATE_ID=STATE_ID;
export const COMPANION_LOCAL_SERVICE_SPECS=SPECS;
