import { parseHttpChatProviderDescriptors } from '../augmentio/http-chat-adapter.js';

function clean(v,max=500){return String(v||'').trim().slice(0,max);}

export function configuredAiCandidateReport(env={}, {now=Date.now()}={}){
  const descriptors=parseHttpChatProviderDescriptors(env);
  return {
    schema:'mel.configured-ai-candidates/v1',
    generated_at:new Date(now).toISOString(),
    results:[{
      layer:'ai',
      candidate_hints:descriptors.map(d=>({
        id:clean(d.id,220),
        provider_hint:clean(d.providerId,220),
        source_url:clean(d.endpoint,500)||null,
        source_title:`Configured AI provider ${clean(d.providerId,120)}`,
        status:'UNVERIFIED',
        prevalidated:false,
        activation_allowed:false,
      })),
    }],
  };
}

export async function syncConfiguredAiCandidates(candidateStore,env={},options={}){
  if(!candidateStore||typeof candidateStore.upsertFromWatch!=='function'){
    throw Object.assign(new TypeError('SOVEREIGNTY_CANDIDATE_STORE_REQUIRED'),{code:'SOVEREIGNTY_CANDIDATE_STORE_REQUIRED'});
  }
  const report=configuredAiCandidateReport(env,options);
  const persisted=await candidateStore.upsertFromWatch(report,options);
  return {
    ok:true,
    configured_count:report.results[0].candidate_hints.length,
    persisted,
    report,
  };
}
