import { proveRuntimeProvider } from './runtime-provider-adapter.js';
import { createAlternativeRegistry } from './prevalidated-alternative-registry.js';

function clean(v,max=300){return String(v||'').trim().slice(0,max);}

function zeroCostVerified(descriptor={}){
  const p=descriptor.cost_provenance||descriptor.costProvenance||{};
  return Number(descriptor.added_cost_eur??descriptor.estimated_cost??descriptor.estimatedCost)===0
    && p?.verified===true
    && Number(p?.addedCost??p?.added_cost_eur??0)===0
    && p?.authorization?.approved===true;
}

export async function prevalidateRuntimeAlternative({
  descriptor,
  adapter,
  registry,
  artifact,
  sourceSha,
  now=Date.now(),
  ttlMs=30*24*60*60*1000,
}={}){
  const id=clean(descriptor?.id,200);
  const provider=clean(descriptor?.provider,200);
  if(!id||!provider){
    return {ok:false,status:'INVALID_DESCRIPTOR',registry:createAlternativeRegistry(registry?.all||[],{now})};
  }
  if(!zeroCostVerified(descriptor)){
    return {ok:false,status:'SKIPPED_COST_NOT_VERIFIED_ZERO',id,provider,registry:createAlternativeRegistry(registry?.all||[],{now})};
  }

  let proof;
  try{
    proof=await proveRuntimeProvider(adapter,{artifact,sourceSha});
  }catch(error){
    return {
      ok:false,status:'LIVE_RUNTIME_PROOF_FAILED',id,provider,
      code:clean(error?.code||error?.message,180),
      registry:createAlternativeRegistry(registry?.all||[],{now}),
    };
  }
  if(proof?.ok!==true){
    return {
      ok:false,status:'LIVE_RUNTIME_PROOF_FAILED',id,provider,
      code:clean(proof?.status,180),
      proof,
      registry:createAlternativeRegistry(registry?.all||[],{now}),
    };
  }

  const byId=new Map((registry?.all||[]).map(row=>[row.id,row]));
  byId.set(id,{
    ...(byId.get(id)||{}),
    id,
    layer:'runtime',
    provider,
    adapter_id:clean(descriptor?.adapter_id,200)||adapter?.id||id,
    endpoint_class:clean(descriptor?.endpoint_class,120)||'runtime-provider',
    cost_mode:'ZERO_EURO_VERIFIED',
    added_cost_eur:0,
    credential_ref:clean(descriptor?.credential_ref,160)||null,
    notes:'Alternate runtime live-proven through prepare/deploy/smoke/promote with rollback capability.',
    proof:{
      isolated_test:true,
      smoke:true,
      rollback:true,
      export:true,
      import:true,
      activate:true,
      verified_at:new Date(now).toISOString(),
      expires_at:new Date(now+ttlMs).toISOString(),
      evidence_ref:`runtime://provider-prevalidation/${id}/${new Date(now).toISOString()}`,
      source_sha:clean(sourceSha,80)||null,
    },
  });
  const next=createAlternativeRegistry([...byId.values()],{now});
  return {
    ok:true,
    status:'RUNTIME_ALTERNATIVE_PREVALIDATED',
    id,provider,proof,
    registry:next,
  };
}
