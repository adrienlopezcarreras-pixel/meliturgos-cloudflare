import { parseHttpChatProviderDescriptors, createConfiguredAiAdapter } from '../augmentio/http-chat-adapter.js';
import { SovereigntyCandidateStore } from './sovereignty-candidate-store.js';
import { D1AlternativeRegistryStore } from './d1-alternative-registry-store.js';
import { syncConfiguredAiCandidates } from './configured-ai-candidate-sync.js';
import { validateSovereigntyCandidates } from './sovereignty-candidate-validator.js';

const STATE_ID='configured-ai-candidate-validation';
const DEFAULT_INTERVAL_MS=24*60*60*1000;

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

function descriptorMap(env){
  return new Map(parseHttpChatProviderDescriptors(env).map(row=>[row.id,row]));
}

export async function runConfiguredAiCandidateValidationRuntime(env,{
  now=Date.now(),
  force=false,
  intervalMs=Number(env?.MEL_AI_SOVEREIGNTY_VALIDATION_INTERVAL_MS)||DEFAULT_INTERVAL_MS,
  fetchImpl=fetch,
  limit=2,
}={}){
  if(!env?.DB)return{ok:true,skipped:true,reason:'DB_NOT_CONFIGURED'};

  const configured=parseHttpChatProviderDescriptors(env);
  if(!configured.length)return{ok:true,skipped:true,reason:'NO_ALTERNATE_AI_CONFIG'};

  const prior=await loadState(env.DB);
  const last=Number(prior.last_run_at||0);
  if(!force&&last>0&&now-last<intervalMs){
    return{ok:true,skipped:true,reason:'INTERVAL_NOT_DUE',next_due_at:last+intervalMs};
  }

  const candidateStore=new SovereigntyCandidateStore(env.DB);
  const registryStore=new D1AlternativeRegistryStore(env.DB);
  const sync=await syncConfiguredAiCandidates(candidateStore,env,{now});
  const descriptors=descriptorMap(env);

  const validation=await validateSovereigntyCandidates({
    candidateStore,
    registryStore,
    env,
    now,
    limit,
    resolveCandidate:async candidate=>{
      if(candidate.layer!=='ai')return{descriptor:null,adapter:null};
      const d=descriptors.get(candidate.id);
      if(!d)return{descriptor:null,adapter:null};
      const descriptor={
        id:d.id,
        provider:d.providerId,
        credential_ref:d.secretEnv||null,
        added_cost_eur:d.estimatedCost,
        cost_provenance:d.costProvenance,
      };
      const adapter=createConfiguredAiAdapter({
        env,
        ...d,
        fetchImpl,
      });
      return{
        descriptor,
        adapter,
        env,
        fetchImpl,
      };
    },
  });

  const state={
    last_run_at:now,
    configured_count:configured.length,
    synced_count:sync.configured_count,
    processed:validation.processed,
    prevalidated:validation.prevalidated,
    blocked:validation.blocked,
  };
  await saveState(env.DB,state);

  return{
    ok:true,
    skipped:false,
    status:validation.prevalidated>0?'AI_SOVEREIGNTY_ADVANCED':validation.blocked>0?'AI_SOVEREIGNTY_BLOCKED':'AI_SOVEREIGNTY_NOOP',
    ...state,
    results:validation.results,
  };
}

export const CONFIGURED_AI_CANDIDATE_VALIDATION_STATE_ID=STATE_ID;
