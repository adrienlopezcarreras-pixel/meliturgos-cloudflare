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

test('ShardVault backs off an HTTP 429 target, then allows it to re-enter the pool', () => {
  const state = { endpoint_failures: {}, failed_endpoint_ids: [] };
  const target = endpoint('msk-paste-public');
  const failedAt = Date.parse('2026-10-02T08:00:00Z');
  const failure = __shardvaultTest.recordCodeTargetFailure(
    state,
    target,
    new Error('WRITE_msk-paste-public_429'),
    failedAt,
  );

  assert.equal(failure.retryable, true);
  assert.equal(failure.permanent, false);
  assert.deepEqual(state.failed_endpoint_ids, []);
  assert.equal(__shardvaultTest.codeTargetAvailableNow(state,target,failedAt+1000), false);
  assert.equal(__shardvaultTest.codeTargetAvailableNow(state,target,Date.parse(failure.retry_after_at)+1), true);
});

test('ShardVault quarantines a repeatedly failing transient endpoint for the current code-sync and forces pool refresh', () => {
  const state = { endpoint_failures: {}, failed_endpoint_ids: [], cycle_quarantined_endpoint_ids: [], code_pool_refresh_forced: false };
  const target = endpoint('msk-paste-public');
  const failedAt = Date.parse('2026-10-02T17:20:00Z');

  const first = __shardvaultTest.recordCodeTargetFailure(
    state,
    target,
    new Error('WRITE_msk-paste-public_429'),
    failedAt,
  );
  assert.equal(first.retryable, true);
  assert.deepEqual(state.cycle_quarantined_endpoint_ids, []);
  assert.equal(state.code_pool_refresh_forced, false);

  const second = __shardvaultTest.recordCodeTargetFailure(
    state,
    target,
    new Error('WRITE_msk-paste-public_429'),
    failedAt + 1000,
  );
  assert.equal(second.retryable, true);
  assert.deepEqual(state.failed_endpoint_ids, [], 'transient endpoint is not permanently quarantined');
  assert.deepEqual(state.cycle_quarantined_endpoint_ids, ['msk-paste-public']);
  assert.equal(state.code_pool_refresh_forced, true);
  assert.equal(
    __shardvaultTest.codeTargetAvailableNow(state, target, Date.parse(second.retry_after_at) + 10 * 60 * 1000),
    false,
    'cycle quarantine prevents the flaky target from re-entering this sync even after backoff',
  );

  __shardvaultTest.clearCodeTargetFailure(state, target.id);
  assert.deepEqual(state.cycle_quarantined_endpoint_ids, []);
  assert.equal(__shardvaultTest.codeTargetAvailableNow(state, target, failedAt + 60 * 60 * 1000), true);
});

test('ShardVault excludes cycle-quarantined providers from roundtrip fallback candidates', () => {
  const env = { MEL_AUTONOMOUS_MIN_RETENTION_DAYS: '90' };
  const flaky = {
    id: 'msk-paste-public',
    adapter: 'dpaste_b64',
    urlTemplate: 'https://example.test/api/',
    maxBytes: 700000,
    expectedRetentionDays: 365,
    retentionModel: 'fixed',
  };
  const replacement = {
    id: 'replacement-public',
    adapter: 'dpaste_b64',
    urlTemplate: 'https://replacement.example.test/api/',
    maxBytes: 700000,
    expectedRetentionDays: 365,
    retentionModel: 'fixed',
  };
  const state = {
    failed_endpoint_ids: [],
    cycle_quarantined_endpoint_ids: ['msk-paste-public'],
    endpoint_failures: {},
  };
  const candidates = __shardvaultTest.roundtripCodeFallbackCandidates(
    env,
    [flaky, replacement],
    [],
    state,
    new Set(),
    250000,
  );
  assert.deepEqual(candidates.map(row => row.id), ['replacement-public']);
});

test('ShardVault retries transient Cloudflare 520-526 provider errors instead of permanently quarantining them', () => {
  for(const status of [520,521,522,523,524,525,526]){
    const state={ endpoint_failures:{}, failed_endpoint_ids:[] };
    const target=endpoint('edge-transient-'+status);
    const failedAt=Date.parse('2026-10-02T15:00:00Z');
    const failure=__shardvaultTest.recordCodeTargetFailure(
      state,
      target,
      new Error('WRITE_'+target.id+'_'+status),
      failedAt,
    );
    assert.equal(failure.retryable,true,'HTTP '+status+' should retry');
    assert.equal(failure.permanent,false,'HTTP '+status+' must not be permanent');
    assert.deepEqual(state.failed_endpoint_ids,[]);
    assert.ok(Date.parse(failure.retry_after_at)>failedAt);
  }
});

