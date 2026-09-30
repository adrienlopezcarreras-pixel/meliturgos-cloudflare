function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=240){return String(v||'').trim().slice(0,max);}

export class CiProviderAdapter{
  constructor({id,provider,health,dispatch,getRun,cancelRun,getArtifacts}={}){
    this.id=clean(id);this.provider=clean(provider);
    if(!this.id||!this.provider)throw Object.assign(new TypeError('CI_PROVIDER_DESCRIPTOR_INVALID'),{code:'CI_PROVIDER_DESCRIPTOR_INVALID'});
    this._health=typeof health==='function'?health:async()=>({ok:true,status:'UNKNOWN'});
    this._dispatch=req(dispatch,'CI_PROVIDER_DISPATCH_REQUIRED');
    this._getRun=req(getRun,'CI_PROVIDER_GET_RUN_REQUIRED');
    this._cancel=req(cancelRun,'CI_PROVIDER_CANCEL_REQUIRED');
    this._artifacts=req(getArtifacts,'CI_PROVIDER_ARTIFACTS_REQUIRED');
  }
  health(){return this._health();}
  dispatch(input){return this._dispatch(input);}
  getRun(input){return this._getRun(input);}
  cancelRun(input){return this._cancel(input);}
  getArtifacts(input){return this._artifacts(input);}
}

export async function proveCiProviderAdapter(adapter,{sourceSha,pipeline='sovereignty-smoke'}={}){
  if(!(adapter instanceof CiProviderAdapter))throw Object.assign(new TypeError('CI_PROVIDER_ADAPTER_REQUIRED'),{code:'CI_PROVIDER_ADAPTER_REQUIRED'});
  const sha=clean(sourceSha,80);
  if(!/^[0-9a-f]{40}$/i.test(sha))throw Object.assign(new Error('CI_PROVIDER_SOURCE_SHA_INVALID'),{code:'CI_PROVIDER_SOURCE_SHA_INVALID'});
  const health=await adapter.health();
  if(health?.ok===false)return{ok:false,status:'CI_PROVIDER_HEALTH_FAILED',health};

  const started=await adapter.dispatch({pipeline,source_sha:sha,mode:'proof'});
  const runId=clean(started?.run_id,200);
  if(started?.ok!==true||!runId)return{ok:false,status:'CI_PROVIDER_DISPATCH_FAILED'};

  const run=await adapter.getRun({run_id:runId});
  if(run?.ok!==true)return{ok:false,status:'CI_PROVIDER_RUN_READ_FAILED',run_id:runId};
  if(clean(run?.source_sha,80).toLowerCase()!==sha.toLowerCase()){
    return{ok:false,status:'CI_PROVIDER_SHA_MISMATCH',run_id:runId};
  }
  const runStatus=clean(run?.status,80).toUpperCase();
  if(!['SUCCESS','SUCCEEDED','COMPLETED'].includes(runStatus)){
    return{ok:false,status:'CI_PROVIDER_PROOF_RUN_NOT_SUCCESSFUL',run_id:runId,run_status:runStatus||'UNKNOWN'};
  }

  const artifacts=await adapter.getArtifacts({run_id:runId});
  if(artifacts?.ok!==true||!Array.isArray(artifacts.artifacts)){
    return{ok:false,status:'CI_PROVIDER_ARTIFACT_READ_FAILED',run_id:runId};
  }

  const cancel=await adapter.cancelRun({run_id:runId});
  if(cancel?.ok!==true)return{ok:false,status:'CI_PROVIDER_CANCEL_FAILED',run_id:runId};

  return{
    ok:true,status:'CI_PROVIDER_ADAPTER_VERIFIED',
    provider:adapter.provider,adapter_id:adapter.id,
    run_id:runId,source_sha:sha,
    dispatch:true,run_read:true,artifact_read:true,cancel:true,
  };
}
