import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { ROADMAP_RECERTIFICATION_PROFILES } from '../src/roadmap/runtime-recertification.js';
import { ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';

const sha = 'a'.repeat(40);
const capability = ROADMAP_RECERTIFICATION_PROFILES['MEL-CHAT-04'];

test('MEL-CHAT-04 uses the real reader at the deployed SHA, returns only provenance, and rejects inverted lines', async () => {
  const reads = [];
  const bus = createDefaultCapabilityBus({
    env: { MEL_DEPLOYED_GIT_SHA: sha },
    repository: 'owner/repo',
    fetchImpl: async request => {
      const url = new URL(request);
      assert.equal(url.pathname, '/repos/owner/repo/contents/src/capabilities/github-code-capabilities.js');
      assert.equal(url.searchParams.get('ref'), sha);
      reads.push(url);
      return Response.json({
        type: 'file', sha: 'b'.repeat(40), encoding: 'base64',
        content: Buffer.from('one\ntwo\nthree\nfour\nfive\nsix').toString('base64'),
      });
    },
  });
  assert.deepEqual(ROADMAP_PROOF_SOURCES['MEL-CHAT-04'].capabilities, [capability]);
  const result = await bus.execute(capability, {}, { owner: 'mel-autonomy', permissions: [] });
  assert.deepEqual(result, { ok: true, source_ref: sha });
  assert.equal(reads.length, 1, 'the invalid range must not fetch any source');
});

test('the recipe refuses an absent deployment identity and an incomplete GitHub read', async () => {
  const withoutSha = createDefaultCapabilityBus({
    fetchImpl: async () => assert.fail('no network without a deployed SHA'),
  });
  await assert.rejects(withoutSha.execute(capability, {}, { owner: 'mel-autonomy', permissions: [] }), { code: 'CODE_PROOF_DEPLOYMENT_REQUIRED' });

  const unavailable = createDefaultCapabilityBus({
    env: { MEL_DEPLOYED_GIT_SHA: sha },
    fetchImpl: async () => new Response(null, { status: 404 }),
  });
  await assert.rejects(unavailable.execute(capability, {}, { owner: 'mel-autonomy', permissions: [] }), { code: 'CODE_READ_FAILED' });
});
