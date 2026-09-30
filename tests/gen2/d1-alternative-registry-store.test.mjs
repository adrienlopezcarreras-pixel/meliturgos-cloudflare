import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlternativeRegistry } from '../../src/portability/prevalidated-alternative-registry.js';
import { D1AlternativeRegistryStore } from '../../src/portability/d1-alternative-registry-store.js';

function fakeDb(){
  let row=null;
  return {
    prepare(sql){
      return {
        bind(...args){
          return {
            async run(){
              if(/INSERT INTO mel_alternative_registry/i.test(sql)){
                row={registry_json:args[1],updated_at:args[2]};
              }
              return {success:true};
            },
            async first(){
              if(/SELECT registry_json/i.test(sql)) return row;
              return null;
            },
          };
        },
        async run(){return {success:true};},
      };
    },
  };
}

const proof={
  isolated_test:true,smoke:true,rollback:true,export:true,import:true,activate:true,
  verified_at:'2026-09-28T17:00:00.000Z',
  expires_at:'2026-10-28T17:00:00.000Z',
  evidence_ref:'ci://proof',
  source_sha:'a'.repeat(40),
};

test('D1 alternative registry survives save/load round trip',async()=>{
  const db=fakeDb();
  const store=new D1AlternativeRegistryStore(db);
  const registry=createAlternativeRegistry([
    {id:'ai.alt',layer:'ai',provider:'alt-ai',added_cost_eur:0,proof},
    {id:'git.alt',layer:'source_control',provider:'alt-git',added_cost_eur:0,proof},
  ]);
  const saved=await store.save(registry);
  assert.equal(saved.count,2);
  const loaded=await store.load();
  assert.deepEqual(loaded.all.map(x=>x.id),['ai.alt','git.alt']);
  assert.equal(loaded.layers.ai[0].prevalidated,true);
});

test('empty store loads a valid empty registry',async()=>{
  const store=new D1AlternativeRegistryStore(fakeDb());
  const loaded=await store.load();
  assert.equal(loaded.all.length,0);
  assert.ok(Array.isArray(loaded.layers.runtime));
});
