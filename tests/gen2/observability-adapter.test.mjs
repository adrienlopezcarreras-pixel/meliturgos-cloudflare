import test from 'node:test';
import assert from 'node:assert/strict';
import { ObservabilityAdapter, proveObservabilityAdapter } from '../../src/portability/observability-adapter.js';

function obs({metricReadable=true}={}){
  const logs=[];const metrics=[];
  return new ObservabilityAdapter({
    id:'obs.alt',
    provider:'alternate-observability',
    health:async()=>({ok:true}),
    emitLog:async row=>{logs.push(row);return{ok:true};},
    emitMetric:async row=>{metrics.push(row);return{ok:true};},
    queryLogs:async({trace_id})=>({ok:true,rows:logs.filter(x=>x.trace_id===trace_id)}),
    queryMetrics:async({trace_id})=>({ok:true,rows:metricReadable?metrics.filter(x=>x.trace_id===trace_id):[]}),
    deleteTestData:async({trace_id})=>{
      for(let i=logs.length-1;i>=0;i--)if(logs[i].trace_id===trace_id)logs.splice(i,1);
      for(let i=metrics.length-1;i>=0;i--)if(metrics[i].trace_id===trace_id)metrics.splice(i,1);
      return{ok:true};
    },
  });
}

test('provider-neutral observability proof covers logs metrics and readback',async()=>{
  const result=await proveObservabilityAdapter(obs());
  assert.equal(result.ok,true);
  assert.equal(result.status,'OBSERVABILITY_ADAPTER_VERIFIED');
  assert.equal(result.log_read,true);
  assert.equal(result.metric_read,true);
});

test('observability proof rejects telemetry backend that cannot read back metrics',async()=>{
  const result=await proveObservabilityAdapter(obs({metricReadable:false}));
  assert.equal(result.ok,false);
  assert.equal(result.status,'OBSERVABILITY_METRIC_READ_FAILED');
});
