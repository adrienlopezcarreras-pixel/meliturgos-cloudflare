import { ObservabilityAdapter } from './observability-adapter.js';

function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=240){return String(v||'').trim().slice(0,max);}

export function createCompanionObservabilityAdapter({
  execute,
  id='companion-local-observability',
  provider='local-companion-observability',
}={}){
  const rpc=req(execute,'COMPANION_OBSERVABILITY_EXECUTOR_REQUIRED');
  const call=async(action,payload={})=>{
    const result=await rpc({
      capability:'sovereignty.observability',
      action,
      payload,
    });
    if(result?.ok!==true){
      throw Object.assign(new Error(result?.code||'COMPANION_OBSERVABILITY_FAILED'),{code:result?.code||'COMPANION_OBSERVABILITY_FAILED'});
    }
    return result;
  };

  return new ObservabilityAdapter({
    id,
    provider,
    health:async()=>{
      try{
        const result=await call('health');
        return{ok:true,status:'HEALTHY',backend:clean(result?.backend,120)||null};
      }catch(error){
        return{ok:false,status:'UNAVAILABLE',code:error.code||error.message};
      }
    },
    emitLog:async row=>{await call('emit_log',row);return{ok:true};},
    emitMetric:async row=>{await call('emit_metric',row);return{ok:true};},
    queryLogs:async query=>{
      const result=await call('query_logs',query);
      return{ok:true,rows:Array.isArray(result?.rows)?result.rows:[]};
    },
    queryMetrics:async query=>{
      const result=await call('query_metrics',query);
      return{ok:true,rows:Array.isArray(result?.rows)?result.rows:[]};
    },
    deleteTestData:async({trace_id})=>{
      await call('delete_test_data',{trace_id:clean(trace_id,240)});
      return{ok:true};
    },
  });
}
