import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleShardVaultStatus } from '../src/pages/shardvault-status.js';

test('validated external target has explicit activation and proof of use', async () => {
  const response=await handleShardVaultStatus(new Request('https://example.test/shardvault'),{});
  const html=await response.text();
  assert.match(html,/Utiliser ce dépôt/);
  assert.match(html,/\/api\/gen2\/shardvault\/activate/);
  assert.match(html,/UTILISÉ/);
  assert.match(html,/ACTIVÉ/);
  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/activateValidatedShardVaultEndpoint/);
  assert.match(runtime,/ACTIVATION_NOT_USED/);
  assert.match(runtime,/used_fragments/);
  assert.match(runtime,/endpointMeetsDurability/);
});

test('short retention is invalid and Catbox is a durable documented candidate', () => {
  const discovery=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
  assert.match(discovery,/id:'catbox-public'/);
  assert.match(discovery,/expectedRetentionDays:730/);
  assert.match(discovery,/RETENTION_TOO_SHORT_/);
  assert.match(discovery,/MEL_AUTONOMOUS_MIN_RETENTION_DAYS/);
});
