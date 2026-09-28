import test from 'node:test';
import assert from 'node:assert/strict';
import { SecretStoreAdapter, proveSecretStoreAdapter } from '../../src/portability/secret-store-adapter.js';

function store({leak=false}={}){
  const map=new Map();
  return new SecretStoreAdapter({
    id:'secret.alt',
    provider:'alternate-secret-store',
    health:async()=>({ok:true}),
    putRef:async({ref,metadata})=>{map.set(ref,{ref,metadata,version:1});return leak?{ok:true,ref,secret_value:'sk-exampleleak'}:{ok:true,ref,version:1};},
    getRef:async({ref})=>map.has(ref)?{ok:true,...map.get(ref)}:{ok:false,status:'NOT_FOUND'},
    listRefs:async({prefix})=>({ok:true,refs:[...map.values()].filter(x=>x.ref.startsWith(prefix)).map(x=>({ref:x.ref,version:x.version,metadata:x.metadata}))}),
    rotateRef:async({ref})=>{const row=map.get(ref);if(!row)return{ok:false};row.version++;return{ok:true,ref,version:row.version};},
    deleteRef:async({ref})=>{map.delete(ref);return{ok:true};},
  });
}

test('secret store proof validates metadata/reference lifecycle without plaintext export',async()=>{
  const result=await proveSecretStoreAdapter(store());
  assert.equal(result.ok,true);
  assert.equal(result.status,'SECRET_STORE_ADAPTER_VERIFIED');
  assert.equal(result.metadata_only,true);
  assert.equal(result.plaintext_secret_export,false);
});

test('secret-shaped value leaking from provider proof is rejected',async()=>{
  const result=await proveSecretStoreAdapter(store({leak:true}));
  assert.equal(result.ok,false);
  assert.equal(result.status,'SECRET_STORE_REF_WRITE_FAILED');
});
