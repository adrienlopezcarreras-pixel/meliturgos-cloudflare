import test from 'node:test';
import assert from 'node:assert/strict';
import { monitorExternalHealth, validateExternalHealthUrl, probeExternalHealth } from '../src/continuity/external-health-monitor.js';

const url = 'https://mel.example.net/health';
const fake = results => async () => {
  const value = results.shift();
  if (value === 'error') throw Error('network refused');
  return { status: value, text: async () => 'MEL OK' };
};
const options = {url, sleep:async()=>{}, delayMs:0};
test('monitor rejects secret-bearing URLs, local targets and plain HTTP', () => {
  for (const target of ['http://mel.example.net','https://user:pw@mel.example.net','https://localhost/','https://127.0.0.1/','https://mel.example.net?token=secret']) {
    assert.equal(validateExternalHealthUrl(target),false,target);
  }
  assert.equal(validateExternalHealthUrl(url),true);
});
test('a majority of failed probes confirms external outage without triggering failover',async()=>{
  const result=await monitorExternalHealth({...options,fetchImpl:fake([503,'error',200])});
  assert.equal(result.status,'DOWN');
  assert.equal(result.code,'OUTAGE_QUORUM');
  assert.equal(result.failover_performed,false);
  assert.equal(result.samples.length,3);
});
test('a majority of healthy probes confirms reachability but not service dependencies',async()=>{
  const result=await monitorExternalHealth({...options,fetchImpl:fake([200,503,200])});
  assert.equal(result.status,'UP');
  assert.equal(result.failover_performed,false);
});
test('authentication redirects and missing markers stay unknown, not a diagnosed outage',async()=>{
  const result=await monitorExternalHealth({...options,fetchImpl:fake([302,403,200])});
  assert.equal(result.status,'UNKNOWN');
  assert.equal((await probeExternalHealth(url,{fetchImpl:fake([200]),expectedText:'NOT_IN_BODY'})).status,'UNKNOWN');
});
test('oversized external health bodies fail safely instead of being fully buffered',async()=>{
  const response=await probeExternalHealth(url,{
    fetchImpl:async()=>new Response('MEL OK'+'x'.repeat(65*1024),{status:200}),
    expectedText:'MEL OK',
  });
  assert.equal(response.status,'UNKNOWN');
  assert.equal(response.code,'HEALTH_BODY_TOO_LARGE');
});
test('split UTF-8 markers are recognized within the bounded streaming body',async()=>{
  const marker='MEL santé prêt';
  const data=new TextEncoder().encode(marker);
  const stream=new ReadableStream({start(controller){
    for(let i=0;i<data.length;i+=2)controller.enqueue(data.subarray(i,i+2));
    controller.close();
  }});
  const response=await probeExternalHealth(url,{
    fetchImpl:async()=>new Response(stream,{status:200}),expectedText:marker,
  });
  assert.equal(response.status,'UP');
});
test('malformed UTF-8 in the health body remains UNKNOWN, never an outage vote',async()=>{
  const response=await probeExternalHealth(url,{
    fetchImpl:async()=>new Response(Uint8Array.from([0xc3,0x28]),{status:200}),
    expectedText:'MEL OK',
  });
  assert.equal(response.status,'UNKNOWN');
  assert.equal(response.code,'HEALTH_BODY_UNREADABLE');
});

test('no configured URL is never marked green',async()=>{
  const result=await monitorExternalHealth({url:''});
  assert.equal(result.status,'UNKNOWN');
  assert.equal(result.samples.length,0);
});
