import test from 'node:test';
import assert from 'node:assert/strict';
import { handleShardVaultStatus } from '../src/pages/shardvault-status.js';

test('ShardVault status page is phone-safe', async () => {
  const response = await handleShardVaultStatus(new Request('https://example.test/shardvault'), {});
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1"/);
  assert.match(html, /@media\(max-width:640px\)/);
  assert.match(html, /\.toolbar\{display:grid;grid-template-columns:1fr/);
  assert.match(html, /\.row\{display:grid;grid-template-columns:1fr/);
  assert.match(html, /overflow-x:hidden/);
  assert.match(html, /word-break:break-word/);
});
