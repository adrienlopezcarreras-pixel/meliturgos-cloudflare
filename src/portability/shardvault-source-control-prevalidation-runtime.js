import { createShardVaultSourceControlAdapter } from './shardvault-source-control-adapter.js';
import { SovereigntyCandidateStore, scopeSovereigntyCandidateStore } from './sovereignty-candidate-store.js';
import { D1AlternativeRegistryStore } from './d1-alternative-registry-store.js';
import { validateSovereigntyCandidates } from './sovereignty-candidate-validator.js';

const CANDIDATE_ID='shardvault-reconstructed-source-control';

export async function runShardVaultSourceControlPrevalidationRuntime(env,{
  now=Date.now(),
  sourceSha=String(env?.MEL_DEPLOYED_GIT_SHA||env?.MEL_SOURCE_SHA||'').trim().toLowerCase(),
}={}){
  if(!env?.DB)return{ok:true,skipped:true,reason:'DB_NOT_CONFIGURED'};
  if(!/^[0-9a-f]{40}$/.test(sourceSha)){
    return{ok:true,skipped:true,reason:'SOURCE_SHA_UNAVAILABLE'};
  }

  const candidateStore=new SovereigntyCandidateStore(env.DB);
  await candidateStore.upsertFromWatch({
    results:[{
      layer:'source_control',
      candidate_hints:[{
        id:CANDIDATE_ID,
        provider_hint:'shardvault-external+d1-overlay',
        source_url:null,
        source_title:'Exact-SHA ShardVault reconstructed source-control',
        status:'UNVERIFIED',
      }],
    }],
  },{now});
  await candidateStore.setStatus({
    layer:'source_control',
    id:CANDIDATE_ID,
    status:'UNVERIFIED',
    metadata:{
      prevalidated:false,
      activation_allowed:false,
      revalidation_requested:true,
      source_sha:sourceSha,
      external_reconstruction_required:true,
    },
  });

  const scopedCandidateStore=scopeSovereigntyCandidateStore(candidateStore,{
    keys:[`source_control::${CANDIDATE_ID}`],
  });
  const registryStore=new D1AlternativeRegistryStore(env.DB);
  const adapter=createShardVaultSourceControlAdapter({env,expectedSha:sourceSha});

  const validation=await validateSovereigntyCandidates({
    candidateStore:scopedCandidateStore,
    registryStore,
    env,
    now,
    limit:1,
    resolveCandidate:async candidate=>{
      if(candidate.layer!=='source_control'||candidate.id!==CANDIDATE_ID){
        return{descriptor:null,adapter:null};
      }
      return{
        descriptor:{
          id:CANDIDATE_ID,
          provider:'shardvault-external+d1-overlay',
          adapter_id:CANDIDATE_ID,
          endpoint_class:'shardvault-reconstruction+d1-overlay',
          added_cost_eur:0,
          cost_provenance:{
            verified:true,
            addedCost:0,
            source:'existing-shardvault-and-d1-zero-added-cost',
            authorization:{approved:true,policy:'ZERO_EURO',authority:'owner'},
          },
        },
        adapter,
        context:{
          sourceSha,
          scratchPrefix:'mel-shardvault-source-proof',
        },
      };
    },
  });

  const blocked=(validation.results||[]).find(row=>row?.status==='BLOCKED')||null;
  return{
    ok:true,
    skipped:false,
    status:validation.prevalidated>0?'PREVALIDATED':validation.blocked>0?'BLOCKED':'NOOP',
    reason:validation.prevalidated>0?null:String(blocked?.code||blocked?.validation_status||blocked?.reason||'SHARDVAULT_SOURCE_CONTROL_PREVALIDATION_BLOCKED').slice(0,180),
    source_sha:sourceSha,
    processed:validation.processed,
    prevalidated:validation.prevalidated,
    blocked:validation.blocked,
    results:validation.results,
  };
}

export const SHARDVAULT_SOURCE_CONTROL_CANDIDATE_ID=CANDIDATE_ID;
