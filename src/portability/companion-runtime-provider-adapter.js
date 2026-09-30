import { RuntimeProviderAdapter } from './runtime-provider-adapter.js';

function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=300){return String(v||'').trim().slice(0,max);}

export function createCompanionRuntimeProviderAdapter({
  execute,
  id='companion-local-runtime',
  provider='local-companion-runtime',
  service='mel-standby',
}={}){
  const rpc=req(execute,'COMPANION_RUNTIME_EXECUTOR_REQUIRED');
  const svc=clean(service,180);
  const call=async(action,payload={})=>{
    const result=await rpc({
      capability:'sovereignty.runtime',
      action,
      service:svc,
      payload,
    });
    if(result?.ok!==true){
      throw Object.assign(new Error(result?.code||'COMPANION_RUNTIME_FAILED'),{code:result?.code||'COMPANION_RUNTIME_FAILED'});
    }
    return result;
  };

  return new RuntimeProviderAdapter({
    id,provider,
    health:async()=>{
      try{
        const result=await call('health');
        return{ok:true,status:'HEALTHY',runtime:clean(result?.runtime,120)||null};
      }catch(error){
        return{ok:false,status:'UNAVAILABLE',code:error.code||error.message};
      }
    },
    prepare:async({artifact,source_sha})=>{
      const result=await call('prepare',{
        artifact,
        source_sha:clean(source_sha,80),
      });
      return{
        ok:true,
        plan_id:clean(result?.plan_id,200)||'local-plan',
        source_sha:clean(result?.source_sha,80)||clean(source_sha,80),
      };
    },
    deployCandidate:async({prepared,artifact,source_sha})=>{
      const result=await call('deploy_candidate',{
        prepared,
        artifact,
        source_sha:clean(source_sha,80),
      });
      return{ok:true,candidate_id:clean(result?.candidate_id,200)};
    },
    smoke:async({candidate_id,source_sha})=>{
      const result=await call('smoke',{
        candidate_id:clean(candidate_id,200),
        source_sha:clean(source_sha,80),
      });
      return{ok:result?.passed!==false,details:result?.details||null};
    },
    promote:async({candidate_id,source_sha})=>{
      const result=await call('promote',{
        candidate_id:clean(candidate_id,200),
        source_sha:clean(source_sha,80),
      });
      return{ok:result?.promoted!==false,release_id:clean(result?.release_id,200)||null};
    },
    rollback:async({candidate_id,source_sha,reason})=>{
      const result=await call('rollback',{
        candidate_id:clean(candidate_id,200),
        source_sha:clean(source_sha,80),
        reason:clean(reason,240),
      });
      return{ok:result?.rolled_back!==false};
    },
  });
}
