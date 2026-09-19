import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

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
