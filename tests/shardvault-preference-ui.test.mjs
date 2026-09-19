import test from 'node:test';
import assert from 'node:assert/strict';
import { handleShardVaultStatus } from '../src/pages/shardvault-status.js';
import fs from 'node:fs';

test('ShardVault exposes new search and validated activation controls', async () => {
  const response=await handleShardVaultStatus(new Request('https://example.test/shardvault'),{});
  const html=await response.text();
  assert.match(html,/Nouvelle recherche Internet/);
  assert.match(html,/Utiliser ce dépôt/);
  assert.match(html,/\/api\/gen2\/shardvault\/activate/);
  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/PREFERRED_ENDPOINT_KEY/);
  assert.match(runtime,/ENDPOINT_NOT_VALIDATED/);
  assert.match(runtime,/ACTIVATION_NOT_USED/);
  assert.match(runtime,/endpointMeetsDurability/);
});


test('ShardVault UI distinguishes seven external targets from internal fallbacks and exposes code sync', async () => {
  const response=await handleShardVaultStatus(new Request('https://example.test/shardvault'),{});
  const html=await response.text();
  assert.match(html,/Dépôts externes actifs/);
  assert.match(html,/Fallbacks internes · hors quota 7\/7/);
  assert.match(html,/Copie ShardVault externe/);
  assert.match(html,/\/api\/gen2\/shardvault\/code-sync/);
  const page=fs.readFileSync(new URL('../src/pages/shardvault-status.js',import.meta.url),'utf8');
  assert.match(page,/syncShardVaultCodeExternally/);
  assert.match(page,/externalSelected=allSelected\.filter\(e=>e\.backend==='http'\)/);
});


test('ShardVault code sync route is wired', async () => {
  const response=await handleShardVaultStatus(new Request('https://example.test/api/gen2/shardvault/code-sync',{method:'POST'}),{});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.enabled,false);
});


test('ShardVault UI uses snapshot-proven active endpoints as the only activation truth', async () => {
  const page=fs.readFileSync(new URL('../src/pages/shardvault-status.js',import.meta.url),'utf8');
  assert.match(page,/actualActiveIds=\(d\.selected_endpoints\|\|\[\]\)\.filter\(e=>e\.backend==='http'&&e\.active===true\)\.map\(e=>e\.id\)/);
  assert.doesNotMatch(page,/renderDiscovery\(d\.last_discovery[^\n]*active_external_registry/);
  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/reconcileActiveExternalEndpoints/);
  assert.match(runtime,/externalEndpointsFromSnapshot/);
});
