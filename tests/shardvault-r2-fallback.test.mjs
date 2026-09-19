import test from 'node:test';
import assert from 'node:assert/strict';
import { getShardVaultStatus, runShardVaultCycle } from '../src/continuity/shardvault-runtime.js';

class FakeR2 {
  constructor(){this.map=new Map();}
  async put(key,value){
    const bytes=typeof value==='string'?new TextEncoder().encode(value):value instanceof Uint8Array?value:new Uint8Array(value);
    this.map.set(key,new Uint8Array(bytes));
    return {key};
  }
  async get(key){
    const bytes=this.map.get(key); if(!bytes)return null;
    return {
      async arrayBuffer(){return bytes.slice().buffer;},
      async text(){return new TextDecoder().decode(bytes);}
    };
  }
  async head(key){const bytes=this.map.get(key);return bytes?{key,size:bytes.length}:null;}
  async list({prefix='',cursor}={}){
    if(cursor)return {objects:[],truncated:false};
    return {objects:[...this.map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false};
  }
}

test('ShardVault bootstraps on private R2 without external endpoint configuration', async () => {
  const env={
    MEL_SHARDVAULT_ENABLED:'true',
    MEL_SHARDVAULT_AUTONOMOUS:'false',
    MELITURGOS_PASSWORD:'test-password-that-is-long-enough-and-stable',
    MEL_VAULT_ID:'test-vault',
    MEL_DATA_SHARDS:'4',
    MEL_TOTAL_SHARDS:'7',
    MEDIA_BUCKET:new FakeR2(),
    DB:null,
  };
  const result=await runShardVaultCycle(env,{force:true});
  assert.equal(result.ok,true);
  assert.equal(result.skipped,false);
  assert.equal(result.storage_mode,'CLOUDFLARE_FALLBACK');
  assert.equal(result.shards,7);
  const status=await getShardVaultStatus(env);
  assert.equal(status.ok,true);
  assert.equal(status.status,'ONLINE');
  assert.equal(status.storage_mode,'CLOUDFLARE_FALLBACK');
  assert.equal(status.selected_endpoints[0].backend,'r2');
  assert.equal(status.health.healthy_shards,7);
});