test('ShardVault refreshes discovery once every ready code target has already been attempted', () => {
  const candidates=[endpoint('msk-paste-public'),endpoint('telegraph-public')];
  assert.equal(
    __shardvaultTest.codeTargetDiscoveryRefreshNeeded(candidates,{attempted_endpoints:['msk-paste-public']}),
    false,
  );
  assert.equal(
    __shardvaultTest.codeTargetDiscoveryRefreshNeeded(candidates,{attempted_endpoints:['msk-paste-public','telegraph-public']}),
    true,
  );
  assert.equal(
    __shardvaultTest.codeTargetDiscoveryRefreshNeeded([],{attempted_endpoints:[]}),
    true,
  );
});

test('bounded discovery retry preserves the 7x target while allowing a 5-of-7 release quorum', async () => {
  const runtime = await readFile(new URL('../src/continuity/shardvault-runtime.js', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');

  assert.match(runtime, /retryActivationAfterWriteFailure/);
  assert.match(runtime, /excludeEndpointIds:\[rotation\.failedEndpointId\]/);
  assert.match(runtime, /recovered_write_failure:true/);
  assert.match(runtime, /replaced_endpoint_id:rotation\.failedEndpointId/);
  assert.match(workflow, /PRODUCTION_SHARDVAULT_ACTIVE_EXTERNAL_LT_RELEASE_QUORUM/);
  assert.match(workflow, /PRODUCTION_SHARDVAULT_EXTERNAL_LT_RELEASE_QUORUM/);
  assert.match(workflow, /SHARD_RELEASE_QUORUM=5/);
  assert.match(workflow, /PRODUCTION_EXTERNAL_CODE_RECONSTRUCTION_NOT_VERIFIED/);
  assert.match(runtime, /await writeCodeSyncState\(env,id,state\);[\s\S]{0,1400}discoverAutonomousRepositories\(env,/);
  assert.match(runtime, /selectionCount:1,/);
  assert.match(runtime, /probeLimit:2,/);
});


test('ShardVault can self-qualify a fresh durable code candidate through the exact shard roundtrip', () => {
  const env = { MEL_AUTONOMOUS_MIN_RETENTION_DAYS: '90' };
  const fresh = {
    id: 'fresh-code-target',
    adapter: 'dpaste_b64',
    urlTemplate: 'https://example.test/api/',
    maxBytes: 700000,
    expectedRetentionDays: 365,
    retentionModel: 'fixed',
    probeLatencyMs: 25,
  };
  const active = {
    id: 'used-active-target',
    adapter: 'dpaste_b64',
    urlTemplate: 'https://active.example.test/api/',
    maxBytes: 700000,
    expectedRetentionDays: 365,
    retentionModel: 'fixed',
    probeLatencyMs: 10,
  };
  const state = { failed_endpoint_ids: [], endpoint_failures: {} };
  const candidates = __shardvaultTest.roundtripCodeFallbackCandidates(
    env,
    [fresh],
    [active],
    state,
    new Set(['used-active-target']),
    250000,
  );

  assert.deepEqual(candidates.map(row => row.id), ['fresh-code-target']);
});

test('ShardVault roundtrip fallback still excludes quarantined discovered candidates', () => {
  const env = { MEL_AUTONOMOUS_MIN_RETENTION_DAYS: '90' };
  const failed = {
    id: 'failed-fresh-target',
    adapter: 'dpaste_b64',
    urlTemplate: 'https://failed.example.test/api/',
    maxBytes: 700000,
    expectedRetentionDays: 365,
    retentionModel: 'fixed',
  };
  const state = { failed_endpoint_ids: ['failed-fresh-target'], endpoint_failures: {} };
  const candidates = __shardvaultTest.roundtripCodeFallbackCandidates(
    env,
    [failed],
    [],
    state,
    new Set(),
    250000,
  );

  assert.deepEqual(candidates, []);
});
