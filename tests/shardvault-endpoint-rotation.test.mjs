import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { __shardvaultTest } from '../src/continuity/shardvault-runtime.js';

function endpoint(id, operator = id, provider = id) {
  return {
    id,
    operatorDomain: operator,
    providerId: provider,
    expectedRetentionDays: 365,
    score: 100,
    confidence: 100,
  };
}

test('ShardVault identifies the exact endpoint behind an HTTP write failure', () => {
  assert.equal(
    __shardvaultTest.shardVaultWriteFailureEndpoint('WRITE_pastegg-public_403'),
    'pastegg-public',
  );
  assert.equal(
    __shardvaultTest.shardVaultWriteFailureEndpoint(new Error('WRITE_markdownpaste-public_503')),
    'markdownpaste-public',
  );
  assert.equal(
    __shardvaultTest.shardVaultWriteFailureEndpoint('CODE_FRAGMENT_DEADLINE_EXCEEDED'),
    null,
  );
});

test('ShardVault rotates a dead active endpoint out before retrying a staged replacement', () => {
  const current = [
    endpoint('pastehtml-public'),
    endpoint('pastebin-ai-public'),
    endpoint('pastebox-anonymous'),
    endpoint('pastegg-public'),
  ];
  const replacement = endpoint('new-durable-public');
  const staged = [...current, replacement];

  const rotated = __shardvaultTest.rotateActiveEndpointsForWriteFailure(
    current,
    staged,
    'WRITE_pastegg-public_403',
    { limit: 7, maxPerOperator: 2, maxPerProvider: 2 },
  );

  assert.equal(rotated.failedEndpointId, 'pastegg-public');
  assert.equal(rotated.changed, true);
  assert.deepEqual(
    rotated.endpoints.map(row => row.id),
    ['pastehtml-public', 'pastebin-ai-public', 'pastebox-anonymous', 'new-durable-public'],
  );
  assert.equal(rotated.endpoints.some(row => row.id === 'pastegg-public'), false);
});

test('ShardVault leaves the staged set unchanged for non-write failures', () => {
  const current = [endpoint('a'), endpoint('b')];
  const staged = [...current, endpoint('c')];
  const rotated = __shardvaultTest.rotateActiveEndpointsForWriteFailure(
    current,
    staged,
    'NETWORK_TIMEOUT',
  );
  assert.equal(rotated.failedEndpointId, null);
  assert.equal(rotated.changed, false);
  assert.deepEqual(rotated.endpoints.map(row => row.id), ['a', 'b', 'c']);
});

test('ShardVault endpoint exclusion removes a failed target from both selected and candidate pools', () => {
  const config = {
    allEndpoints: [endpoint('a'), endpoint('dead'), endpoint('b')],
    endpoints: [endpoint('dead'), endpoint('a')],
    k: 4,
    n: 7,
  };
  const filtered = __shardvaultTest.excludeShardVaultEndpoints(config, ['dead']);
  assert.deepEqual(filtered.allEndpoints.map(row => row.id), ['a', 'b']);
  assert.deepEqual(filtered.endpoints.map(row => row.id), ['a']);
  assert.equal(config.allEndpoints.length, 3, 'input config remains immutable');
});

test('bounded discovery retry is wired to replace a failed active endpoint without lowering 7x target', async () => {
  const runtime = await readFile(new URL('../src/continuity/shardvault-runtime.js', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');

  assert.match(runtime, /retryActivationAfterWriteFailure/);
  assert.match(runtime, /excludeEndpointIds:\[rotation\.failedEndpointId\]/);
  assert.match(runtime, /recovered_write_failure:true/);
  assert.match(runtime, /replaced_endpoint_id:rotation\.failedEndpointId/);
  assert.match(workflow, /PRODUCTION_SHARDVAULT_ACTIVE_EXTERNAL_LT_7/);
  assert.match(workflow, /PRODUCTION_SHARDVAULT_EXTERNAL_LT_7/);
  assert.doesNotMatch(workflow, /active_external_count\|\|0\)<[0-6]/);
});
