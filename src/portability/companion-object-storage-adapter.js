import { ObjectStorageAdapter } from './object-storage-adapter.js';

function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=300){return String(v||'').trim().slice(0,max);}

export function createCompanionObjectStorageAdapter({
  execute,
  id='companion-local-storage',
  provider='local-companion-storage',
  namespace='mel-sovereignty',
}={}){
  const rpc=req(execute,'COMPANION_STORAGE_EXECUTOR_REQUIRED');
  const ns=clean(namespace,160);
  const call=async(action,payload={})=>{
    const result=await rpc({
      capability:'sovereignty.storage',
      action,
      namespace:ns,
      payload,
    });
    if(result?.ok!==true){
      throw Object.assign(new Error(result?.code||'COMPANION_STORAGE_FAILED'),{code:result?.code||'COMPANION_STORAGE_FAILED'});
    }
    return result;
  };

  return new ObjectStorageAdapter({
    id,provider,
    health:async()=>{
      try{
        const result=await call('health');
        return{ok:true,status:'HEALTHY',backend:clean(result?.backend,120)||null};
      }catch(error){
        return{ok:false,status:'UNAVAILABLE',code:error.code||error.message};
      }
    },
    put:async({key,bytes,content_type})=>{
      const result=await call('put',{
        key:clean(key,800),
        bytes_base64:btoa(String.fromCharCode(...new Uint8Array(bytes))),
        content_type:clean(content_type,120)||'application/octet-stream',
      });
      return{ok:true,etag:clean(result?.etag,200)||null};
    },
    get:async({key})=>{
      const result=await call('get',{key:clean(key,800)});
      if(result?.found===false)return{ok:true,found:false,status:'NOT_FOUND'};
      const raw=atob(String(result?.bytes_base64||''));
      const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
      return{ok:true,found:true,bytes};
    },
    list:async({prefix})=>{
      const result=await call('list',{prefix:clean(prefix,800)});
      return{ok:true,keys:Array.isArray(result?.keys)?result.keys.map(x=>clean(x,800)):[]};
    },
    deleteObject:async({key})=>{
      await call('delete',{key:clean(key,800)});
      return{ok:true};
    },
  });
}
