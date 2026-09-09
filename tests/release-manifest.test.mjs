import test from 'node:test';
import assert from 'node:assert/strict';
import { createReleaseManifest, verifyReleaseManifest } from '../src/security/release-manifest.js';

test('release manifest verifies exact approved candidate identity', async () => {
  const manifest = await createReleaseManifest({
    commit: 'abc123',
    branch: 'candidate/augmentio-core',
    lockfileHash: 'lock123',
    schemaVersion: '3',
    configVersion: 'augmentio-1',
    artifacts: [{ path: 'worker.js', sha256: 'deadbeef' }],
    healthChecks: ['/health','/api/chat'],
  });
  const verified = await verifyReleaseManifest(manifest);
  assert.equal(verified.ok, true);
  assert.equal(verified.commit, 'abc123');
  assert.equal(verified.branch, 'candidate/augmentio-core');
});

test('tampered release manifest is rejected deterministically', async () => {
  const manifest = await createReleaseManifest({ commit: 'abc123', branch: 'candidate/augmentio-core' });
  const tampered = { ...manifest, commit: 'later-commit' };
  const verified = await verifyReleaseManifest(tampered);
  assert.equal(verified.ok, false);
  assert.equal(verified.code, 'MANIFEST_TAMPERED');
});
