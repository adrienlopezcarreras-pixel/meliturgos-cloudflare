function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=240){return String(v||'').trim().slice(0,max);}

export class ObservabilityAdapter{
  constructor({id,provider,health,emitLog,emitMetric,queryLogs,queryMetrics,deleteTestData}={}){
    this.id=clean(id);this.provider=clean(provider);
    if(!this.id||!this.provider)throw Object.assign(new TypeError('OBSERVABILITY_DESCRIPTOR_INVALID'),{code:'OBSERVABILITY_DESCRIPTOR_INVALID'});
    this._health=typeof health==='function'?health:async()=>({ok:true,status:'UNKNOWN'});
    this._emitLog=req(emitLog,'OBSERVABILITY_EMIT_LOG_REQUIRED');
    this._emitMetric=req(emitMetric,'OBSERVABILITY_EMIT_METRIC_REQUIRED');
    this._queryLogs=req(queryLogs,'OBSERVABILITY_QUERY_LOGS_REQUIRED');
    this._queryMetrics=req(queryMetrics,'OBSERVABILITY_QUERY_METRICS_REQUIRED');
    this._delete=req(deleteTestData,'OBSERVABILITY_DELETE_REQUIRED');
  }
  health(){return this._health();}
  emitLog(input){return this._emitLog(input);}
  emitMetric(input){return this._emitMetric(input);}
  queryLogs(input){return this._queryLogs(input);}
  queryMetrics(input){return this._queryMetrics(input);}
  deleteTestData(input){return this._delete(input);}
}

export async function proveObservabilityAdapter(adapter){
  if(!(adapter instanceof ObservabilityAdapter))throw Object.assign(new TypeError('OBSERVABILITY_ADAPTER_REQUIRED'),{code:'OBSERVABILITY_ADAPTER_REQUIRED'});
  const health=await adapter.health();
  if(health?.ok===false)return{ok:false,status:'OBSERVABILITY_HEALTH_FAILED',health};

  const traceId='mel-sovereignty-'+crypto.randomUUID();
  const metricName='mel.sovereignty.proof';

  const log=await adapter.emitLog({trace_id:traceId,level:'info',message:'MEL sovereignty observability proof'});
  if(log?.ok!==true)return{ok:false,status:'OBSERVABILITY_LOG_WRITE_FAILED'};

  const metric=await adapter.emitMetric({trace_id:traceId,name:metricName,value:1,tags:{kind:'sovereignty-proof'}});
  if(metric?.ok!==true)return{ok:false,status:'OBSERVABILITY_METRIC_WRITE_FAILED'};

  const logs=await adapter.queryLogs({trace_id:traceId,limit:20});
  if(logs?.ok!==true||!Array.isArray(logs.rows)||!logs.rows.some(row=>row?.trace_id===traceId)){
    return{ok:false,status:'OBSERVABILITY_LOG_READ_FAILED'};
  }

  const metrics=await adapter.queryMetrics({name:metricName,trace_id:traceId});
  if(metrics?.ok!==true||!Array.isArray(metrics.rows)||!metrics.rows.some(row=>row?.trace_id===traceId)){
    return{ok:false,status:'OBSERVABILITY_METRIC_READ_FAILED'};
  }

  const deleted=await adapter.deleteTestData({trace_id:traceId});
  if(deleted?.ok!==true)return{ok:false,status:'OBSERVABILITY_DELETE_FAILED'};

  return{
    ok:true,status:'OBSERVABILITY_ADAPTER_VERIFIED',
    provider:adapter.provider,adapter_id:adapter.id,
    log_write:true,log_read:true,metric_write:true,metric_read:true,delete:true,
  };
}
