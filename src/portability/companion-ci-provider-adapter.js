import { CiProviderAdapter } from './ci-provider-adapter.js';

function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=240){return String(v||'').trim().slice(0,max);}

export function createCompanionCiProviderAdapter({
  execute,
  id='companion-local-ci',
  provider='local-companion-ci',
  repository='meliturgos-cloudflare',
}={}){
  const rpc=req(execute,'COMPANION_CI_EXECUTOR_REQUIRED');
  const repo=clean(repository,200);
  if(!repo)throw Object.assign(new TypeError('COMPANION_CI_REPOSITORY_REQUIRED'),{code:'COMPANION_CI_REPOSITORY_REQUIRED'});

  const call=async(action,payload={})=>{
    const result=await rpc({
      capability:'sovereignty.ci',
      action,
      repository:repo,
      payload,
    });
    if(result?.ok!==true){
      throw Object.assign(new Error(result?.code||'COMPANION_CI_FAILED'),{code:result?.code||'COMPANION_CI_FAILED'});
    }
    return result;
  };

  return new CiProviderAdapter({
    id,
    provider,
    health:async()=>{
      try{
        const result=await call('health');
        return{ok:true,status:'HEALTHY',node_version:clean(result?.node_version,120)||null};
      }catch(error){
        return{ok:false,status:'UNAVAILABLE',code:error.code||error.message};
      }
    },
    dispatch:async({pipeline,source_sha,mode})=>{
      const result=await call('dispatch',{
        pipeline:clean(pipeline,200),
        source_sha:clean(source_sha,80),
        mode:clean(mode,80),
      });
      return{ok:true,run_id:clean(result?.run_id,200)};
    },
    getRun:async({run_id})=>{
      const result=await call('get_run',{run_id:clean(run_id,200)});
      return{
        ok:true,
        run_id:clean(result?.run_id,200),
        source_sha:clean(result?.source_sha,80),
        status:clean(result?.status,80),
      };
    },
    cancelRun:async({run_id})=>{
      await call('cancel_run',{run_id:clean(run_id,200)});
      return{ok:true};
    },
    getArtifacts:async({run_id})=>{
      const result=await call('get_artifacts',{run_id:clean(run_id,200)});
      return{ok:true,artifacts:Array.isArray(result?.artifacts)?result.artifacts:[]};
    },
  });
}
