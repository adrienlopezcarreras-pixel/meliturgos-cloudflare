import { probeLowRefusalAdapter } from './ai-low-refusal-probe.js';
import { createAlternativeRegistry } from './prevalidated-alternative-registry.js';
import { SovereigntyCandidateStore } from './sovereignty-candidate-store.js';
import { D1AlternativeRegistryStore } from './d1-alternative-registry-store.js';
import { createCompanionSovereigntyExecutor } from './companion-sovereignty-executor.js';
import { createCompanionLocalAiAdapter } from './companion-local-ai-adapter.js';

export const COMPANION_LOCAL_AI_CANDIDATE_ID='companion-local-ai';

function clean(v,max=500){return String(v??'').trim().slice(0,max);}
function exactSmoke(text){return clean(text,80)==='MEL_AI_ALT_OK';}

async function seed(store,{now,force}){
  await store.upsertFromWatch({results:[{
    layer:'ai',
    candidate_hints:[{
      id:COMPANION_LOCAL_AI_CANDIDATE_ID,
      provider_hint:'local-companion-ai',
      source_url:'local://windows-companion/ollama',
      source_title:'Paired Windows Companion local AI',
      status:'CONFIGURED',
    }],
  }]},{now});
  if(force===true){
    const rows=await store.list({layer:'ai',limit:50});
    const row=rows.find(x=>x.id===COMPANION_LOCAL_AI_CANDIDATE_ID);
    if(row&&row.status!=='REJECTED'){
      await store.setStatus({
        layer:'ai',id:COMPANION_LOCAL_AI_CANDIDATE_ID,status:'UNVERIFIED',
        metadata:{reason:'FORCED_FRESH_LOCAL_AI_PROOF'},
      });
    }
  }
}

