import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('memory UI exposes ShardVault target discovery directly', async () => {
  const response = await onRequestGet();
  const html = await response.text();
  assert.match(html, /Chercher des cibles de sauvegarde/);
  assert.match(html, /id="shardVaultSnapshot"/);
  assert.match(html, /Sauvegarder maintenant/);
  assert.match(html, /\/api\/gen2\/shardvault\/snapshot/);
  assert.match(html, /id="shardVaultSearch"/);
  assert.match(html, /\/api\/gen2\/shardvault\/search/);
  assert.match(html, /href="\/shardvault"/);
});
