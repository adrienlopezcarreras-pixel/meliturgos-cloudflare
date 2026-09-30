import { proveRuntimeProvider } from './runtime-provider-adapter.js';
import { proveObjectStorageAdapter } from './object-storage-adapter.js';
import { proveDatabaseAdapter } from './database-adapter.js';
import { proveSourceControlAdapter } from './source-control-adapter.js';
import { proveCiProviderAdapter } from './ci-provider-adapter.js';
import { proveSecretStoreAdapter } from './secret-store-adapter.js';
import { proveSchedulerAdapter } from './scheduler-adapter.js';
import { proveObservabilityAdapter } from './observability-adapter.js';
import { createAlternativeRegistry } from './prevalidated-alternative-registry.js';

const PROVERS=Object.freeze({
  runtime: async({adapter,context})=>proveRuntimeProvider(adapter,{
    artifact:context?.artifact,
    sourceSha:context?.sourceSha,
  }),
  storage: async({adapter})=>proveObjectStorageAdapter(adapter),
  database: async({adapter})=>proveDatabaseAdapter(adapter),
  source_control: async({adapter,context})=>proveSourceControlAdapter(adapter,{
    scratchPrefix:context?.scratchPrefix||'mel-sovereignty-proof',
  }),
  ci_cd: async({adapter,context})=>proveCiProviderAdapter(adapter,{
    sourceSha:context?.sourceSha,
    pipeline:context?.pipeline||'sovereignty-smoke',
  }),
  secrets_identity: async({adapter})=>proveSecretStoreAdapter(adapter),
  scheduler: async({adapter})=>proveSchedulerAdapter(adapter),
  observability: async({adapter})=>proveObservabilityAdapter(adapter),
});

function clean(v,max=300){return String(v||'').trim().slice(0,max);}

function zeroCostVerified(descriptor={}){
  const p=descriptor.cost_provenance||descriptor.costProvenance||{};
  return Number(descriptor.added_cost_eur??descriptor.estimated_cost??descriptor.estimatedCost)===0
    && p?.verified===true
    && Number(p?.addedCost??p?.added_cost_eur??0)===0
    && p?.authorization?.approved===true;
}

export async function prevalidateInfrastructureAlternative({
  layer,
  descriptor,
  adapter,
  registry,
  context={},
  now=Date.now(),
  ttlMs=30*24*60*60*1000,
}={}){
  const prove=PROVERS[layer];
  if(!prove){
    return {ok:false,status:'INFRA_LAYER_UNSUPPORTED',layer,registry:createAlternativeRegistry(registry?.all||[],{now})};
  }
  const id=clean(descriptor?.id,200);
  const provider=clean(descriptor?.provider,200);
  if(!id||!provider){
    return {ok:false,status:'INFRA_DESCRIPTOR_INVALID',layer,registry:createAlternativeRegistry(registry?.all||[],{now})};
  }
  if(!zeroCostVerified(descriptor)){
    return {ok:false,status:'SKIPPED_COST_NOT_VERIFIED_ZERO',id,provider,layer,registry:createAlternativeRegistry(registry?.all||[],{now})};
  }

  let proof;
  try{
    proof=await prove({adapter,context});
  }catch(error){
    return{
      ok:false,status:'INFRA_LIVE_PROOF_FAILED',id,provider,layer,
      code:clean(error?.code||error?.message,180),
      registry:createAlternativeRegistry(registry?.all||[],{now}),
    };
  }
  if(proof?.ok!==true){
    return{
      ok:false,status:'INFRA_LIVE_PROOF_FAILED',id,provider,layer,
      code:clean(proof?.status,180),proof,
      registry:createAlternativeRegistry(registry?.all||[],{now}),
    };
  }

  const byId=new Map((registry?.all||[]).map(row=>[row.id,row]));
  byId.set(id,{
    ...(byId.get(id)||{}),
    id,
    layer,
    provider,
    adapter_id:clean(descriptor?.adapter_id,200)||adapter?.id||id,
    endpoint_class:clean(descriptor?.endpoint_class,120)||layer,
    cost_mode:'ZERO_EURO_VERIFIED',
    added_cost_eur:0,
    credential_ref:clean(descriptor?.credential_ref,160)||null,
    notes:`Live-proven alternate ${layer} provider.`,
    proof:{
      isolated_test:true,
      smoke:true,
      rollback:true,
      export:true,
      import:true,
      activate:true,
      verified_at:new Date(now).toISOString(),
      expires_at:new Date(now+ttlMs).toISOString(),
      evidence_ref:`runtime://infrastructure-prevalidation/${layer}/${id}/${new Date(now).toISOString()}`,
      source_sha:clean(context?.sourceSha,80)||null,
    },
  });

  const next=createAlternativeRegistry([...byId.values()],{now});
  return{
    ok:true,status:'INFRA_ALTERNATIVE_PREVALIDATED',
    id,provider,layer,proof,registry:next,
  };
}

export const INFRASTRUCTURE_PREVALIDATION_LAYERS=Object.freeze(Object.keys(PROVERS));