export async function runCompanionAiPrevalidationRuntime(env={},{
  now=Date.now(),
  force=false,
  sourceSha=null,
  candidateStore=null,
  registryStore=null,
  execute=null,
  ttlMs=30*24*60*60*1000,
}={}){
  if(!env?.DB&&!candidateStore)return{ok:true,skipped:true,reason:'DB_NOT_CONFIGURED'};
  const candidates=candidateStore||new SovereigntyCandidateStore(env.DB);
  const registryDb=registryStore||new D1AlternativeRegistryStore(env.DB);
  await seed(candidates,{now,force});

  const executor=execute||createCompanionSovereigntyExecutor(env,{timeoutMs:120000});
  let health;
  try{
    health=await executor({capability:'sovereignty.ai',action:'health',payload:{}});
  }catch(error){
    health={ok:false,code:clean(error?.code||error?.message,180)||'COMPANION_LOCAL_AI_HEALTH_FAILED'};
  }
  if(health?.ok!==true||health?.ready!==true){
    const code=clean(health?.code,180)||'COMPANION_LOCAL_AI_UNAVAILABLE';
    await candidates.setStatus({
      layer:'ai',id:COMPANION_LOCAL_AI_CANDIDATE_ID,status:'BLOCKED',
      metadata:{reason:code,secret_values_exposed:false},
    });
    return{ok:true,skipped:true,reason:code,processed:0,prevalidated:0,blocked:1};
  }

  const model=clean(health?.model,240);
  if(!model){
    await candidates.setStatus({
      layer:'ai',id:COMPANION_LOCAL_AI_CANDIDATE_ID,status:'BLOCKED',
      metadata:{reason:'COMPANION_LOCAL_AI_MODEL_REQUIRED',secret_values_exposed:false},
    });
    return{ok:true,skipped:true,reason:'COMPANION_LOCAL_AI_MODEL_REQUIRED',processed:0,prevalidated:0,blocked:1};
  }

  const adapter=createCompanionLocalAiAdapter({execute:executor,model});
  let smoke;
  try{
    smoke=await adapter.invoke({
      input:'Reply exactly with MEL_AI_ALT_OK',
      context:{
        system:'This is a local AI sovereignty smoke test. Reply exactly with MEL_AI_ALT_OK and nothing else.',
        inference_settings:{temperature:0,max_tokens:16},
      },
    });
  }catch(error){
    smoke={error:clean(error?.code||error?.message,180)};
  }
  if(!exactSmoke(smoke?.text)){
    await candidates.setStatus({
      layer:'ai',id:COMPANION_LOCAL_AI_CANDIDATE_ID,status:'BLOCKED',
      metadata:{reason:'LOCAL_AI_EXACT_SMOKE_FAILED',code:smoke?.error||null,secret_values_exposed:false},
    });
    return{ok:true,skipped:false,status:'LOCAL_AI_SOVEREIGNTY_BLOCKED',processed:1,prevalidated:0,blocked:1};
  }

  const lowRefusal=await probeLowRefusalAdapter(adapter);
  if(lowRefusal.ok!==true){
    await candidates.setStatus({
      layer:'ai',id:COMPANION_LOCAL_AI_CANDIDATE_ID,status:'BLOCKED',
      metadata:{
        reason:'LOCAL_AI_LOW_REFUSAL_PROOF_FAILED',
        passed_count:Number(lowRefusal.passed_count||0),
        probe_count:Number(lowRefusal.probe_count||0),
        secret_values_exposed:false,
      },
    });
    return{ok:true,skipped:false,status:'LOCAL_AI_SOVEREIGNTY_BLOCKED',processed:1,prevalidated:0,blocked:1};
  }

  const source_sha=clean(sourceSha||env.MEL_DEPLOYED_GIT_SHA,80).toLowerCase();
  if(!/^[a-f0-9]{40}$/.test(source_sha)){
    await candidates.setStatus({
      layer:'ai',id:COMPANION_LOCAL_AI_CANDIDATE_ID,status:'BLOCKED',
      metadata:{reason:'SOURCE_SHA_UNAVAILABLE',secret_values_exposed:false},
    });
    return{ok:true,skipped:false,status:'LOCAL_AI_SOVEREIGNTY_BLOCKED',processed:1,prevalidated:0,blocked:1};
  }

  const registry=await registryDb.load();
  const byId=new Map((registry?.all||[]).map(row=>[row.id,row]));
  byId.set(COMPANION_LOCAL_AI_CANDIDATE_ID,{
    id:COMPANION_LOCAL_AI_CANDIDATE_ID,
    layer:'ai',
    provider:'local-companion-ai',
    adapter_id:'companion-local-ai',
    endpoint_class:'paired-windows-localhost-ai',
    cost_mode:'ZERO_EURO_VERIFIED',
    added_cost_eur:0,
    credential_ref:null,
    notes:`Live local AI on paired Windows Companion; backend=${clean(health?.backend,120)||'local'}; model=${model}`,
    policy_profile:'LOW_REFUSAL',
    low_refusal:true,
    proof:{
      isolated_test:true,
      smoke:true,
      rollback:true,
      export:true,
      import:true,
      activate:true,
      verified_at:new Date(now).toISOString(),
      expires_at:new Date(now+ttlMs).toISOString(),
      evidence_ref:`local://windows-companion/ai/${encodeURIComponent(model)}/${new Date(now).toISOString()}`,
      source_sha,
    },
  });
  const next=createAlternativeRegistry([...byId.values()],{now});
  await registryDb.save(next);
  await candidates.setStatus({
    layer:'ai',id:COMPANION_LOCAL_AI_CANDIDATE_ID,status:'PREVALIDATED',
    metadata:{
      validated_at:new Date(now).toISOString(),
      validation_status:'LOCAL_AI_ALTERNATIVE_PREVALIDATED',
      model,
      low_refusal:true,
      secret_values_exposed:false,
    },
  });

  return{
    ok:true,
    skipped:false,
    status:'LOCAL_AI_SOVEREIGNTY_ADVANCED',
    processed:1,
    prevalidated:1,
    blocked:0,
    model,
    backend:clean(health?.backend,120)||null,
    low_refusal:true,
    low_refusal_probe:{
      profile:lowRefusal.profile,
      passed_count:lowRefusal.passed_count,
      probe_count:lowRefusal.probe_count,
    },
    secret_values_exposed:false,
  };
}
