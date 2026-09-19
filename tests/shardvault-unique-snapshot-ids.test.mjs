import test from 'node:test';
import assert from 'node:assert/strict';
import { handleShardVaultStatus } from '../src/pages/shardvault-status.js';

test('ShardVault snapshot button and snapshot display have unique ids', async () => {
  const response=await handleShardVaultStatus(new Request('https://example.test/shardvault'),{});
  const html=await response.text();
  assert.equal((html.match(/id="snapshotNow"/g)||[]).length,1);
  assert.equal((html.match(/id="snapshotInfo"/g)||[]).length,1);
  assert.equal((html.match(/id="snapshot"/g)||[]).length,0);
  assert.match(html,/\$\('snapshotNow'\)\.onclick=snapshot/);
});
