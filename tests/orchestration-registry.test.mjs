import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { ModelRouter, classifyTask } from '../src/models/ModelRouter.js';

const auth='Basic '+Buffer.from('adrien:test').toString('base64');

function env(){
  const stmt={
    bind(){return this},
    async run(){return{meta:{changes:1,last_row_id:1}}},
    async first(){return{n:0,quick_check:'ok'}},
    async all(){return{results:[]}}
  };
  return {
    MELITURGOS_USER:'adrien',
    MELITURGOS_PASSWORD:'test',
    DB:{prepare(){return Object.create(stmt)},batch:async()=>[]},
    AI:{async run(){return{response:'ok'}}}
  };
}

async function get(path){
  return worker.fetch(new Request('https://mel.test'+path,{headers:{authorization:auth}}),env(),{});
}

test('canonical capability registry is served by Gen2',async()=>{
  const response=await get('/api/gen2/capabilities');
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.ok(Array.isArray(body.capabilities));
  const ids=body.capabilities.map(row=>row.id);
  for(const id of ['code.read','roadmap.read','evolution.preflight']) assert.ok(ids.includes(id),id);
});

test('one ModelRouter owns current task classification',()=>{
  assert.equal(classifyTask('écris du code JavaScript'),'coding');
  const router=new ModelRouter({invoke:async()=>({response:'ok'})});
  assert.equal(router.normalizeTask('coding'),'CODE');
  assert.equal(router.normalizeTask('reasoning'),'REASONING');
  assert.equal(router.normalizeTask('conversation'),'GENERAL');
});

test('readiness replaces the retired duplicate diagnostic surface',async()=>{
  const response=await get('/api/gen2/readiness');
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.ok(body.capabilities);
  assert.ok(body.bindings);
});
