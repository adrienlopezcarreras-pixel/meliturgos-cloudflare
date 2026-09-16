import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertReleaseIdentity,
  stableVersionId,
  uploadedVersionId,
} from '../scripts/gen2-53-release-guard.mjs';

test('GEN2-53 extracts the sole 100% production version', () => {
  assert.equal(stableVersionId({ versions: [{ version_id: 'stable-v1', percentage: 100 }] }), 'stable-v1');
  assert.equal(stableVersionId({ deployment: { versions: [{ version_id: 'stable-v2', percentage: 100 }] } }), 'stable-v2');
  assert.equal(stableVersionId([{ versions: [{ version_id: 'stable-v3', percentage: 100 }] }]), 'stable-v3');
});

test('GEN2-53 refuses to overlap an existing gradual deployment', () => {
  assert.throws(
    () => stableVersionId({ versions: [
      { version_id: 'old', percentage: 90 },
      { version_id: 'new', percentage: 10 },
    ] }),
    /exactly one production version at 100%/,
  );
});

test('GEN2-53 refuses ambiguous or incomplete production state', () => {
  assert.throws(() => stableVersionId({ versions: [] }), /exactly one production version at 100%/);
  assert.throws(() => stableVersionId({ versions: [{ version_id: 'v1', percentage: 99 }] }), /exactly one production version at 100%/);
});

test('GEN2-53 extracts uploaded version id from Wrangler structured output', () => {
  const ndjson = [
    JSON.stringify({ type: 'wrangler-session', version: 1 }),
    JSON.stringify({ type: 'version-upload', version_id: 'candidate-v1', preview_urls: [] }),
  ].join('\n');
  assert.equal(uploadedVersionId(ndjson), 'candidate-v1');
});

test('GEN2-53 fails closed when Wrangler upload evidence is missing', () => {
  assert.throws(() => uploadedVersionId('{"type":"wrangler-session"}\n'), /version-upload/);
});

test('GEN2-53 accepts only the exact current canonical SHA on the release branch', () => {
  assert.equal(assertReleaseIdentity({
    releaseSha: 'abc123',
    canonicalSha: 'abc123',
    branch: 'release/gen2-53-canary',
  }), true);

  assert.throws(() => assertReleaseIdentity({
    releaseSha: 'old123',
    canonicalSha: 'new456',
    branch: 'release/gen2-53-canary',
  }), /must equal the current canonical candidate SHA/);

  assert.throws(() => assertReleaseIdentity({
    releaseSha: 'abc123',
    canonicalSha: 'abc123',
    branch: 'roadmap/gen2-53-canary-rollback',
  }), /must run from release\/gen2-53-canary/);
});
