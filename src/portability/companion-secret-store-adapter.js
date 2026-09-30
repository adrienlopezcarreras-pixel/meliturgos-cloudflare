import { SecretStoreAdapter } from './secret-store-adapter.js';

function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=300){return String(v||'').trim().slice(0,max);}

export function createCompanionSecretStoreAdapter({
  execute,
  id='companion-local-secrets',
  provider='local-companion-secret-vault',
}={}){
  const rpc=req(execute,'COMPANION_SECRET_STORE_EXECUTOR_REQUIRED');
  const call=async(action,payload={})=>{
    const result=await rpc({
      capability:'sovereignty.secrets',
      action,
      payload,
    });
    if(result?.ok!==true){
      throw Object.assign(new Error(result?.code||'COMPANION_SECRET_STORE_FAILED'),{code:result?.code||'COMPANION_SECRET_STORE_FAILED'});
    }
    // Provider responses are metadata-only by contract; no plaintext value is accepted.
    if(JSON.stringify(result).match(/(?:secret_value|plaintext|token_value|password_value)/i)){
      throw Object.assign(new Error('COMPANION_SECRET_VALUE_LEAK'),{code:'COMPANION_SECRET_VALUE_LEAK'});
    }
    return result;
  };

  return new SecretStoreAdapter({
    id,provider,
    health:async()=>{
      try{
        const result=await call('health');
        return{ok:true,status:'HEALTHY',backend:clean(result?.backend,120)||null};
      }catch(error){
        return{ok:false,status:'UNAVAILABLE',code:error.code||error.message};
      }
    },
    putRef:async({ref,metadata})=>{
      const result=await call('put_ref',{ref:clean(ref,180),metadata:metadata||{}});
      return{ok:true,ref:clean(result?.ref,180)||clean(ref,180),version:Number(result?.version)||1};
    },
    getRef:async({ref})=>{
      const result=await call('get_ref',{ref:clean(ref,180)});
      return{ok:true,ref:clean(result?.ref,180)||clean(ref,180),version:Number(result?.version)||1,metadata:result?.metadata||{}};
    },
    listRefs:async({prefix})=>{
      const result=await call('list_refs',{prefix:clean(prefix,180)});
      return{ok:true,refs:Array.isArray(result?.refs)?result.refs.map(row=>({
        ref:clean(row?.ref,180),version:Number(row?.version)||1,metadata:row?.metadata||{},
      })):[]};
    },
    rotateRef:async({ref,reason})=>{
      const result=await call('rotate_ref',{ref:clean(ref,180),reason:clean(reason,240)});
      return{ok:true,ref:clean(result?.ref,180)||clean(ref,180),version:Number(result?.version)||1};
    },
    deleteRef:async({ref})=>{
      await call('delete_ref',{ref:clean(ref,180)});
      return{ok:true};
    },
  });
}
