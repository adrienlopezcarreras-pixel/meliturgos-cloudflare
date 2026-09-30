import { SourceControlAdapter } from './source-control-adapter.js';

function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=240){return String(v||'').trim().slice(0,max);}

export function createCompanionSourceControlAdapter({
  execute,
  id='companion-local-git',
  provider='local-companion-git',
  repository='meliturgos-cloudflare',
}={}){
  const rpc=req(execute,'COMPANION_SOURCE_CONTROL_EXECUTOR_REQUIRED');
  const repo=clean(repository,200);
  if(!repo)throw Object.assign(new TypeError('COMPANION_SOURCE_CONTROL_REPOSITORY_REQUIRED'),{code:'COMPANION_SOURCE_CONTROL_REPOSITORY_REQUIRED'});

  const call=async(action,payload={})=>{
    const result=await rpc({
      capability:'sovereignty.source_control',
      action,
      repository:repo,
      payload,
    });
    if(result?.ok!==true){
      const error=Object.assign(new Error(result?.code||'COMPANION_SOURCE_CONTROL_FAILED'),{
        code:result?.code||'COMPANION_SOURCE_CONTROL_FAILED',
      });
      throw error;
    }
    return result;
  };

  return new SourceControlAdapter({
    id,
    provider,
    health:async()=>{
      try{
        const result=await call('health');
        return{ok:true,status:'HEALTHY',git_version:clean(result?.git_version,120)||null};
      }catch(error){
        return{ok:false,status:'UNAVAILABLE',code:error.code||error.message};
      }
    },
    readRef:async({ref})=>{
      const result=await call('read_ref',{ref:clean(ref,240)});
      return{sha:clean(result?.sha,80)};
    },
    readFile:async({ref,path})=>{
      const result=await call('read_file',{ref:clean(ref,240),path:clean(path,500)});
      return{content:String(result?.content??''),encoding:result?.encoding||'utf-8'};
    },
    writeFile:async({ref,path,content,message})=>{
      const result=await call('write_file',{
        ref:clean(ref,240),
        path:clean(path,500),
        content:String(content??''),
        message:clean(message,500),
      });
      return{ok:true,sha:clean(result?.sha,80)};
    },
    createRef:async({ref,sha})=>{
      const result=await call('create_ref',{ref:clean(ref,240),sha:clean(sha,80)});
      return{ok:true,...result};
    },
    updateRef:async({ref,sha,force=false})=>{
      const result=await call('update_ref',{ref:clean(ref,240),sha:clean(sha,80),force:force===true});
      return{ok:true,...result};
    },
    compareRefs:async({base,head})=>{
      const result=await call('compare_refs',{base:clean(base,240),head:clean(head,240)});
      return{
        ok:true,
        ahead_by:Number(result?.ahead_by)||0,
        behind_by:Number(result?.behind_by)||0,
      };
    },
  });
}
