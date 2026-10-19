import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash, createHmac, hkdfSync } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { __shardvaultTest, getVerifiedShardVaultCodeArchive } from '../src/continuity/shardvault-runtime.js';
import { stableStringify } from '../src/resilience/recovery-bundle.js';
import { isReleaseSmokeRequest } from '../src/core/security.js';

function fixture(localMode = 'unavailable') {
  const sha = 'a'.repeat(40);
  const master = Buffer.alloc(32, 7); // Synthetic test secret, never a deployment key.
  const snapshotId = 'test-code-snapshot';
  const archive = gzipSync('A real compressed code archive delivered from authenticated shards.');
  const derive = (salt, info) => Buffer.from(hkdfSync('sha256', master, Buffer.from(salt), Buffer.from(info), 32));
  const mac = (key, value) => createHmac('sha256', key).update(value).digest('base64url');
  const iv = Buffer.alloc(12, 9);
  const aes = createCipheriv('aes-256-gcm', derive(snapshotId, 'MEL-ShardVault/v1/aes-gcm'), iv);
  aes.setAAD(Buffer.from(snapshotId));
  const cipher = Buffer.concat([aes.update(archive), aes.final(), aes.getAuthTag()]);
  const shardSize = Math.ceil(cipher.length / 4);
  const padded = Buffer.alloc(shardSize * 4);
  cipher.copy(padded);
  const shards = __shardvaultTest.encode(Array.from({ length: 4 }, (_, index) => padded.subarray(index * shardSize, (index + 1) * shardSize)), 7);
  const endpoints = shards.map((_, index) => ({ id: 'storage-' + index, urlTemplate: `https://storage-${index}.example.org/{objectId}` }));
  const shardMacKey = derive(snapshotId, 'MEL-ShardVault/v1/code-shard-mac');
  const manifest = {
    format: 'MEL-ShardVault-Code', formatVersion: 2, git_sha: sha,
    archive_key: 'local-copy.tar.gz', snapshotId, totalShards: 7, dataShards: 4,
    replicationMode: 'RS_4_OF_7', shardSize, ciphertextLength: cipher.length,
    archiveBytes: archive.length, iv: iv.toString('base64url'),
    sha256: createHash('sha256').update(archive).digest('hex'),
    shards: shards.map((value, index) => ({ index, endpointId: endpoints[index].id,
      objectId: String(index), mac: mac(shardMacKey, Buffer.concat([Buffer.from(`${snapshotId}:${index}:`), value])) })),
  };
  manifest.manifestMac = mac(derive(sha, 'MEL-ShardVault/v1/code-manifest-mac'), stableStringify(manifest));
  let localReads = 0;
  const fetched = [];
  const env = {
    MEL_SHARDVAULT_ENABLED: 'true', MEL_RECOVERY_KEY: master.toString('base64url'),
    MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_PUBLIC_ENDPOINTS_JSON: JSON.stringify(endpoints),
    MEL_INVENTORY_APPEND_URL: 'https://inventory.example.org/append',
    MEL_INVENTORY_LIST_URL: 'https://inventory.example.org/list',
    MEDIA_BUCKET: { async get(key) {
      if (key.endsWith(`/${sha}.json`)) return { async text() { return JSON.stringify(manifest); } };
      assert.equal(key, 'local-copy.tar.gz');
      localReads += 1;
      if (localMode === 'unavailable') throw new Error('R2 unavailable');
      return { async arrayBuffer() { return localMode === 'different' ? gzipSync('different archive') : archive; } };
    } },
  };
  return { env, sha, archive, manifest, fetched, localReads: () => localReads,
    async fetch(url) {
      const index = Number(new URL(url).pathname.slice(1));
      fetched.push(index);
      return new Response(shards[index]);
    } };
}

async function withFixture(options, fn) {
  const f = fixture(options);
  const previousFetch = globalThis.fetch;
  const previousSha = globalThis.MEL_DEPLOYED_GIT_SHA;
  globalThis.fetch = f.fetch;
  globalThis.MEL_DEPLOYED_GIT_SHA = f.sha;
  try { await fn(f); }
  finally { globalThis.fetch = previousFetch; globalThis.MEL_DEPLOYED_GIT_SHA = previousSha; }
}

test('actual encrypted RS reconstruction still delivers its bytes when the optional R2 archive read throws', async () => {
  await withFixture('unavailable', async f => {
    const result = await getVerifiedShardVaultCodeArchive(f.env);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(Buffer.from(result.bytes), f.archive);
    assert.equal(result.local_copy_status, 'UNAVAILABLE');
    assert.equal(result.local_copy_checked, false);
    assert.equal(f.localReads(), 1);
  });
});

test('loss-of-three delivery reads only the four external fragments and never the local archive', async () => {
  await withFixture('different', async f => {
    const result = await getVerifiedShardVaultCodeArchive(f.env, { dropIndexes: [0, 2, 5], checkLocalCopy: false });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(Buffer.from(result.bytes), f.archive);
    assert.equal(result.sha256, f.manifest.sha256);
    assert.equal(result.source_sha, f.sha);
    assert.equal(result.local_copy_status, 'SKIPPED');
    assert.deepEqual(f.fetched.sort(), [1, 3, 4, 6]);
    assert.equal(f.localReads(), 0);
  });
});

test('a readable mismatching local control and a tampered signed manifest remain refused', async () => {
  await withFixture('different', async f => {
    assert.equal((await getVerifiedShardVaultCodeArchive(f.env)).status, 'CODE_ARCHIVE_LOCAL_EXTERNAL_HASH_MISMATCH');
  });
  await withFixture('unavailable', async f => {
    f.manifest.sha256 = '0'.repeat(64);
    const result = await getVerifiedShardVaultCodeArchive(f.env, { checkLocalCopy: false });
    assert.equal(result.ok, false);
    assert.equal(result.verification.status, 'CODE_MANIFEST_MAC_INVALID');
    assert.equal(f.fetched.length, 0);
    assert.equal(f.localReads(), 0);
  });
});

test('the per-deployment proof key permits reconstruction but cannot activate, upload or change ShardVault', () => {
  const env = { MEL_PARALLEL_PROOF_TOKEN: 'p'.repeat(40) };
  const make = path => new Request('https://mel.test' + path, { method: 'POST', headers: {
    'x-mel-release-smoke': '1', 'x-mel-parallel-proof': env.MEL_PARALLEL_PROOF_TOKEN,
  } });
  assert.equal(isReleaseSmokeRequest(make('/api/gen2/shardvault/code-reconstruct'), env), true);
  for (const suffix of ['activate', 'preference', 'code-source', 'code-sync']) {
    assert.equal(isReleaseSmokeRequest(make('/api/gen2/shardvault/' + suffix), env), false);
  }
});
