import { D1AlternativeRegistryStore } from './d1-alternative-registry-store.js';
import { prevalidateConfiguredAiAlternatives } from './ai-alternative-prevalidator.js';

const DEFAULT_INTERVAL_MS=24*60*60*1000;
const STATE_ID='ai-alternative-prevalidation-runtime';

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
  if(!row?.state_json)return {last_run_at:0};
  try{return JSON.parse(row.state_json);}catch{return {last_run_at:0};}
}

async function saveState(db,state){
  await ensureState(db);
  await db.prepare(`INSERT INTO mel_sovereignty_runtime_state(id,state_json,updated_at)
    VALUES(?,?,?)
    ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`)
    .bind(STATE_ID,JSON.stringify(state),Date.now()).run();
}

export async function runAiAlternativePrevalidationRuntime(env,{
  now=Date.now(),
  force=false,
  intervalMs=Number(env?.MEL_AI_ALT_REVALIDATE_INTERVAL_MS)||DEFAULT_INTERVAL_MS,
  fetchImpl=fetch,
}={}){
  if(!env?.DB) return {ok:true,skipped:true,reason:'DB_NOT_CONFIGURED'};
  if(!String(env?.MEL_ALT_AI_PROVIDERS_JSON||'').trim()){
    return {ok:true,skipped:true,reason:'NO_ALTERNATE_AI_CONFIG'};
  }

  const state=await loadState(env.DB);
  if(!force && Number(state.last_run_at||0)>0 && now-Number(state.last_run_at)<intervalMs){
    return {ok:true,skipped:true,reason:'INTERVAL_NOT_DUE',next_due_at:Number(state.last_run_at)+intervalMs};
  }

  const store=new D1AlternativeRegistryStore(env.DB);
  const registry=await store.load();
  const result=await prevalidateConfiguredAiAlternatives({
    env,
    registry,
    now,
    fetchImpl,
  });
  await store.save(result.registry);
  await saveState(env.DB,{
    last_run_at:now,
    last_result:{
      checked_at:result.checked_at,
      configured_count:result.configured_count,
      prevalidated_count:result.prevalidated_count,
      skipped_count:result.skipped_count,
      failed_count:result.failed_count,
    },
  });

  return {
    ok:true,
    skipped:false,
    status:result.failed_count>0?'DEGRADED':result.prevalidated_count>0?'PREVALIDATED':'NO_ELIGIBLE_PROVIDER',
    ...result,
    registry:undefined,
  };
}

export const AI_ALTERNATIVE_PREVALIDATION_STATE_ID=STATE_ID;
