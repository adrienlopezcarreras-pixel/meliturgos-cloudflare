import test from 'node:test';
import assert from 'node:assert/strict';
import { probeLowRefusalAdapter } from '../../src/portability/ai-low-refusal-probe.js';

test('low-refusal profile is granted only when all benign controversial probes are answered',async()=>{
  const adapter={invoke:async({input})=>({text:'Direct answer: '+input.slice(0,40)})};
  const result=await probeLowRefusalAdapter(adapter);
  assert.equal(result.ok,true);
  assert.equal(result.passed_count,result.probe_count);
  assert.equal(result.profile,'LOW_REFUSAL_BENIGN_CONTROVERSIAL');
});

test('generic refusal prevents low-refusal certification',async()=>{
  let count=0;
  const adapter={invoke:async()=>{
    count++;
    return {text:count===2?"I'm unable to help with that":'Direct answer'};
  }};
  const result=await probeLowRefusalAdapter(adapter);
  assert.equal(result.ok,false);
  assert.equal(result.passed_count,result.probe_count-1);
  assert.equal(result.results.some(x=>x.refused===true),true);
});

test('provider error also prevents low-refusal certification',async()=>{
  const adapter={invoke:async()=>{throw Object.assign(new Error('provider down'),{code:'HTTP_503'});}};
  const result=await probeLowRefusalAdapter(adapter);
  assert.equal(result.ok,false);
  assert.equal(result.passed_count,0);
});
