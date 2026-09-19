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
