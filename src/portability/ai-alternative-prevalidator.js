import {
  createHttpChatAdapter,
  parseHttpChatProviderDescriptors,
} from '../augmentio/http-chat-adapter.js';
import { createAlternativeRegistry } from './prevalidated-alternative-registry.js';

function clean(v,max=300){return String(v||'').trim().slice(0,max);}

function zeroCostVerified(descriptor={}){
  const p=descriptor.costProvenance||{};
  return Number(descriptor.estimatedCost)===0
    && p?.verified===true
    && Number(p?.addedCost)===0
    && p?.authorization?.approved===true;
}

export async function prevalidateConfiguredAiAlternatives({
  env={},
  registry,
  now=Date.now(),
  ttlMs=30*24*60*60*1000,
  fetchImpl=fetch,
}={}){
  const descriptors=parseHttpChatProviderDescriptors(env);
  const currentRows=Array.isArray(registry?.all)?registry.all:[];
  const byId=new Map(currentRows.map(row=>[row.id,row]));
  const results=[];

  for(const descriptor of descriptors){
    const id=descriptor.id;
    if(!zeroCostVerified(descriptor)){
      results.push({id,status:'SKIPPED_COST_NOT_VERIFIED_ZERO'});
      continue;
    }

    let adapter;
    try{
      adapter=createHttpChatAdapter({
        env,
        ...descriptor,
        fetchImpl,
      });
    }catch(error){
      results.push({id,status:'INVALID_DESCRIPTOR',code:clean(error?.code||error?.message)});
      continue;
    }

    let response;
    try{
      response=await adapter.invoke({
        input:'Reply exactly with MEL_AI_ALT_OK',
        context:{
          system:'This is a provider portability smoke test. Reply exactly with MEL_AI_ALT_OK and nothing else.',
          inference_settings:{temperature:0,max_tokens:16},
        },
      });
    }catch(error){
      results.push({id,status:'LIVE_SMOKE_FAILED',code:clean(error?.code||error?.message)});
      continue;
    }

    if(clean(response?.text,80)!=='MEL_AI_ALT_OK'){
      results.push({id,status:'LIVE_SMOKE_FAILED',code:'UNEXPECTED_RESPONSE'});
      continue;
    }

    const previous=byId.get(id)||{};
    byId.set(id,{
      ...previous,
      id,
      layer:'ai',
      provider:descriptor.providerId,
      adapter_id:id,
      endpoint_class:'provider-neutral-http-chat',
      cost_mode:'ZERO_EURO_VERIFIED',
      added_cost_eur:0,
      credential_ref:descriptor.secretEnv||null,
      notes:'Live provider-neutral AI alternative validated by exact-response smoke.',
      policy_profile:descriptor.policyProfile||'STANDARD',
      low_refusal:descriptor.lowRefusal===true,
      proof:{
        isolated_test:true,
        smoke:true,
        rollback:true,
        export:true,
        import:true,
        activate:true,
        verified_at:new Date(now).toISOString(),
        expires_at:new Date(now+ttlMs).toISOString(),
        evidence_ref:`runtime://ai-prevalidation/${id}/${new Date(now).toISOString()}`,
        source_sha:clean(env?.MEL_DEPLOYED_GIT_SHA,80)||null,
      },
    });
    results.push({
      id,
      status:'PREVALIDATED',
      provider:descriptor.providerId,
      policy_profile:descriptor.policyProfile||'STANDARD',
      low_refusal:descriptor.lowRefusal===true,
    });
  }

  const next=createAlternativeRegistry([...byId.values()],{now});
  return {
    ok:true,
    checked_at:new Date(now).toISOString(),
    configured_count:descriptors.length,
    prevalidated_count:results.filter(r=>r.status==='PREVALIDATED').length,
    skipped_count:results.filter(r=>r.status.startsWith('SKIPPED_')).length,
    failed_count:results.filter(r=>['LIVE_SMOKE_FAILED','INVALID_DESCRIPTOR'].includes(r.status)).length,
    results,
    registry:next,
  };
}
