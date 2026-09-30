function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,m=240){return String(v||'').trim().slice(0,m);}

export class RuntimeProviderAdapter{
  constructor({id,provider,prepare,deployCandidate,smoke,promote,rollback,health}={}){
    this.id=clean(id);this.provider=clean(provider);
    if(!this.id||!this.provider)throw Object.assign(new TypeError('RUNTIME_PROVIDER_DESCRIPTOR_INVALID'),{code:'RUNTIME_PROVIDER_DESCRIPTOR_INVALID'});
    this._prepare=req(prepare,'RUNTIME_PROVIDER_PREPARE_REQUIRED');
    this._deploy=req(deployCandidate,'RUNTIME_PROVIDER_DEPLOY_REQUIRED');
    this._smoke=req(smoke,'RUNTIME_PROVIDER_SMOKE_REQUIRED');
    this._promote=req(promote,'RUNTIME_PROVIDER_PROMOTE_REQUIRED');
    this._rollback=req(rollback,'RUNTIME_PROVIDER_ROLLBACK_REQUIRED');
    this._health=typeof health==='function'?health:async()=>({ok:true,status:'UNKNOWN'});
  }
  health(){return this._health();}
  prepare(input){return this._prepare(input);}
  deployCandidate(input){return this._deploy(input);}
  smoke(input){return this._smoke(input);}
  promote(input){return this._promote(input);}
  rollback(input){return this._rollback(input);}
}

export async function proveRuntimeProvider(adapter,{artifact,sourceSha}={}){
  if(!(adapter instanceof RuntimeProviderAdapter))throw Object.assign(new TypeError('RUNTIME_PROVIDER_ADAPTER_REQUIRED'),{code:'RUNTIME_PROVIDER_ADAPTER_REQUIRED'});
  const sha=clean(sourceSha,80);
  if(!/^[0-9a-f]{40}$/i.test(sha))throw Object.assign(new Error('RUNTIME_PROVIDER_SOURCE_SHA_INVALID'),{code:'RUNTIME_PROVIDER_SOURCE_SHA_INVALID'});
  const health=await adapter.health();
  if(health?.ok===false)return{ok:false,status:'RUNTIME_PROVIDER_HEALTH_FAILED',health};
  const prepared=await adapter.prepare({artifact,source_sha:sha});
  if(prepared?.ok!==true)return{ok:false,status:'RUNTIME_PROVIDER_PREPARE_FAILED'};
  const deployed=await adapter.deployCandidate({artifact,source_sha:sha,prepared});
  if(deployed?.ok!==true||!deployed?.candidate_id)return{ok:false,status:'RUNTIME_PROVIDER_CANDIDATE_DEPLOY_FAILED'};
  let smoke;
  try{smoke=await adapter.smoke({candidate_id:deployed.candidate_id,source_sha:sha});}
  catch(e){smoke={ok:false,code:clean(e?.code||e?.message||'RUNTIME_SMOKE_FAILED',180)};}
  if(smoke?.ok!==true){
    const rollback=await adapter.rollback({candidate_id:deployed.candidate_id,source_sha:sha,reason:smoke?.code||'SMOKE_FAILED'});
    return{ok:false,status:'RUNTIME_PROVIDER_ROLLED_BACK',rollback_ok:rollback?.ok===true,smoke};
  }
  const promoted=await adapter.promote({candidate_id:deployed.candidate_id,source_sha:sha});
  if(promoted?.ok!==true){
    const rollback=await adapter.rollback({candidate_id:deployed.candidate_id,source_sha:sha,reason:'PROMOTE_FAILED'});
    return{ok:false,status:'RUNTIME_PROVIDER_PROMOTION_ROLLED_BACK',rollback_ok:rollback?.ok===true};
  }
  return{ok:true,status:'RUNTIME_PROVIDER_VERIFIED',provider:adapter.provider,adapter_id:adapter.id,candidate_id:deployed.candidate_id,source_sha:sha,smoke:true,promoted:true,rollback_available:true};
}
