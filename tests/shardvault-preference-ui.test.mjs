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
