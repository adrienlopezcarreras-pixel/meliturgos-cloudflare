import test from 'node:test';
import assert from 'node:assert/strict';
import { handleShardVaultStatus } from '../src/pages/shardvault-status.js';

test('ShardVault page owns the single Internet discovery control', async () => {
  const response = await handleShardVaultStatus(new Request('https://example.test/shardvault'), {});
  const html = await response.text();
  assert.match(html, /id="search"/);
  assert.match(html, /Nouvelle recherche Internet/);
  assert.match(html, /Sources Internet parcourues/);
  assert.match(html, /Nouvelles pistes trouvées/);
});
