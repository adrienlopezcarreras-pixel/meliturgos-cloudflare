import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/full-interface-v2.js';
import { handleShardVaultStatus } from '../src/pages/shardvault-status.js';

test('memory UI exposes ShardVault status and manual snapshot without duplicating Internet discovery', async () => {
  const response = await onRequestGet();
  const html = await response.text();
  assert.match(html, /id="shardVaultSnapshot"/);
  assert.match(html, /Sauvegarder maintenant/);
  assert.match(html, /\/api\/gen2\/shardvault\/snapshot/);
  assert.match(html, /href="\/shardvault"/);
  assert.match(html, /Explorer les sauvegardes et Internet/);
  assert.doesNotMatch(html, /id="shardVaultSearch"/);
});

test('ShardVault dedicated status page does not start search or code sync on page load', async () => {
  const response = await handleShardVaultStatus(new Request('https://mel.invalid/shardvault'), {});
  const html = await response.text();
  assert.match(html, /Mode lecture/);
  assert.doesNotMatch(html, /autoRepairStarted|autoCodeSyncStarted/);
  assert.doesNotMatch(html, /setTimeout\(\(\)=>search\(\),250\)/);
  assert.doesNotMatch(html, /setTimeout\(\(\)=>syncCodeExternal/);
  assert.match(html, /\$\('search'\)\.onclick=search/);
});
