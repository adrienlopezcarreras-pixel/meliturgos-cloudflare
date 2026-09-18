import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelRegistry, standardRegistry } from '../src/models/ModelRegistry.js';
import { ModelRouter } from '../src/models/ModelRouter.js';

test('ModelRegistry keeps deterministic capability ordering and explicit primary selection',()=>{
  const registry=new ModelRegistry([
    {id:'fast',provider:'test',name:'Fast',capabilities:['GENERAL','CODE'],priority:20,cost:0},
    {id:'deep',provider:'test',name:'Deep',capabilities:['GENERAL','REASONING','CODE'],priority:10,cost:0},
    {id:'other',provider:'test',name:'Other',capabilities:['GENERAL'],priority:1,cost:0},
  ]);
  assert.equal(registry.size(),3);
  assert.equal(registry.getBestByCapability('code').id,'fast');
  registry.setPrimary('CODE','deep');
  assert.equal(registry.getBestByCapability('CODE').id,'deep');
  const chain=registry.getFallbackChain('deep',2);
  assert.equal(chain[0].id,'fast');
  registry.disable('deep');
  assert.equal(registry.getBestByCapability('CODE').id,'fast');
});

test('canonical ModelRouter executes through the selected registry model',async()=>{
  const registry=new ModelRegistry([
    {id:'primary',provider:'test',name:'Primary',capabilities:['CODE'],priority:10,cost:0},
    {id:'secondary',provider:'test',name:'Secondary',capabilities:['CODE'],priority:5,cost:0},
  ]);
  const calls=[];
  const router=new ModelRouter({registry,maxCalls:2,invoke:async model=>{calls.push(model.id);return{response:'réponse réelle de test'};}});
  const result=await router.execute({task:'CODE',messages:[{role:'user',content:'code'}]});
  assert.equal(result.text,'réponse réelle de test');
  assert.equal(result.model,'primary');
  assert.deepEqual(calls,['primary']);
});

test('standard registry keeps current zero-cost model catalog',()=>{
  const ids=new Set(standardRegistry.getAll().map(model=>model.id));
  assert.ok(ids.has('@cf/zai-org/glm-4.7-flash'));
  assert.ok(ids.has('@cf/meta/llama-3.3-70b-instruct-fp8-fast'));
  assert.ok(ids.has('@cf/google/gemma-3-12b-it'));
  assert.ok(ids.has('ninjachat-default'));
  assert.equal(standardRegistry.get('@cf/zai-org/glm-4.7-flash').cost,0);
});
