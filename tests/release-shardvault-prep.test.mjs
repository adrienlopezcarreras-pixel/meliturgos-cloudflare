import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isReleaseSmokeRequest } from '../src/core/security.js';

const token='s'.repeat(64);
const env={MEL_LAUNCH_BOOTSTRAP_TOKEN:token};

function request(path,{method='GET',supplied=token,smoke='1'}={}){
  return new Request('https://mel.test'+path,{
    method,
    headers:{
      'x-mel-release-smoke':smoke,
      'x-mel-launch-bootstrap':supplied,
      ...(method==='POST'?{'content-type':'application/json'}:{}),
    },
    ...(method==='POST'?{body:'{}'}:{}),
  });
}

test('release smoke can prepare ShardVault only on exact status/search paths',()=>{
  assert.equal(isReleaseSmokeRequest(request('/api/gen2/shardvault/status'),env),true);
  assert.equal(isReleaseSmokeRequest(request('/api/gen2/shardvault/search',{method:'POST'}),env),true);
  assert.equal(isReleaseSmokeRequest(request('/api/gen2/shardvault/status',{method:'POST'}),env),false);
  assert.equal(isReleaseSmokeRequest(request('/api/gen2/shardvault/search'),env),false);
  assert.equal(isReleaseSmokeRequest(request('/api/gen2/shardvault/activate',{method:'POST'}),env),false);
  assert.equal(isReleaseSmokeRequest(request('/api/gen2/shardvault/search',{method:'POST',supplied:'x'.repeat(64)}),env),false);
});

test('release workflow expands active ShardVault registry before launch bootstrap without lowering 7x gate',async()=>{
  const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  const search=source.indexOf('/api/gen2/shardvault/search');
  const bootstrap=source.indexOf('/api/internal/release-launch-bootstrap');
  assert.ok(search>0);
  assert.ok(bootstrap>search);
  assert.match(source,/seq 1 4/);
  assert.match(source,/active_external_registry/);
  assert.match(source,/active<7/);
  assert.match(source,/PRODUCTION_SHARDVAULT_ACTIVE_EXTERNAL_LT_7/);
  assert.match(source,/PRODUCTION_SHARDVAULT_EXTERNAL_LT_7/);
  assert.doesNotMatch(source,/active_external_count\|\|0\)<3/);
});
